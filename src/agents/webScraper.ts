import { eventBus, EVENT_CHANNELS, emitLog } from "../core/eventBus";
import { getTask, updateTaskStatus } from "../core/blackboard";

export function startWebScraperAgent() {
  eventBus.on(EVENT_CHANNELS.TASK_CREATED, (taskId: string) => {
    const task = getTask(taskId);
    if (!task || task.assigned_to !== "web_scraper" || task.status !== "PENDING") return;
    updateTaskStatus(taskId, "RUNNING");
    eventBus.emit(EVENT_CHANNELS.TASK_CLAIMED, taskId, "web_scraper");
    emitLog("WebScraper", "info", `Tache ${taskId.substring(0, 8)} reclamatione.`);
    const payload = JSON.parse(task.payload);
    const url = payload.parameters?.url;
    if (!url) {
      emitLog("WebScraper", "error", "Aucune URL fournie.");
      eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, "Erreur: Aucune URL fournie.");
      return;
    }
    try { new URL(url); } catch {
      emitLog("WebScraper", "error", `URL invalide: ${url}`);
      eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, `Erreur: URL invalide.`);
      return;
    }
    emitLog("WebScraper", "info", `Recuperation de: ${url}`);
    fetch(url, { headers: { "User-Agent": "AgentOSS117/0.2" }, signal: AbortSignal.timeout(15000) })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : "(pas de titre)";
        const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().substring(0, 5000);
        const result = JSON.stringify({ url, title, contentPreview: text.substring(0, 2000), contentLength: text.length });
        emitLog("WebScraper", "info", `Page recuperee: "${title}" (${text.length} chars).`);
        eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, result);
      })
      .catch((error: any) => {
        emitLog("WebScraper", "error", `Erreur fetch: ${error.message}`);
        eventBus.emit(EVENT_CHANNELS.TASK_COMPLETED, taskId, `Erreur: ${error.message}`);
      });
  });
}
