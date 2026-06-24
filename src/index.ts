import "dotenv/config";
import "./core/blackboard";
import { eventBus, EVENT_CHANNELS, emitLog } from "./core/eventBus";
import { startTerminalAgent } from "./agents/terminalExecutor";
import { startCodeWriterAgent } from "./agents/codeWriter";
import { startWebScraperAgent } from "./agents/webScraper";
import { startGhostQA } from "./core/ghostQA";
import { agentLoop } from "./core/agentLoop";
import "./server";

console.log("\n========================================");
console.log("   AGENT OSS-117 v0.3.0 - Demarrage");
console.log("========================================\n");

startTerminalAgent();
startCodeWriterAgent();
startWebScraperAgent();
startGhostQA();

emitLog("System", "info", "Tous les agents operationnels. Mode multi-tours actif.");
emitLog("System", "info", "Serveur web sur le port 3001.");

console.log("\nTapez votre mission (ou 'exit' pour quitter):\n");
const readline = require("readline").createInterface({ input: process.stdin, output: process.stdout });

readline.on("line", async (input: string) => {
  if (input.trim().toLowerCase() === "exit") { readline.close(); process.exit(0); }
  if (input.trim()) {
    console.log("\n--- Mission en cours ---\n");
    const result = await agentLoop(input);
    console.log("\n--- Resultat final: " + result + " ---\n");
  }
});
