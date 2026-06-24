import { emitLog } from "../core/eventBus";
import { vectorStore } from "../core/vectorStore";

const OLLAMA_URL = process.env.BRAIN_BASE_URL || "http://localhost:11434";

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch(OLLAMA_URL.replace("/v1", "") + "/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text.substring(0, 2000) })
  });
  if (!res.ok) throw new Error("Embedding API error: HTTP " + res.status);
  const data = await res.json();
  return data.embedding;
}

function detectAction(instruction: string): string {
  const lower = instruction.toLowerCase();
  if (lower.match(/stock|enregist|sauv|store|memoris|ajout/)) return "store";
  if (lower.match(/cherch|search|query|trouv|recup|recall|rappele/)) return "search";
  if (lower.match(/compt|count|nombre|combien/)) return "count";
  if (lower.match(/effac|clear|vid|supprim|netto/)) return "clear";
  return "search";
}

export async function execRagMemory(payload: any): Promise<string> {
  const action = payload.parameters?.action || detectAction(payload.instruction);
  const text = payload.parameters?.text || payload.instruction;

  emitLog("RagMemory", "info", "Action detectee: " + action);

  if (action === "store") {
    const cleanText = text.replace(/^(stock|enregist|sauv)\w*\s+(le\s+)?(texte\s+)?(suivant\s*[:\s]*)?/i, "").trim();
    const embedding = await getEmbedding(cleanText);
    const count = vectorStore.add(cleanText, embedding, { agent: "rag_memory" });
    emitLog("RagMemory", "info", "Stocke (" + count + " elements, dim " + embedding.length + ")");
    return "Succes: Memoire stockee. Total: " + count + " elements. Dimension: " + embedding.length + ".";
  }
  if (action === "search") {
    const q = await getEmbedding(text);
    const results = vectorStore.search(q, 3);
    if (results.length === 0) return "Aucune memoire trouvee. Le store est vide ou aucune correspondance.";
    emitLog("RagMemory", "info", results.length + " resultats");
    return JSON.stringify(results.map((r: any) => ({ text: r.text.substring(0, 500), score: r.score.toFixed(3), timestamp: r.metadata.timestamp })));
  }
  if (action === "count") return "Memoire contient " + vectorStore.count() + " elements.";
  if (action === "clear") { vectorStore.clear(); return "Memoire effacee."; }
  return "Erreur: action inconnue. Utilise store, search, count ou clear.";
}
