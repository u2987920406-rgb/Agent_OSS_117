import { agentLoop } from "./agentLoop";
import { emitLog } from "./eventBus";

export async function sendToBrain(userPrompt: string): Promise<string> {
  emitLog("Cerveau", "info", "Nouvelle mission: " + userPrompt.substring(0, 60));
  return await agentLoop(userPrompt);
}
