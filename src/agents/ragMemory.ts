import { exec } from "child_process";
import { promisify } from "util";
import { emitLog } from "../core/eventBus";
import { vectorStore } from "../core/vectorStore";

const execAsync = promisify(exec);

async function getEmbedding(text: string): Promise<number[]> {
  const { stdout } = await execAsync("ollama embed -m nomic-embed-text " + JSON.stringify(text.substring(0, 2000)), { timeout: 30000 });
  return JSON.parse(stdout.trim());
}

export async function execRagMemory(payload: any): Promise<string> {
  const action = payload.parameters?.action || "search";
  const text = payload.parameters?.text || payload.instruction;

  if (action === "store" || action === "save") {
    const embedding = await getEmbedding(text);
    const count = vectorStore.add(text, embedding, { agent: "rag_memory" });
    emitLog("RagMemory", "info", "Stocke (" + count + " elements)");
    return "Memoire stockee. Total: " + count + " elements.";
  }
  if (action === "search" || action === "query") {
    const q = await getEmbedding(text);
    const results = vectorStore.search(q, 3);
    if (results.length === 0) return "Aucune memoire trouvee.";
    emitLog("RagMemory", "info", results.length + " resultats");
    return JSON.stringify(results.map(r => ({ text: r.text.substring(0, 500), score: r.score.toFixed(3), timestamp: r.metadata.timestamp })));
  }
  if (action === "count") return "Memoire: " + vectorStore.count() + " elements.";
  if (action === "clear") { vectorStore.clear(); return "Memoire effacee."; }
  return "Erreur: action inconnue. Utilise store, search, count ou clear.";
}
