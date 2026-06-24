import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import "dotenv/config";
import { eventBus, EVENT_CHANNELS } from "./core/eventBus";
import { getAllTasks, getLogs } from "./core/blackboard";
import { sendToBrain } from "./core/brainClient";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.get("/api/tasks", (_req, res) => res.json(getAllTasks()));
app.get("/api/logs", (req, res) => res.json(getLogs(parseInt(req.query.limit as string) || 50)));
app.post("/api/brain", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Champ prompt requis." });
  try { const result = await sendToBrain(prompt); res.json({ success: true, result }); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});

wss.on("connection", (ws) => {
  console.log("[WS] Client connecte.");
  ws.send(JSON.stringify({ type: "init", tasks: getAllTasks(), logs: getLogs(20) }));
  const onLog = (e: any) => ws.send(JSON.stringify({ type: "log", ...e }));
  const onTask = (id: string) => ws.send(JSON.stringify({ type: "task_created", taskId: id }));
  const onDone = (id: string, r: string) => ws.send(JSON.stringify({ type: "task_completed", taskId: id, result: r }));
  const onAudit = (id: string) => ws.send(JSON.stringify({ type: "task_audited", taskId: id }));
  const onReject = (id: string, r: string) => ws.send(JSON.stringify({ type: "task_rejected", taskId: id, report: r }));
  eventBus.on(EVENT_CHANNELS.LOG, onLog);
  eventBus.on(EVENT_CHANNELS.TASK_CREATED, onTask);
  eventBus.on(EVENT_CHANNELS.TASK_COMPLETED, onDone);
  eventBus.on(EVENT_CHANNELS.TASK_AUDITED, onAudit);
  eventBus.on(EVENT_CHANNELS.TASK_REJECTED, onReject);
  ws.on("close", () => {
    eventBus.off(EVENT_CHANNELS.LOG, onLog);
    eventBus.off(EVENT_CHANNELS.TASK_CREATED, onTask);
    eventBus.off(EVENT_CHANNELS.TASK_COMPLETED, onDone);
    eventBus.off(EVENT_CHANNELS.TASK_AUDITED, onAudit);
    eventBus.off(EVENT_CHANNELS.TASK_REJECTED, onReject);
    console.log("[WS] Client deconnecte.");
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Serveur API: http://localhost:${PORT}/api`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});
