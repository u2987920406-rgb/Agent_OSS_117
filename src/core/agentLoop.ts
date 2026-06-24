import OpenAI from "openai";
import "dotenv/config";
import { delegateTaskSchema } from "./contract";
import { executeTask } from "./taskExecutor";
import { emitLog, eventBus } from "./eventBus";
import { buildContext } from "./contextBuilder";
import { checkPermission } from "./permissions";

const client = new OpenAI({
  apiKey: process.env.BRAIN_API_KEY || "ollama",
  baseURL: process.env.BRAIN_BASE_URL || "http://localhost:11434/v1"
});
const model = process.env.BRAIN_MODEL || "gemma4:12b";

function buildSystemPrompt(): string {
  return [
    "Tu es l'Orchestrateur Principal d'OSS-117, un OS Agentique.",
    "Tu n'as pas acces a internet ni au systeme de fichiers directement.",
    "Pour accomplir une mission, decompose en etapes et utilise les outils.",
    "",
    buildContext(),
    "",
    "OUTILS:",
    "1. delegate_to_agent: envoie une tache a un agent specialise",
    "   Agents: terminal_executor, code_writer, web_scraper, file_reader, grep_search, glob_search",
    "   - terminal_executor: execute des commandes (dir, git, npm, node, echo, cat, findstr)",
    "   - code_writer: cree un fichier (parameters: filename, content)",
    "   - web_scraper: recupere une page web (parameters: url)",
    "   - file_reader: lit un fichier (parameters: filename)",
    "   - grep_search: cherche du texte (parameters: pattern)",
    "   - glob_search: trouve des fichiers par extension (parameters: pattern)",
    "",
    "2. done: signale que la mission est accomplie (parameters: summary)",
    "",
    "REGLES:",
    "- Une seule tache par appel d'outil",
    "- Tu recevras le resultat de chaque tache, analyse-le avant de continuer",
    "- Si une tache echoue, essaie une autre approche",
    "- Utilise l'outil done quand la mission est complete",
    "- Pour code_writer, mets TOUJOURS le nom du fichier dans parameters.filename et le contenu dans parameters.content"
  ].join("\n");
}

export async function agentLoop(userPrompt: string, maxTurns: number = 20): Promise<string> {
  emitLog("Loop", "info", "Mission: " + userPrompt.substring(0, 60));
  const messages: any[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: userPrompt }
  ];

  for (let turn = 1; turn <= maxTurns; turn++) {
    emitLog("Loop", "info", "Tour " + turn + "/" + maxTurns);

    let response: any;
    try {
      const completion = await client.chat.completions.create({
        model,
        messages,
        tools: [
          { type: "function", function: {
            name: "delegate_to_agent",
            description: "Envoie une tache a un agent specialise",
            parameters: { type: "object", properties: {
              agent_target: { type: "string", enum: ["terminal_executor","web_scraper","code_writer","file_reader","grep_search","glob_search"] },
              action_payload: { type: "object", properties: {
                instruction: { type: "string" },
                parameters: { type: "object", description: "Parametres: filename, content, url, pattern" }
              }, required: ["instruction"] },
              expect_result_type: { type: "string", enum: ["text","json","none"] }
            }, required: ["agent_target","action_payload","expect_result_type"] }
          }},
          { type: "function", function: {
            name: "done",
            description: "Signale que la mission est accomplie",
            parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] }
          }}
        ],
        tool_choice: "auto"
      });
      response = completion.choices[0].message;
    } catch (error: any) {
      emitLog("Loop", "error", "Erreur API: " + error.message);
      return "Erreur: " + error.message;
    }

    // Cas 1: tool calls
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        if (toolCall.function.name === "done") {
          let args: any;
          try { args = JSON.parse(toolCall.function.arguments); } catch { args = { summary: "Mission terminee" }; }
          emitLog("Loop", "info", "Mission accomplie: " + (args.summary || "").substring(0, 100));
          return args.summary || "Mission terminee.";
        }

        if (toolCall.function.name === "delegate_to_agent") {
          let args: any;
          try { args = JSON.parse(toolCall.function.arguments); }
          catch {
            emitLog("Loop", "warn", "JSON invalide du cerveau.");
            messages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Erreur: JSON invalide" });
            continue;
          }

          const validation = delegateTaskSchema.safeParse(args);
          if (!validation.success) {
            emitLog("Loop", "warn", "Tache invalide: " + JSON.stringify(validation.error.format()).substring(0, 100));
            messages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Erreur validation: " + JSON.stringify(validation.error.format()) });
            continue;
          }

          emitLog("Cerveau", "info", "-> " + args.agent_target + ": " + args.action_payload.instruction.substring(0, 60));

          // Permission check (auto pour l'instant)
          const perm = checkPermission(args.agent_target);
          if (perm.needsApproval) {
            emitLog("Permission", "info", "Auto-approuve (mode " + perm.action + ")");
          }

          // Executer
          const result = await executeTask(args.agent_target, args.action_payload);

          // Feed back
          messages.push({
            role: "assistant",
            content: response.content,
            tool_calls: [{ id: toolCall.id, type: "function", function: { name: toolCall.function.name, arguments: toolCall.function.arguments } }]
          });
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: result.substring(0, 8000) });

          emitLog("Loop", "info", "Resultat recu (" + result.length + " chars), continuation...");
        }
      }
      continue;
    }

    // Cas 2: reponse texte sans outil
    if (response.content && response.content.trim().length > 0) {
      emitLog("Loop", "info", "Reponse texte du cerveau. Fin.");
      return response.content;
    }

    // Cas 3: reponse vide - relancer avec un prompt
    emitLog("Loop", "warn", "Reponse vide. Relance...");
    messages.push({ role: "assistant", content: "" });
    messages.push({ role: "user", content: "Continue ta mission. Utilise delegate_to_agent ou done." });
    continue;
  }

  emitLog("Loop", "warn", "Limite de " + maxTurns + " tours atteinte.");
  return "Limite de tours atteinte.";
}
