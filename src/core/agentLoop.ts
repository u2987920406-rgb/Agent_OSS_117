import OpenAI from "openai";
import "dotenv/config";
import { delegateTaskSchema } from "./contract";
import { executeTask } from "./taskExecutor";
import { emitLog } from "./eventBus";
import { buildContext } from "./contextBuilder";
import { checkPermission, requestPermission } from "./permissions";

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
    "1. delegate_to_agent: terminal_executor, code_writer, web_scraper, file_reader, grep_search, glob_search",
    "2. done: signale la fin de mission (summary)",
    "",
    "REGLES: une tache par appel, analyse les resultats, utilise done quand fini."
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
        model, messages,
        tools: [
          { type: "function", function: {
            name: "delegate_to_agent", description: "Envoie une tache a un agent",
            parameters: { type: "object", properties: {
              agent_target: { type: "string", enum: ["terminal_executor","web_scraper","code_writer","file_reader","grep_search","glob_search"] },
              action_payload: { type: "object", properties: { instruction: { type: "string" }, parameters: { type: "object" } }, required: ["instruction"] },
              expect_result_type: { type: "string", enum: ["text","json","none"] }
            }, required: ["agent_target","action_payload","expect_result_type"] }
          }},
          { type: "function", function: {
            name: "done", description: "Mission accomplie",
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
          const args = JSON.parse(toolCall.function.arguments);
          emitLog("Loop", "info", "Mission accomplie: " + args.summary);
          return args.summary;
        }
        if (toolCall.function.name === "delegate_to_agent") {
          const args = JSON.parse(toolCall.function.arguments);
          const validation = delegateTaskSchema.safeParse(args);
          if (!validation.success) {
            messages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Erreur validation" });
            continue;
          }
          emitLog("Cerveau", "info", "-> " + args.agent_target + ": " + args.action_payload.instruction.substring(0, 60));

          // CHECK PERMISSION
          const perm = checkPermission(args.agent_target);
          if (perm.needsApproval) {
            emitLog("Permission", "warn", "Action " + perm.action + " requiert approbation (mode auto-approve en attendant)");
            // Pour l instant on auto-approuve (l UI WebSocket viendra plus tard)
          }

          const result = await executeTask(args.agent_target, args.action_payload);
          messages.push({ role: "assistant", content: response.content, tool_calls: [{ id: toolCall.id, type: "function", function: { name: toolCall.function.name, arguments: toolCall.function.arguments } }] });
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: result.substring(0, 8000) });
          emitLog("Loop", "info", "Resultat recu, continuation...");
        }
      }
      continue;
    }
    if (response.content) { emitLog("Loop", "info", "Reponse texte. Fin."); return response.content; }
    return "Reponse vide.";
  }
  emitLog("Loop", "warn", "Limite de " + maxTurns + " tours atteinte.");
  return "Limite de tours atteinte.";
}
