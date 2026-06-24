import { EventEmitter } from "events";

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export const EVENT_CHANNELS = {
  TASK_CREATED: "TASK_CREATED",
  TASK_CLAIMED: "TASK_CLAIMED",
  TASK_COMPLETED: "TASK_COMPLETED",
  TASK_AUDITED: "TASK_AUDITED",
  TASK_REJECTED: "TASK_REJECTED",
  LOG: "LOG"
} as const;

export function emitLog(agent: string, level: "info" | "warn" | "error", message: string): void {
  const entry = { agent, level, message, timestamp: new Date().toISOString() };
  eventBus.emit(EVENT_CHANNELS.LOG, entry);
  const emoji = level === "error" ? "[!]" : level === "warn" ? "[~]" : "[*]";
  console.log(`${emoji} [${agent}] ${message}`);
}
console.log("Event Bus initialise.");
