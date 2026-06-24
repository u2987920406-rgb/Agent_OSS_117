import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { sanitizeFilename, isCommandSafe } from "./contract";
import { emitLog } from "./eventBus";
import { insertTask, completeTask } from "./blackboard";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

export async function executeTask(agentTarget: string, actionPayload: any): Promise<string> {
  const taskId = randomUUID();
  insertTask(taskId, agentTarget, JSON.stringify(actionPayload));
  try {
    let result: string;
    switch (agentTarget) {
      case "code_writer": result = await execCodeWriter(actionPayload); break;
      case "terminal_executor": result = await execTerminal(actionPayload); break;
      case "web_scraper": result = await execWebScraper(actionPayload); break;
      case "file_reader": result = await execFileReader(actionPayload); break;
      case "grep_search": result = await execGrepSearch(actionPayload); break;
      case "glob_search": result = await execGlobSearch(actionPayload); break;
      default: result = "Erreur: Agent " + agentTarget + " non implemente.";
    }
    completeTask(taskId, result);
    emitLog(agentTarget, "info", "Tache terminee: " + result.substring(0, 80));
    return result;
  } catch (error: any) {
    const errMsg = "Erreur: " + error.message;
    completeTask(taskId, errMsg);
    return errMsg;
  }
}

async function execCodeWriter(payload: any): Promise<string> {
  const rawFilename = payload.parameters?.filename || "untitled.txt";
  const content = payload.parameters?.content || "";
  const check = sanitizeFilename(rawFilename);
  if (!check.safe) return "Erreur: " + check.reason;
  const targetPath = path.join(process.cwd(), check.cleanName!);
  if (!path.resolve(targetPath).startsWith(path.resolve(process.cwd())))
    return "Erreur: ecriture hors dossier travail bloquee.";
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, content, "utf-8");
  emitLog("CodeWriter", "info", "Fichier cree: " + check.cleanName);
  return "Succes: Fichier " + check.cleanName + " cree (" + content.length + " chars).";
}

async function execTerminal(payload: any): Promise<string> {
  const command = payload.instruction;
  const safety = isCommandSafe(command);
  if (!safety.safe) return "Erreur: " + safety.reason;
  emitLog("TerminalExecutor", "info", "Execution: " + command);
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
    return stdout || stderr || "Commande executee (pas de sortie).";
  } catch (error: any) {
    return "Erreur execution: " + (error.stderr || error.message);
  }
}

async function execWebScraper(payload: any): Promise<string> {
  let url = payload.parameters?.url;
  if (!url) {
    const match = payload.instruction.match(/https?:\/\/[^\s"'<>]+/);
    url = match ? match[0] : null;
  }
  if (!url) return "Erreur: Aucune URL trouvee.";
  emitLog("WebScraper", "info", "Recuperation: " + url);
  const res = await fetch(url, { headers: { "User-Agent": "AgentOSS117/0.2" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "(pas de titre)";
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().substring(0, 5000);
  return JSON.stringify({ url, title, contentPreview: text.substring(0, 2000), contentLength: text.length });
}

async function execFileReader(payload: any): Promise<string> {
  const filename = payload.parameters?.filename || payload.instruction.trim();
  const filePath = path.resolve(process.cwd(), filename);
  if (!filePath.startsWith(path.resolve(process.cwd()))) return "Erreur: hors dossier travail.";
  if (!fs.existsSync(filePath)) return "Erreur: Fichier non trouve: " + filename;
  const content = fs.readFileSync(filePath, "utf-8");
  return content.substring(0, 10000);
}

async function execGrepSearch(payload: any): Promise<string> {
  const pattern = payload.parameters?.pattern || payload.instruction.trim();
  try {
    const { stdout } = await execAsync("findstr /s /i /n \"" + pattern + "\" *.ts", { timeout: 10000, cwd: process.cwd() });
    return stdout.substring(0, 5000) || "Aucun resultat.";
  } catch {
    return "Aucun resultat trouve pour: " + pattern;
  }
}

async function execGlobSearch(payload: any): Promise<string> {
  const pattern = payload.parameters?.pattern || payload.instruction.trim();
  const dir = process.cwd();
  function walk(d: string, results: string[]) {
    const items = fs.readdirSync(d, { withFileTypes: true });
    for (const item of items) {
      if (item.name === "node_modules" || item.name === ".git") continue;
      const full = path.join(d, item.name);
      if (item.isDirectory()) walk(full, results);
      else if (item.name.match(pattern)) results.push(path.relative(process.cwd(), full));
    }
  }
  const results: string[] = [];
  walk(dir, results);
  return results.length > 0 ? results.join("\n") : "Aucun fichier trouve.";
}
