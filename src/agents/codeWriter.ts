import * as fs from "fs";
import * as path from "path";
import { eventBus, EVENT_CHANNELS, emitLog } from "../core/eventBus";
import { getTask, updateTaskStatus, insertLog } from "../core/blackboard";
import { sanitizeFilename } from "../core/contract";

export function startCodeWriterAgent() {
  eventBus.on(EVENT_CHANNELS.TASK_CREATED, (taskId: string) => {
    const task = getTask(taskId);
    if (!task || task.assigned_to !== "code_writer" || task.status !== "PENDING") return;
    updateTaskStatus(taskId, "RUNNING");
    eventBus.emit(EVENT_CHANNELS.TASK_CLAIMED, taskId, "code_writer");
    emitLog("CodeWriter", "info", `Tache ${taskId.substring(0, 8)} reclamatione.`);
    const payload = JSON.parse(task.payload);
    const rawFilename = payload.parameters?.filename || "untitled.txt";
    const content = payload.parameters?.content || "";
    const check = sanitizeFilename(rawFilename);
    if (!check.safe) {
      const msg = `Nom de fichier refuse: ${check.reason}`;
      emitLog("CodeWriter", "error", msg);
      eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, `Erreur: ${msg}`);
      return;
    }
    const targetPath = path.join(process.cwd(), check.cleanName!);
    const cwd = path.resolve(process.cwd());
    const resolved = path.resolve(targetPath);
    if (!resolved.startsWith(cwd)) {
      const msg = "Ecriture hors dossier de travail bloquee.";
      emitLog("CodeWriter", "error", msg);
      eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, `Erreur: ${msg}`);
      return;
    }
    emitLog("CodeWriter", "info", `Creation: ${check.cleanName}`);
    try {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(targetPath, content, "utf-8");
      const msg = `Fichier ${check.cleanName} cree (${content.length} chars).`;
      emitLog("CodeWriter", "info", "Succes. Envoi au Ghost QA...");
      eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, msg);
    } catch (error: any) {
      const msg = `Erreur ecriture: ${error.message}`;
      emitLog("CodeWriter", "error", msg);
      eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, `Erreur: ${msg}`);
    }
  });
}
