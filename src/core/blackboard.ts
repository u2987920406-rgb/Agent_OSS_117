// src/core/blackboard.ts — Stockage JSON (sans compilation native)
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const DB_FILE = path.join(process.cwd(), "agent_oss_117.json");

interface TaskRow {
  id: string;
  assigned_to: string;
  status: string;
  payload: string;
  result: string | null;
  qa_status: string;
  qa_report: string | null;
  created_at: string;
  updated_at: string;
}

interface LogRow {
  id: number;
  task_id: string | null;
  agent_name: string;
  log_level: string;
  message: string;
}

interface DBShape {
  tasks: TaskRow[];
  global_state: Record<string, string>;
  agent_logs: LogRow[];
}

// Charger la DB ou creer une nouvelle
function loadDB(): DBShape {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    } catch {
      console.log("Blackboard: fichier corrompu, recreation.");
    }
  }
  return { tasks: [], global_state: {}, agent_logs: [] };
}

let db: DBShape = loadDB();
let logCounter = 1;

function saveDB(): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

console.log("Blackboard (JSON) initialise.");

// ─── API publique (meme signatures que la version SQLite) ───

export function getTask(taskId: string): TaskRow | undefined {
  return db.tasks.find(t => t.id === taskId);
}

export function getAllTasks(): TaskRow[] {
  return [...db.tasks].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function updateTaskStatus(taskId: string, status: string): void {
  const task = db.tasks.find(t => t.id === taskId);
  if (task) {
    task.status = status;
    task.updated_at = new Date().toISOString();
    saveDB();
  }
}

export function completeTask(taskId: string, result: string): void {
  const task = db.tasks.find(t => t.id === taskId);
  if (task) {
    task.status = "COMPLETED";
    task.result = result;
    task.updated_at = new Date().toISOString();
    saveDB();
  }
}

export function auditTask(taskId: string, qaStatus: string, report: string): void {
  const task = db.tasks.find(t => t.id === taskId);
  if (task) {
    task.qa_status = qaStatus;
    task.qa_report = report;
    task.updated_at = new Date().toISOString();
    saveDB();
  }
}

export function insertLog(taskId: string | null, agentName: string, level: string, message: string): void {
  db.agent_logs.push({
    id: logCounter++,
    task_id: taskId,
    agent_name: agentName,
    log_level: level,
    message
  });
  saveDB();
}

export function getLogs(limit: number = 50): LogRow[] {
  return [...db.agent_logs].reverse().slice(0, limit);
}

// ─── Fonction pour inserer une tache (utilisee par le router) ───
export function insertTask(taskId: string, assignedTo: string, payload: string): void {
  db.tasks.push({
    id: taskId,
    assigned_to: assignedTo,
    status: "PENDING",
    payload,
    result: null,
    qa_status: "PENDING",
    qa_report: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  saveDB();
}

export default { getTask, getAllTasks, updateTaskStatus, completeTask, auditTask, insertLog, getLogs, insertTask };
