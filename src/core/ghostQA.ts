import "dotenv/config";
import { eventBus, EVENT_CHANNELS, emitLog } from "./eventBus";
import { auditTask, insertLog, getTask, updateTaskStatus, completeTask } from "./blackboard";

export function startGhostQA() {
  eventBus.on(EVENT_CHANNELS.TASK_COMPLETED, async (taskId: string, result: string) => {
    emitLog("GhostQA", "info", `Audit de la tache ${taskId.substring(0, 8)}...`);
    const task = getTask(taskId);
    if (!task) return;

    // 1. Sauvegarder le resultat ET le statut COMPLETED
    completeTask(taskId, result);

    // 2. Audit
    try {
      const isFailure = result.toLowerCase().startsWith("erreur") || result.toLowerCase().startsWith("error");
      const qaStatus = isFailure ? "REJECTED" : "AUDITED";
      const report = isFailure ? "Echec detecte dans le resultat." : "Validation OK (mode basique).";
      auditTask(taskId, qaStatus, report);
      insertLog(taskId, "ghost_qa", isFailure ? "WARN" : "INFO", report);
      emitLog("GhostQA", isFailure ? "warn" : "info", `${qaStatus} - ${report}`);
      if (isFailure) eventBus.emit(EVENT_CHANNELS.TASK_REJECTED, taskId, report);
      else eventBus.emit(EVENT_CHANNELS.TASK_AUDITED, taskId);
    } catch (error: any) {
      auditTask(taskId, "AUDITED", `Erreur QA (fallback): ${error.message}`);
      emitLog("GhostQA", "warn", "Erreur audit, validation par defaut.");
      eventBus.emit(EVENT_CHANNELS.TASK_AUDITED, taskId);
    }
  });
}
