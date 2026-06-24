import OpenAI from "openai";
import "dotenv/config";
import { delegateTaskSchema } from "./contract";
import { executeTask } from "./taskExecutor";
import { emitLog } from "./eventBus";
import { buildContext } from "./contextBuilder";
import { checkPermission } from "./permissions";

const client = new OpenAI({
  apiKey: process.env.BRAIN_API_KEY || "ollama",
  baseURL: process.env.BRAIN_BASE_URL || "http://localhost:11434/v1"
});
const model = process.env.BRAIN_MODEL || "gemma4:12b";

function buildSystemPrompt(): string {
  return [
    "Tu es OSS-117, l Orchestrateur d un OS Agentique.",
    "Tu ne peux rien faire seul. Tu DOIS utiliser les outils pour agir.",
    "",
    buildContext(),
    "",
    "=== OUTILS ===",
    "",
    "1. delegate_to_agent - Envoie une tache a un agent",
    "",
    "AGENTS ET EXEMPLES D UTILISATION:",
    "",
    "--- code_writer: Cree un fichier ---",
    'EXEMPLE: {"agent_target":"code_writer","action_payload":{"instruction":"Cree un fichier hello.ts","parameters":{"filename":"hello.ts","content":"console.log(\'Hello\');"}},"expect_result_type":"text"}',
    "IMPORTANT: Mets TOUJOURS le nom du fichier dans parameters.filename et le contenu dans parameters.content",
    "",
    "--- terminal_executor: Execute une commande ---",
    'EXEMPLE: {"agent_target":"terminal_executor","action_payload":{"instruction":"dir"},"expect_result_type":"text"}',
    "Commandes autorisees: dir, ls, echo, cat, git, npm, node, findstr, curl, mkdir, cp, mv",
    "",
    "--- file_reader: Lit un fichier ---",
    'EXEMPLE: {"agent_target":"file_reader","action_payload":{"instruction":"Lis package.json","parameters":{"filename":"package.json"}},"expect_result_type":"text"}',
    "IMPORTANT: Mets TOUJOURS le nom du fichier dans parameters.filename",
    "",
    "--- web_scraper: Recupere une page web ---",
    'EXEMPLE: {"agent_target":"web_scraper","action_payload":{"instruction":"Scrape https://example.com","parameters":{"url":"https://example.com"}},"expect_result_type":"json"}',
    "IMPORTANT: Mets TOUJOURS l URL dans parameters.url",
    "",
    "--- grep_search: Cherche du texte dans les fichiers ---",
    'EXEMPLE: {"agent_target":"grep_search","action_payload":{"instruction":"Cherche la fonction agentLoop","parameters":{"pattern":"agentLoop"}},"expect_result_type":"text"}',
    "",
    "--- glob_search: Trouve des fichiers par extension ---",
    'EXEMPLE: {"agent_target":"glob_search","action_payload":{"instruction":"Trouve les fichiers .ts","parameters":{"pattern":"\\.ts$"}},"expect_result_type":"text"}',
    "",
    "2. done - Signale la fin de mission",
    'EXEMPLE: {"summary":"J ai cree le fichier et verifie le contenu."}',
    "",
    "=== REGLES ===",
    "1. Une seule tache par appel d outil",
    "2. Tu recevras le resultat de chaque tache - ANALYSE-LE avant de continuer",
    "3. Si une tache echoue, essaie une autre approche",
    "4. REMPLIS TOUJOURS les parameters quand c est necessaire (filename, content, url, pattern)",
    "5. Utilise done quand la mission est complete",
    "6. NEVER respond with just text - ALWAYS use a tool"
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
            description: "Envoie une tache a un agent. REMPLIS parameters avec filename/content/url/pattern selon l agent.",
            parameters: { type: "object", properties: {
              agent_target: { type: "string", enum: ["terminal_executor","code_writer","web_scraper","file_reader","grep_search","glob_search"] },
              action_payload: { type: "object", properties: {
                instruction: { type: "string", description: "Description de la tache" },
                parameters: { type: "object", description: "filename, content, url, pattern selon l agent", properties: {
                  filename: { type: "string" },
                  content: { type: "string" },
                  url: { type: "string" },
                  pattern: { type: "string" }
                } }
              }, required: ["instruction"] },
              expect_result_type: { type: "string", enum: ["text","json","none"], description: "Type de resultat attendu" }
            }, required: ["agent_target","action_payload"] }
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
            messages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Erreur: JSON invalide" });
            continue;
          }
          const validation = delegateTaskSchema.safeParse(args);
          if (!validation.success) {
            messages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Erreur: " + JSON.stringify(validation.error.format()) + ". Reessaie en remplissant tous les champs requis." });
            continue;
          }
          emitLog("Cerveau", "info", "-> " + args.agent_target + ": " + args.action_payload.instruction.substring(0, 60));
          const perm = checkPermission(args.agent_target);
          if (perm.needsApproval) emitLog("Permission", "info", "Auto-approuve (" + perm.action + ")");
          const result = await executeTask(args.agent_target, args.action_payload);
          messages.push({ role: "assistant", content: response.content, tool_calls: [{ id: toolCall.id, type: "function", function: { name: toolCall.function.name, arguments: toolCall.function.arguments } }] });
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: result.substring(0, 8000) });
          emitLog("Loop", "info", "Resultat recu (" + result.length + " chars), continuation...");
        }
      }
      continue;
    }

    if (response.content && response.content.trim().length > 0) {
      emitLog("Loop", "info", "Reponse texte. Fin.");
      return response.content;
    }

    emitLog("Loop", "warn", "Reponse vide. Relance...");
    messages.push({ role: "assistant", content: "" });
    messages.push({ role: "user", content: "Continue. Utilise delegate_to_agent ou done." });
    continue;
  }
  emitLog("Loop", "warn", "Limite de " + maxTurns + " tours atteinte.");
  return "Limite de tours atteinte.";
}
