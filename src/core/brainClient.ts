import OpenAI from "openai";
import "dotenv/config";
import { processBrainOutput } from "./router";
import { emitLog } from "./eventBus";

const client = new OpenAI({
  apiKey: process.env.BRAIN_API_KEY || "ollama",
  baseURL: process.env.BRAIN_BASE_URL || "http://localhost:11434/v1"
});
const model = process.env.BRAIN_MODEL || "llama3.2";

const SYSTEM_PROMPT = `Tu es l'Orchestrateur Principal d'un OS Agentique nomme OSS-117.
Tu n'as pas acces a internet ni au systeme de fichiers.
Pour accomplir toute demande, tu DOIS utiliser l'outil delegate_to_agent.
Agents: terminal_executor, code_writer, web_scraper, browser_eyes, rag_memory
Regle: une seule tache par appel, sois precis.`;

export async function sendToBrain(userPrompt: string): Promise<string> {
  emitLog("Cerveau", "info", `Connexion au modele ${model}...`);
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      tools: [{
        type: "function",
        function: {
          name: "delegate_to_agent",
          description: "Envoie une tache a un agent specialise",
          parameters: {
            type: "object",
            properties: {
              agent_target: { type: "string", enum: ["terminal_executor","web_scraper","browser_eyes","code_writer","rag_memory"] },
              action_payload: { type: "object", properties: { instruction: { type: "string" } }, required: ["instruction"] },
              expect_result_type: { type: "string", enum: ["text","image_base64","json","none"] }
            },
            required: ["agent_target","action_payload","expect_result_type"]
          }
        }
      }],
      tool_choice: "auto"
    });
    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (toolCall && toolCall.function.name === "delegate_to_agent") {
      emitLog("Cerveau", "info", "Decision prise, envoi au Routeur...");
      const taskId = processBrainOutput(JSON.parse(toolCall.function.arguments));
      return taskId || "Erreur: tache non creee";
    } else {
      const text = response.choices[0].message.content || "(pas de reponse)";
      emitLog("Cerveau", "warn", "Pas d outil utilise. Reponse texte.");
      return text;
    }
  } catch (error: any) {
    emitLog("Cerveau", "error", `Erreur API: ${error.message}`);
    return `Erreur: ${error.message}`;
  }
}
