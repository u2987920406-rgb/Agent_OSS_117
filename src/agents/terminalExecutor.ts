import { exec } from "child_process";
import { eventBus, EVENT_CHANNELS, emitLog } from "../core/eventBus";
import { getTask, updateTaskStatus, insertLog } from "../core/blackboard";
import { isCommandSafe } from "../core/contract";

export function startTerminalAgent() {
  eventBus.on(EVENT_CHANNELS.TASK_CREATED, (taskId: string) => {
    const task = getTask(taskId);
    if (!task || task.assigned_to !== "terminal_executor" || task.status !== "PENDING") return;
    updateTaskStatus(taskId, "RUNNING");
    eventBus.emit(EVENT_CHANNELS.TASK_CLAIMED, taskId, "terminal_executor");
    emitLog("TerminalExecutor", "info", `Tache ${taskId.substring(0, 8)} reclamatione.`);
    const payload = JSON.parse(task.payload);
    const command = payload.instruction;
    const safety = isCommandSafe(command);
    if (!safety.safe) {
      const msg = `Commande bloquee: ${safety.reason}`;
      emitLog("TerminalExecutor", "error", msg);
      eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, `Erreur: ${msg}`);
      return;
    }
    emitLog("TerminalExecutor", "info", `Execution: ${command}`);
    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        emitLog("TerminalExecutor", "error", `Erreur: ${error.message}`);
        eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, stderr || error.message);
      } else {
        const output = stdout || "Commande executee (pas de sortie).";
        emitLog("TerminalExecutor", "info", "Succes. Envoi au Ghost QA...");
        eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, output);
      }
    });
  });
}
