import OpenAI from "openai";
import "dotenv/config";
import { delegateTaskSchema } from "./contract";
import { executeTask } from "./taskExecutor";
import { emitLog } from "./eventBus";
import { buildContext } from "./contextBuilder";
import { checkPermission } from "./permissions";
import { vectorStore } from "./vectorStore";

const client = new OpenAI({
  apiKey: process.env.BRAIN_API_KEY || "ollama",
  baseURL: process.env.BRAIN_BASE_URL || "http://localhost:11434/v1"
});
const model = process.env.BRAIN_MODEL || "gemma4:12b";
const OLLAMA_URL = (process.env.BRAIN_BASE_URL || "http://localhost:11434/v1").replace("/v1", "");

function buildSystemPrompt(): string {
  return [
    "Tu es OSS-117, l Orchestrateur d un OS Agentique.",
    "Tu ne peux rien faire seul. Tu DOIS utiliser les outils pour agir.",
    "",
    buildContext(),
    "",
    "=== OUTILS ===",
    "1. delegate_to_agent: envoie une tache a un agent specialise",
    "   Agents disponibles:",
    "   - terminal_executor: execute des commandes (dir, ls, git, npm, node, echo, findstr)",
    "   - code_writer: cree un fichier (parameters: filename, content)",
    "   - web_scraper: scrape une page web (parameters: url)",
    "   - file_reader: lit un fichier (parameters: filename)",
    "   - grep_search: cherche du texte (parameters: pattern)",
    "   - glob_search: trouve des fichiers (parameters: pattern regex)",
    "   - rag_memory: memoire vectorielle (parameters: action=store/search/count, text)",
    "   - browser_eyes: capture d ecran + liste fenetres (parameters: action=screenshot/windowlist)",
    "",
    "2. done: signale la fin de mission (parameters: summary)",
    "",
    "REGLES:",
    "1. Une seule tache par appel",
    "2. Analyse le resultat recu avant de continuer",
    "3. Remplis TOUJOURS les parameters necessaires",
    "4. Utilise done quand la mission est complete",
    "5. Tu as une MEMOIRE RAG - utilise rag_memory action=search pour te rappeler"
  ].join("\n");
}

async function autoMemory(agent: string, instruction: string, result: string): Promise<void> {
  try {
    const text = agent + ": " + instruction + " => " + result;
    const res = await fetch(OLLAMA_URL + "/api/embeddings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: text.substring(0, 2000) })
    });
    if (res.ok) { const data = await res.json(); vectorStore.add(text, data.embedding, { agent }); emitLog("AutoMemory", "info", "Stocke en memoire RAG"); }
  } catch (e: any) { emitLog("AutoMemory", "warn", "Stockage RAG echoue"); }
}

export async function agentLoop(userPrompt: string, maxTurns: number = 20): Promise<string> {
  emitLog("Loop", "info", "Mission: " + userPrompt.substring(0, 60));
  const messages: any[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: userPrompt }
  ];
  let emptyCount = 0;

  for (let turn = 1; turn <= maxTurns; turn++) {
    emitLog("Loop", "info", "Tour " + turn + "/" + maxTurns);

    let response: any;
    try {
      const completion = await client.chat.completions.create({
        model, messages,
        tools: [
          { type: "function", function: {
            name: "delegate_to_agent",
            description: "Envoie une tache a un agent specialise",
            parameters: { type: "object", properties: {
              agent_target: { type: "string", enum: ["terminal_executor","code_writer","web_scraper","file_reader","grep_search","glob_search","rag_memory","browser_eyes"] },
              action_payload: { type: "object", properties: {
                instruction: { type: "string" },
                parameters: { type: "object", properties: {
                  filename: { type: "string" }, content: { type: "string" }, url: { type: "string" },
                  pattern: { type: "string" }, action: { type: "string" }, text: { type: "string" }
                }}
              }, required: ["instruction"] },
              expect_result_type: { type: "string", enum: ["text","json","none"] }
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
      emptyCount = 0;
      for (const toolCall of response.tool_calls) {
        if (toolCall.function.name === "done") {
          let args: any;
          try { args = JSON.parse(toolCall.function.arguments); } catch { args = { summary: "Mission terminee" }; }
          emitLog("Loop", "info", "Mission accomplie: " + (args.summary || "").substring(0, 100));
          return args.summary || "Mission terminee.";
        }
        if (toolCall.function.name === "delegate_to_agent") {
          let args: any;
          try { args = JSON.parse(toolCall.function.arguments); } catch {
            messages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Erreur: JSON invalide" });
            continue;
          }
          const validation = delegateTaskSchema.safeParse(args);
          if (!validation.success) {
            messages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Erreur validation. Reessaie." });
            continue;
          }
          emitLog("Cerveau", "info", "-> " + args.agent_target + ": " + args.action_payload.instruction.substring(0, 60));
          const perm = checkPermission(args.agent_target);
          if (perm.needsApproval) emitLog("Permission", "info", "Auto-approuve (" + perm.action + ")");
          const result = await executeTask(args.agent_target, args.action_payload);
          await autoMemory(args.agent_target, args.action_payload.instruction, result);
          messages.push({ role: "assistant", content: response.content, tool_calls: [{ id: toolCall.id, type: "function", function: { name: toolCall.function.name, arguments: toolCall.function.arguments } }] });
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: result.substring(0, 4000) });
          emitLog("Loop", "info", "Resultat recu (" + result.length + " chars)");
        }
      }
      continue;
    }

    if (response.content && response.content.trim().length > 0) {
      emitLog("Loop", "info", "Reponse texte. Fin.");
      return response.content;
    }
    emptyCount++;
    emitLog("Loop", "warn", "Reponse vide (" + emptyCount + "/3)");
    if (emptyCount >= 3) { emitLog("Loop", "info", "Trop de reponses vides. Fin."); return "Mission terminee (reponses vides)."; }
    messages.push({ role: "user", content: "La tache precedente est terminee. Utilise done ou delegate_to_agent." });
    continue;
  }
  emitLog("Loop", "warn", "Limite de " + maxTurns + " tours atteinte.");
  return "Limite de tours atteinte.";
}
