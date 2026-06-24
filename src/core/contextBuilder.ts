import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { getAllTasks } from "./blackboard";

export function buildContext(): string {
  const lines: string[] = [];

  // 1. Contexte systeme
  lines.push("CONTEXTE SYSTEME:");
  lines.push("- OS: " + process.platform + " " + process.arch);
  lines.push("- Dossier de travail: " + process.cwd());
  lines.push("- Node: " + process.version);

  // 2. Git status
  try {
    const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
    const status = execSync("git status --short", { encoding: "utf-8" }).trim();
    lines.push("- Git branch: " + branch);
    if (status) lines.push("- Git changements: " + status.split("\n").length + " fichier(s) modifie(s)");
  } catch {}

  // 3. Liste des fichiers du projet
  try {
    const files = fs.readdirSync(process.cwd()).filter(f => !f.startsWith("node_modules") && !f.startsWith(".git"));
    lines.push("- Fichiers racine: " + files.join(", "));
  } catch {}

  // 4. oss117.md (conventions projet)
  const oss117Path = path.join(process.cwd(), "oss117.md");
  if (fs.existsSync(oss117Path)) {
    const content = fs.readFileSync(oss117Path, "utf-8");
    lines.push("");
    lines.push("CONVENTIONS PROJET (oss117.md):");
    lines.push(content);
  }

  // 5. Taches recentes
  const recentTasks = getAllTasks().slice(0, 5);
  if (recentTasks.length > 0) {
    lines.push("");
    lines.push("TACHES RECENTES:");
    for (const t of recentTasks) {
      lines.push("- [" + t.status + "] " + t.assigned_to + ": " + t.result?.substring(0, 60) || "(en cours)");
    }
  }

  return lines.join("\n");
}
