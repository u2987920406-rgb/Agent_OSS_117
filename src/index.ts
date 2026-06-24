import "dotenv/config";
import "./core/blackboard";
import { eventBus, EVENT_CHANNELS, emitLog } from "./core/eventBus";
import { startTerminalAgent } from "./agents/terminalExecutor";
import { startCodeWriterAgent } from "./agents/codeWriter";
import { startWebScraperAgent } from "./agents/webScraper";
import { startGhostQA } from "./core/ghostQA";
import { processBrainOutput } from "./core/router";
import "./server";

console.log("\n========================================");
console.log("   AGENT OSS-117 - Demarrage");
console.log("========================================\n");

startTerminalAgent();
startCodeWriterAgent();
startWebScraperAgent();
startGhostQA();

emitLog("System", "info", "Tous les agents sont operationnels.");
emitLog("System", "info", "Ghost QA actif et a l ecoute.");
emitLog("System", "info", "Serveur web demarre sur le port 3001.");

// Demo
const demo = {
  agent_target: "code_writer",
  action_payload: {
    instruction: "Cree une page web de base",
    parameters: { filename: "index.html", content: "<!DOCTYPE html><html><head><title>Mon OS Agentique</title></head><body><h1>Bonjour OSS 117</h1></body></html>" }
  },
  expect_result_type: "none"
};
setTimeout(() => processBrainOutput(demo), 2000);

// Mode interactif terminal
console.log("\nTapez votre requete (ou 'exit' pour quitter):\n");
const readline = require("readline").createInterface({ input: process.stdin, output: process.stdout });
readline.on("line", async (input: string) => {
  if (input.trim().toLowerCase() === "exit") { readline.close(); process.exit(0); }
  if (input.trim()) {
    const { sendToBrain } = await import("./core/brainClient");
    await sendToBrain(input);
  }
});
