import { z } from "zod";

export const delegateTaskSchema = z.object({
  agent_target: z.enum(["terminal_executor","web_scraper","browser_eyes","code_writer","rag_memory"]),
  action_payload: z.object({
    instruction: z.string(),
    parameters: z.record(z.string()).optional()
  }),
  expect_result_type: z.enum(["text","image_base64","json","none"])
});

export type DelegateTaskInput = z.infer<typeof delegateTaskSchema>;

export const TERMINAL_WHITELIST = ["ls","dir","pwd","cat","echo","head","tail","wc","grep","find","node","npm","npx","git","tsc","mkdir","touch","cp","mv","python","pip","curl"];
export const TERMINAL_BLACKLIST = ["rm -rf","rmdir /s","format","del /f","shutdown","mkfs","dd if=","chmod 777","sudo","runas"];

export function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const lowerCmd = command.toLowerCase().trim();
  for (const forbidden of TERMINAL_BLACKLIST) {
    if (lowerCmd.includes(forbidden.toLowerCase())) {
      return { safe: false, reason: `Commande interdite: "${forbidden}"` };
    }
  }
  if (lowerCmd.includes("| sh") || lowerCmd.includes("| bash")) {
    return { safe: false, reason: "Pipe vers shell interdit" };
  }
  const baseCmd = lowerCmd.split(/\s+/)[0];
  if (!TERMINAL_WHITELIST.includes(baseCmd)) {
    return { safe: false, reason: `Commande "${baseCmd}" non autorisee. Whitelist: ${TERMINAL_WHITELIST.join(", ")}` };
  }
  return { safe: true };
}

export function sanitizeFilename(filename: string): { safe: boolean; cleanName?: string; reason?: string } {
  if (filename.includes("..") || filename.startsWith("/") || filename.match(/^[A-Z]:/)) {
    return { safe: false, reason: "Path traversal detecte" };
  }
  const clean = filename.replace(/[^a-zA-Z0-9._\-/]/g, "");
  if (clean.length === 0) {
    return { safe: false, reason: "Nom de fichier vide apres sanitization" };
  }
  return { safe: true, cleanName: clean };
}
