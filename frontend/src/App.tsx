import { useState, useEffect, useRef } from "react";
import "./App.css";

interface LogEntry { agent: string; level: string; message: string; timestamp: string }
interface Task { id: string; assigned_to: string; status: string; payload: string; result: string | null; qa_status: string }

const API_URL = "http://localhost:3001/api";
const WS_URL = "ws://localhost:3001/ws";

function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [thinking, setThinking] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => { setConnected(true); setLogs(p => [...p, { agent: "System", level: "info", message: "Connecte au backend", timestamp: new Date().toISOString() }]); };
    ws.onmessage = (e) => { const d = JSON.parse(e.data); if (d.type === "init") setTasks(d.tasks || []); else if (d.type === "log") setLogs(p => [...p, d]); else fetchTasks(); };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  useEffect(() => { fetchTasks(); }, []);
  const fetchTasks = async () => { try { const r = await fetch(API_URL + "/tasks"); setTasks(await r.json()); } catch {} };
  const send = async () => {
    if (!input.trim()) return;
    setLogs(p => [...p, { agent: "Toi", level: "info", message: input, timestamp: new Date().toISOString() }]);
    setInput(""); setThinking(true);
    try { const res = await fetch(API_URL + "/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: input }) }); const data = await res.json(); setLogs(p => [...p, { agent: "Resultat", level: "info", message: data.result, timestamp: new Date().toISOString() }]); fetchTasks(); } catch (e: any) { setLogs(p => [...p, { agent: "System", level: "error", message: e.message, timestamp: new Date().toISOString() }]); }
    setThinking(false);
  };

  const colors: Record<string, string> = { error: "#ff6b6b", warn: "#feca57", info: "#a0a0a0" };
  const emojis: Record<string, string> = { Cerveau: "🧠", Loop: "🔄", CodeWriter: "✍️", TerminalExecutor: "🤖", WebScraper: "🌐", FileReader: "📖", GrepSearch: "🔍", GlobSearch: "📂", GhostQA: "👻", Permission: "🔒", AutoMemory: "💾", System: "⚙️", Toi: "👤", Resultat: "✅" };

  return (
    <div className="os-container">
      <header className="top-bar">
        <h1>OSS-117</h1>
        <div className={connected ? "status online" : "status offline"}>{connected ? "● Online" : "● Offline"}</div>
      </header>
      <div className="main-grid">
        <section className="pane">
          <h2>🧠 Cerveau {thinking && <span style={{ color: "#feca57", fontSize: "11px" }}>● thinking...</span>}</h2>
          <div className="chat-area">
            {logs.length === 0 && <p style={{ color: "#555", textAlign: "center", padding: "20px" }}>En attente de mission...</p>}
            {logs.map((l, i) => <div key={i} className="log-line" style={{ color: colors[l.level] || "#aaa" }}><span className="log-time">{new Date(l.timestamp).toLocaleTimeString()}</span> <span className="log-agent">{emojis[l.agent] || "❓"} [{l.agent}]</span> {l.message}</div>)}
            <div ref={logEndRef} />
          </div>
          <div className="input-area">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Votre mission..." disabled={!connected || thinking} />
            <button onClick={send} disabled={!connected || thinking}>{thinking ? "⏳" : "🚀"}</button>
          </div>
        </section>
        <section className="pane">
          <h2>📋 Tâches ({tasks.length})</h2>
          <div className="task-list">
            {tasks.map(t => <div key={t.id} className={"task-item " + t.status.toLowerCase()}><div className="task-header"><span className="task-agent">{t.assigned_to}</span><span className="badge">{t.status}</span></div><div className="task-payload">{(() => { try { return JSON.parse(t.payload).instruction?.substring(0, 80); } catch { return ""; } })()}</div>{t.result && <div className="task-result">{t.result.substring(0, 120)}</div>}</div>)}
          </div>
        </section>
        <section className="pane">
          <h2>📊 Agents</h2>
          <div className="agent-list">
            <div className="agent-card"><span>🤖 Terminal</span><span className="active">●</span></div>
            <div className="agent-card"><span>✍️ Code Writer</span><span className="active">●</span></div>
            <div className="agent-card"><span>🌐 Web Scraper</span><span className="active">●</span></div>
            <div className="agent-card"><span>📖 File Reader</span><span className="active">●</span></div>
            <div className="agent-card"><span>🔍 Grep Search</span><span className="active">●</span></div>
            <div className="agent-card"><span>📂 Glob Search</span><span className="active">●</span></div>
            <div className="agent-card"><span>🧠 RAG Memory</span><span className="active">●</span></div>
            <div className="agent-card"><span>👻 Ghost QA</span><span className="active">●</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}
export default App;
