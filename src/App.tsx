$content = @'
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
  const [permLevel, setPermLevel] = useState("normal");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => { setConnected(true); setLogs(p => [...p, { agent: "System", level: "info", message: "Connecte au backend OSS-117", timestamp: new Date().toISOString() }]); };
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "init") setTasks(d.tasks || []);
      else if (d.type === "log") setLogs(p => [...p, d]);
      else fetchTasks();
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  useEffect(() => { fetchTasks(); fetchPerm(); }, []);

  const fetchTasks = async () => { try { const r = await fetch(API_URL + "/tasks"); setTasks(await r.json()); } catch {} };
  const fetchPerm = async () => { try { const r = await fetch(API_URL + "/permissions"); setPermLevel((await r.json()).level); } catch {} };

  const changePerm = async (level: string) => {
    await fetch(API_URL + "/permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ level }) });
    setPermLevel(level);
  };

  const send = async () => {
    if (!input.trim()) return;
    setLogs(p => [...p, { agent: "Toi", level: "info", message: input, timestamp: new Date().toISOString() }]);
    setInput(""); setThinking(true);
    try {
      const res = await fetch(API_URL + "/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: input }) });
      const data = await res.json();
      setLogs(p => [...p, { agent: "Resultat", level: "info", message: data.result, timestamp: new Date().toISOString() }]);
      fetchTasks();
    } catch (e: any) { setLogs(p => [...p, { agent: "System", level: "error", message: e.message, timestamp: new Date().toISOString() }]); }
    setThinking(false);
  };

  const colors: Record<string, string> = { error: "#ff6b6b", warn: "#feca57", info: "#a0a0a0" };
  const emojis: Record<string, string> = { Cerveau: "🧠", Loop: "🔄", Routeur: "🛡️", CodeWriter: "✍️", TerminalExecutor: "🤖", WebScraper: "🌐", FileReader: "📖", GrepSearch: "🔍", GlobSearch: "📂", GhostQA: "👻", Permission: "🔒", System: "⚙️", Toi: "👤", Resultat: "✅" };
  const permColors: Record<string, string> = { strict: "#ff6b6b", normal: "#feca57", auto: "#51cf66" };

  return (
    <div className="os-container">
      <header className="top-bar">
        <h1>🕵️ OSS-117</h1>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <select value={permLevel} onChange={e => changePerm(e.target.value)} style={{ background: "#1a1a2e", color: permColors[permLevel], border: "1px solid #2a2a4a", padding: "4px 8px", borderRadius: "4px", fontFamily: "monospace" }}>
            <option value="strict">🔒 Strict</option>
            <option value="normal">🟡 Normal</option>
            <option value="auto">🟢 Auto</option>
          </select>
          <div className={connected ? "status online" : "status offline"}>● {connected ? "Online" : "Offline"}</div>
        </div>
      </header>

      <div className="main-grid">
        <section className="pane">
          <h2>🧠 Cerveau {thinking && <span style={{ color: "#feca57", fontSize: "11px" }}>● thinking...</span>}</h2>
          <div className="chat-area">
            {logs.length === 0 && <p style={{ color: "#555", textAlign: "center", padding: "20px" }}>En attente de mission...</p>}
            {logs.map((l, i) => (
              <div key={i} className="log-line" style={{ color: colors[l.level] || "#aaa" }}>
                <span className="log-time">{new Date(l.timestamp).toLocaleTimeString()}</span>{" "}
                <span className="log-agent">{emojis[l.agent] || "❓"} [{l.agent}]</span>{" "}
                {l.message}
              </div>
            ))}
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
            {tasks.length === 0 && <p style={{ color: "#555", textAlign: "center", padding: "20px" }}>Aucune tâche</p>}
            {tasks.map(t => (
              <div key={t.id} className={"task-item " + t.status.toLowerCase()}>
                <div className="task-header">
                  <span className="task-agent">{emojis[t.assigned_to] || "❓"} {t.assigned_to}</span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <span className="badge" style={{ background: t.status === "COMPLETED" ? "#51cf66" : t.status === "RUNNING" ? "#feca57" : "#4a9eff" }}>{t.status}</span>
                    {t.qa_status === "AUDITED" && <span className="badge" style={{ background: "#51cf66" }}>✅</span>}
                    {t.qa_status === "REJECTED" && <span className="badge" style={{ background: "#ff6b6b" }}>❌</span>}
                  </div>
                </div>
                <div className="task-payload">{(() => { try { return JSON.parse(t.payload).instruction?.substring(0, 80); } catch { return ""; } })()}</div>
                {t.result && <div className="task-result">{t.result.substring(0, 120)}</div>}
              </div>
            ))}
          </div>
        </section>

        <section className="pane">
          <h2>📊 Agents</h2>
          <div className="agent-list">
            <div className="agent-card"><span>🤖 Terminal Executor</span><span className="active">●</span></div>
            <div className="agent-card"><span>✍️ Code Writer</span><span className="active">●</span></div>
            <div className="agent-card"><span>🌐 Web Scraper</span><span className="active">●</span></div>
            <div className="agent-card"><span>📖 File Reader</span><span className="active">●</span></div>
            <div className="agent-card"><span>🔍 Grep Search</span><span className="active">●</span></div>
            <div className="agent-card"><span>📂 Glob Search</span><span className="active">●</span></div>
            <div className="agent-card"><span>🧠 RAG Memory</span><span className="inactive">○ Bientot</span></div>
            <div className="agent-card"><span>👻 Ghost QA</span><span className="active">●</span></div>
          </div>
          <div style={{ marginTop: "12px", padding: "10px", background: "#0a0a0a", borderRadius: "4px", fontSize: "11px", color: "#555" }}>
            <div>Backend: localhost:3001</div>
            <div>Model: gemma4:12b</div>
            <div>Permission: {permLevel}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
'@
Set-Content -Path "D:\IA\AgentOSS117\frontend\src\App.tsx" -Value $content -Encoding utf8
