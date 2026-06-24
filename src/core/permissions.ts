import { emitLog } from "./eventBus";

export type PermissionLevel = "strict" | "normal" | "auto";
export type PermissionAction = "read" | "write" | "execute" | "network";

interface PermissionRule {
  agent: string;
  action: PermissionAction;
  autoApprove: boolean;
}

// Regles par niveau de permission
const RULES: Record<PermissionLevel, PermissionRule[]> = {
  strict: [
    { agent: "file_reader", action: "read", autoApprove: true },
    { agent: "grep_search", action: "read", autoApprove: true },
    { agent: "glob_search", action: "read", autoApprove: true },
    { agent: "code_writer", action: "write", autoApprove: false },
    { agent: "terminal_executor", action: "execute", autoApprove: false },
    { agent: "web_scraper", action: "network", autoApprove: false },
  ],
  normal: [
    { agent: "file_reader", action: "read", autoApprove: true },
    { agent: "grep_search", action: "read", autoApprove: true },
    { agent: "glob_search", action: "read", autoApprove: true },
    { agent: "web_scraper", action: "network", autoApprove: true },
    { agent: "code_writer", action: "write", autoApprove: false },
    { agent: "terminal_executor", action: "execute", autoApprove: false },
  ],
  auto: [
    { agent: "file_reader", action: "read", autoApprove: true },
    { agent: "grep_search", action: "read", autoApprove: true },
    { agent: "glob_search", action: "read", autoApprove: true },
    { agent: "web_scraper", action: "network", autoApprove: true },
    { agent: "code_writer", action: "write", autoApprove: true },
    { agent: "terminal_executor", action: "execute", autoApprove: true },
  ]
};

const ACTION_MAP: Record<string, PermissionAction> = {
  file_reader: "read",
  grep_search: "read",
  glob_search: "read",
  code_writer: "write",
  terminal_executor: "execute",
  web_scraper: "network"
};

let currentLevel: PermissionLevel = "normal";
let pendingPermissions: Map<string, (approved: boolean) => void> = new Map();

export function setPermissionLevel(level: PermissionLevel): void {
  currentLevel = level;
  emitLog("Permission", "info", "Niveau de permission: " + level);
}

export function getPermissionLevel(): PermissionLevel {
  return currentLevel;
}

export function checkPermission(agent: string): { needsApproval: boolean; action: PermissionAction } {
  const action = ACTION_MAP[agent] || "execute";
  const rules = RULES[currentLevel];
  const rule = rules.find(r => r.agent === agent);
  if (!rule) return { needsApproval: true, action };
  return { needsApproval: !rule.autoApprove, action };
}

// Pour la future UI: quand une permission est necessaire
export function requestPermission(taskId: string, agent: string, instruction: string): Promise<boolean> {
  return new Promise((resolve) => {
    const { needsApproval } = checkPermission(agent);
    if (!needsApproval) { resolve(true); return; }

    emitLog("Permission", "warn", "APPROBATION REQUISE pour " + agent + ": " + instruction.substring(0, 60));
    pendingPermissions.set(taskId, resolve);

    // Auto-rejet apres 60s
    setTimeout(() => {
      if (pendingPermissions.has(taskId)) {
        pendingPermissions.delete(taskId);
        emitLog("Permission", "warn", "Timeout - auto-rejet.");
        resolve(false);
      }
    }, 60000);
  });
}

export function resolvePermission(taskId: string, approved: boolean): void {
  const resolver = pendingPermissions.get(taskId);
  if (resolver) {
    pendingPermissions.delete(taskId);
    resolver(approved);
    emitLog("Permission", "info", approved ? "Approuve" : "Rejete");
  }
}
