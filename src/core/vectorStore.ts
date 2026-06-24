import * as fs from "fs";
import * as path from "path";

const STORE_FILE = path.join(process.cwd(), "vector_store.json");

interface VectorEntry { id: string; text: string; embedding: number[]; metadata: { agent: string; timestamp: string; taskId?: string } }

class VectorStore {
  private entries: VectorEntry[] = [];
  private loaded = false;
  private load() { if (this.loaded) return; if (fs.existsSync(STORE_FILE)) { try { this.entries = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8")); } catch {} } this.loaded = true; }
  private save() { fs.writeFileSync(STORE_FILE, JSON.stringify(this.entries, null, 2), "utf-8"); }
  add(text: string, embedding: number[], metadata: { agent: string; taskId?: string }) {
    this.load();
    this.entries.push({ id: Date.now().toString(36), text, embedding, metadata: { agent: metadata.agent, timestamp: new Date().toISOString(), taskId: metadata.taskId } });
    this.save(); return this.entries.length;
  }
  search(q: number[], topK: number = 3): { text: string; score: number; metadata: any }[] {
    this.load(); if (this.entries.length === 0) return [];
    return this.entries.map(e => ({ text: e.text, score: this.cos(q, e.embedding), metadata: e.metadata })).sort((a, b) => b.score - a.score).slice(0, topK);
  }
  private cos(a: number[], b: number[]): number { let d=0,na=0,nb=0; for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];} const m=Math.sqrt(na)*Math.sqrt(nb); return m===0?0:d/m; }
  count(): number { this.load(); return this.entries.length; }
  clear() { this.entries = []; this.save(); }
}
export const vectorStore = new VectorStore();
