import OpenAI from "openai";
import "dotenv/config";
import { delegateTaskSchema } from "./contract";
import { executeTask } from "./taskExecutor";
import { emitLog } from "./eventBus";
import { insertLog } from "./blackboard";
import { randomUUID } from "crypto";

const client = new OpenAI({
  apiKey: process.env.BRAIN_API_KEY || "ollama",
  baseURL: process.env.BRAIN_BASE_URL || "http://localhost:11434/v1"
});
const model = process.env.BRAIN_MODEL || "gemma4:12b";

function buildSystemPrompt(): string {
  return [
    "Tu es l'Orchestrateur Principal d'OSS-117, un OS Agentique.",
    "Tu n'as pas acces a internet ni au systeme de fichiers directement.",
    "Pour accomplir une mission, tu dois decomposer en etapes et utiliser les outils.",
    "",
    "OUTILS DISPONIBLES:",
    "1. delegate_to_agent : Envoie une tache a un agent specialise",
    "   Agents: terminal_executor, code_writer, web_scraper, file_reader, grep_search, glob_search",
    "   - terminal_executor: execute des commandes (ls, dir, git, npm, node, echo, cat, etc.)",
    "   - code_writer: cree des fichiers (parameters: filename, content)",
    "   - web_scraper: recupere une page web (parameters: url ou URL dans instruction)",
    "   - file_reader: lit un fichier (parameters: filename)",
    "   - grep_search: cherche du texte dans les fichiers (parameters: pattern)",
    "   - glob_search: trouve des fichiers par pattern (parameters: pattern)",
    "",
    "2. done : Signale que la mission est accomplie",
    "   Utilise cet outil avec un resume quand tu as fini.",
    "",
    "REGLES:",
    "- Une seule tache par appel d'outil",
    "- Tu recevras le resultat de chaque tache - analyse-le avant de continuer",
    "- Si une tache echoue, essaie une autre approche",
    - "Quand la mission est complete, utilise l'outil done"
  ].join("\n");
}

export async function agentLoop(userPrompt: string, maxTurns: number = 20): Promise<string> {
  emitLog("Loop", "info", "Demarrage de la mission: " + userPrompt.substring(0, 60));
  
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
          {
            type: "function",
            function: {
              name: "delegate_to_agent",
              description: "Envoie une tache a un agent specialise",
              parameters: {
                type: "object",
                properties: {
                  agent_target: { type: "string", enum: ["terminal_executor","web_scraper","code_writer","file_reader","grep_search","glob_search"] },
                  action_payload: {
                    type: "object",
                    properties: {
                      instruction: { type: "string" },
                      parameters: { type: "object", description: "Parametres optionnels (filename, content, url, pattern)" }
                    },
                    required: ["instruction"]
                  },
                  expect_result_type: { type: "string", enum: ["text","json","none"] }
                },
                required: ["agent_target","action_payload","expect_result_type"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "done",
              description: "Signale que la mission est accomplie",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Resume de ce qui a ete accompli" }
                },
                required: ["summary"]
              }
            }
          }
        ],
        tool_choice: "auto"
      });
      response = completion.choices[0].message;
    } catch (error: any) {
      emitLog("Loop", "error", "Erreur API: " + error.message);
      return "Erreur: " + error.message;
    }

    // Cas 1: Le cerveau a utilise un outil
    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        if (toolCall.function.name === "done") {
          const args = JSON.parse(toolCall.function.arguments);
          emitLog("Loop", "info", "Mission accomplie: " + args.summary);
          return args.summary;
        }

        if (toolCall.function.name === "delegate_to_agent") {
          let args: any;
          try { args = JSON.parse(toolCall.function.arguments); } catch {
            args = JSON.parse(toolCall.function.arguments);
          }

          // Validation Zod
          const validation = delegateTaskSchema.safeParse(args);
          if (!validation.success) {
            emitLog("Loop", "warn", "Tache invalide rejetee.");
            messages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Erreur validation: " + JSON.stringify(validation.error.format()) });
            continue;
          }

          emitLog("Cerveau", "info", "Delegation a " + args.agent_target + ": " + args.action_payload.instruction.substring(0, 60));

          // Executer la tache
          const result = await executeTask(args.agent_target, args.action_payload);

          // Feed back au cerveau
          messages.push({
            role: "assistant",
            content: response.content,
            tool_calls: [{ id: toolCall.id, type: "function", function: { name: toolCall.function.name, arguments: toolCall.function.arguments } }]
          });
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: result.substring(0, 8000) });

          emitLog("Loop", "info", "Resultat recu, le cerveau continue...");
        }
      }
      continue;
    }

    // Cas 2: Le cerveau a repondu sans outil
    if (response.content) {
      emitLog("Loop", "info", "Cerveau a repondu sans outil. Fin de mission.");
      return response.content;
    }

    // Cas 3: Reponse vide
    emitLog("Loop", "warn", "Reponse vide. Fin de mission.");
    return "Reponse vide du cerveau.";
  }

  emitLog("Loop", "warn", "Limite de " + maxTurns + " tours atteinte.");
  return "Limite de tours atteinte. Dernier etat: mission incomplete.";
}
