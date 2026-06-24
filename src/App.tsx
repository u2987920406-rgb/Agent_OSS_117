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
  const [streaming, setStreaming] = useState("");
  const [permLevel, setPermLevel] = useState("normal");
  const [thinking, setThinking] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setConnected(true);
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      switch (d.type) {
        case "init": setTasks(d.tasks || []); break;
        case "log": setLogs(p => [...p, d]); break;
        case "stream_token": setStreaming(p => p + d.token); break;
        case "stream_done": setStreaming(""); setThinking(false); break;
        default: fetchTasks();
      }
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  useEffect(() => { fetchTasks(); fetchPermLevel(); }, []);

  const fetchTasks = async () => { try { const r = await fetch(API_URL + "/tasks"); setTasks(await r.json()); } catch {} };
  const fetchPermLevel = async () => { try { const r = await fetch(API_URL + "/permissions"); setPermLevel((await r.json()).level); } catch {} };

  const changePerm = async (level: string) => {
    await fetch(API_URL + "/permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ level }) });
    setPermLevel(level);
  };

  const send = async () => {
    if (!input.trim()) return;
    setLogs(p => [...p, { agent: "Toi", level: "info", message: input, timestamp: new Date().toISOString() }]);
    setInput(""); setThinking(true); setStreaming("");
    try { await fetch(API_URL + "/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: input }) }); }
    catch (e: any) { setThinking(false); setLogs(p => [...p, { agent: "System", level: "error", message: e.message, timestamp: new Date().toISOString() }]); }
  };

  const colors: any = { error: "#ff6b6b", warn: "#feca57", info: "#a0a0a0" };
  const emojis: any = { Cerveau: "🧠", Loop: "🔄", Routeur: "🛡️", CodeWriter: "✍️", TerminalExecutor: "🤖", WebScraper: "🌐", GhostQA: "👻", Permission: "🔒", System: "⚙️", Toi: "👤" };
  const permColors: any = { strict: "#ff6b6b", normal: "#feca57", auto: "#51cf66" };

  return (
    <div className="os-container">
      <header className="top-bar">
        <h1>OSS-117 v0.3.0</h1>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <select value={permLevel} onChange={e => changePerm(e.target.value)} style={{ background: "#1a1a2e", color: permColors[permLevel], border: "1px solid #2a2a4a", padding: "4px 8px", borderRadius: "4px" }}>
            <option value="strict">🔒 Strict</option>
            <option value="normal">🟡 Normal</option>
            <option value="auto">🟢 Auto</option>
          </select>
          <div className={connected ? "status online" : "status offline"}>● {connected ? "Connecte" : "Hors ligne"}</div>
        </div>
      </header>

      <div className="main-grid">
        <section className="pane">
          <h2>🧠 Cerveau {thinking && <span style={{ color: "#feca57", fontSize: "11px" }}>(thinking...)</span>}</h2>
          <div className="chat-area">
            {streaming && <div className="stream-text">{streaming}<span className="cursor">▋</span></div>}
            {logs.map((l, i) => <div key={i} className="log-line" style={{ color: colors[l.level] || "#aaa" }}>
              <span className="log-time">{new Date(l.timestamp).toLocaleTimeString()}</span>
              {" "}<span className="log-agent">{emojis[l.agent] || "❓"} [{l.agent}]</span> {l.message}
            </div>)}
            <div ref={logEndRef} />
          </div>
          <div className="input-area">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Mission..." disabled={!connected || thinking} />
            <button onClick={send} disabled={!connected || thinking}>{thinking ? "..." : "Go"}</button>
          </div>
        </section>

        <section className="pane">
          <h2>📋 Taches ({tasks.length})</h2>
          <div className="task-list">
            {tasks.map(t => <div key={t.id} className={"task-item " + t.status.toLowerCase()}>
              <div className="task-header"><span className="task-agent">{t.assigned_to}</span><span className="badge">{t.status}</span></div>
              <div className="task-payload">{(() => { try { return JSON.parse(t.payload).instruction?.substring(0, 80); } catch { return ""; } })()}</div>
              {t.result && <div className="task-result">{t.result.substring(0, 100)}</div>}
            </div>)}
          </div>
        </section>

        <section className="pane">
          <h2>📊 Agents</h2>
          <div className="agent-list">
            <div className="agent-card"><span>🤖 Terminal</span><span className="active">● Actif</span></div>
            <div className="agent-card"><span>✍️ Code Writer</span><span className="active">● Actif</span></div>
            <div className="agent-card"><span>🌐 Web Scraper</span><span className="active">● Actif</span></div>
            <div className="agent-card"><span>📖 File Reader</span><span className="active">● Actif</span></div>
            <div className="agent-card"><span>🔍 Grep Search</span><span className="active">● Actif</span></div>
            <div className="agent-card"><span>📂 Glob Search</span><span className="active">● Actif</span></div>
            <div className="agent-card"><span>👻 Ghost QA</span><span className="active">● Actif</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}
export default App;
