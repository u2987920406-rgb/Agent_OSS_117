import { delegateTaskSchema } from "./contract";
import { eventBus, EVENT_CHANNELS, emitLog } from "./eventBus";
import { insertTask } from "./blackboard";
import { randomUUID } from "crypto";

export function processBrainOutput(rawBrainOutput: any): string | null {
  const result = delegateTaskSchema.safeParse(rawBrainOutput);
  if (!result.success) {
    emitLog("Routeur", "error", "JSON invalide du cerveau! Tache rejetee.");
    console.error(result.error.format());
    return null;
  }
  const taskData = result.data;
  const taskId = randomUUID();
  insertTask(taskId, taskData.agent_target, JSON.stringify(taskData.action_payload));
  emitLog("Routeur", "info", `Tache ${taskId.substring(0, 8)} creee pour "${taskData.agent_target}".`);
  eventBus.emit(EVENT_CHANNELS.TASK_CREATED, taskId);
  return taskId;
}
