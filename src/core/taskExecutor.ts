import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { sanitizeFilename, isCommandSafe } from "./contract";
import { emitLog } from "./eventBus";
import { insertTask, completeTask } from "./blackboard";
import { vectorStore } from "./vectorStore";
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
      case "rag_memory": result = await execRagMemory(actionPayload); break;
      case "browser_eyes": result = await execBrowserEyes(actionPayload); break;
      default: result = "Erreur: Agent " + agentTarget + " non implemente.";
    }
    completeTask(taskId, result);
    emitLog(agentTarget, "info", "Resultat: " + result.substring(0, 80));
    return result;
  } catch (error: any) {
    const errMsg = "Erreur: " + error.message;
    completeTask(taskId, errMsg);
    return errMsg;
  }
}

async function execRagMemory(payload: any): Promise<string> {
  const { execRagMemory } = await import("../agents/ragMemory");
  return await execRagMemory(payload);
}

async function execCodeWriter(payload: any): Promise<string> {
  let rawFilename = payload.parameters?.filename;
  if (!rawFilename) {
    const quoted = payload.instruction.match(/[""']([^""']+\.[a-zA-Z]{1,5})[""']/);
    if (quoted) rawFilename = quoted[1];
    else {
      const named = payload.instruction.match(/nomm[ée]\s+[""']?([^""'\s]+\.[a-zA-Z]{1,5})/);
      if (named) rawFilename = named[1];
      else {
        const anyFile = payload.instruction.match(/([a-zA-Z0-9_\-]+\.[a-zA-Z]{1,5})/);
        if (anyFile) rawFilename = anyFile[1];
      }
    }
  }
  if (!rawFilename) rawFilename = "untitled.txt";
  let content = payload.parameters?.content || "";
  if (!content) {
    const patterns = [/contenant\s+.*?(?:suivant\s*[:\s]*)?[\s:]*(.*)/is, /avec\s+(?:le\s+)?texte\s+suivant\s*[:\s]*[\s:]*(.*)/is, /contenu\s+suivant\s*[:\s]*[\s:]*(.*)/is, /texte\s*[:\s]+[\s:]*(.*)/is];
    for (const p of patterns) { const m = payload.instruction.match(p); if (m && m[1] && m[1].trim().length > 0) { content = m[1].trim(); break; } }
    if (!content) { const after = payload.instruction.split(rawFilename); if (after.length > 1 && after[1].trim().length > 5) content = after[1].replace(/^[\s:]+/, "").trim(); }
  }
  const check = sanitizeFilename(rawFilename);
  if (!check.safe) return "Erreur: " + check.reason;
  const targetPath = path.join(process.cwd(), check.cleanName!);
  if (!path.resolve(targetPath).startsWith(path.resolve(process.cwd()))) return "Erreur: hors dossier travail.";
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, content, "utf-8");
  emitLog("CodeWriter", "info", "Fichier cree: " + check.cleanName + " (" + content.length + " chars)");
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
  if (!url) { const match = payload.instruction.match(/https?:\/\/[^\s"'<>]+/); url = match ? match[0] : null; }
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
  let filename = payload.parameters?.filename;
  if (!filename) {
    const matches = payload.instruction.match(/[a-zA-Z0-9_\-\/]+\.[a-zA-Z]{1,5}/g);
    if (matches && matches.length > 0) filename = matches.sort((a: string, b: string) => b.length - a.length)[0];
  }
  if (!filename) return "Erreur: Aucun nom de fichier trouve.";
  const filePath = path.resolve(process.cwd(), filename);
  if (!filePath.startsWith(path.resolve(process.cwd()))) return "Erreur: hors dossier travail.";
  if (!fs.existsSync(filePath)) {
    const available = fs.readdirSync(process.cwd()).filter((f: string) => !f.startsWith("node_modules") && !f.startsWith(".")).join(", ");
    return "Erreur: Fichier non trouve: " + filename + ". Fichiers a la racine: " + available;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  emitLog("FileReader", "info", "Lu: " + filename + " (" + content.length + " chars)");
  return content.substring(0, 10000);
}

async function execGrepSearch(payload: any): Promise<string> {
  let pattern = payload.parameters?.pattern;
  if (!pattern) {
    const quoted = payload.instruction.match(/["\u201c\u2019]([^"\u201c\u2019]+)["\u201c\u2019]/);
    if (quoted) pattern = quoted[1];
    else pattern = payload.instruction.replace(/.*cherche[r]?/i, "").trim();
  }
  if (!pattern) return "Erreur: Aucun pattern fourni.";
  emitLog("GrepSearch", "info", "Recherche: " + pattern);
  try {
    const { stdout } = await execAsync("findstr /s /i /n \"" + pattern + "\" *.ts *.tsx *.json *.md", { timeout: 10000, cwd: process.cwd() });
    return stdout.substring(0, 5000) || "Aucun resultat.";
  } catch {
    return "Aucun resultat trouve pour: " + pattern;
  }
}

async function execGlobSearch(payload: any): Promise<string> {
  let pattern = payload.parameters?.pattern;
  if (!pattern) {
    const extMatch = payload.instruction.match(/\.([a-zA-Z]{1,5})\b/);
    if (extMatch) pattern = "\\." + extMatch[1] + "$";
    else pattern = ".*";
  }
  // FIX: Nettoyer le pattern (enlever les double-echappements)
  pattern = pattern.replace(/\\\\/g, "\\");
  emitLog("GlobSearch", "info", "Pattern: " + pattern);
  let regex: RegExp;
  try { regex = new RegExp(pattern); } catch {
    // Si le regex est invalide, on fait un match simple par extension
    const ext = payload.instruction.match(/\.([a-zA-Z]{1,5})\b/);
    if (ext) { regex = new RegExp("\\." + ext[1] + "$"); emitLog("GlobSearch", "info", "Pattern fallback: \\." + ext[1] + "$"); }
    else { regex = /.*/; }
  }
  const results: string[] = [];
  function walk(d: string) {
    let items: fs.Dirent[];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const item of items) {
      if (item.name === "node_modules" || item.name === ".git" || item.name === "dist") continue;
      const full = path.join(d, item.name);
      if (item.isDirectory()) walk(full);
      else { try { if (item.name.match(regex)) results.push(path.relative(process.cwd(), full).replace(/\\/g, "/")); } catch {} }
    }
  }
  walk(process.cwd());
  emitLog("GlobSearch", "info", results.length + " fichier(s)");
  return results.length > 0 ? results.sort().join("\n") : "Aucun fichier trouve avec: " + pattern;
}

