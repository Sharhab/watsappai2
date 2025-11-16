// src/routes/sse.routes.js
import express from "express";
const router = express.Router();

// Store all connected clients
let clients = [];

router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const clientId = Date.now();

  const newClient = {
    id: clientId,
    res,
  };

  clients.push(newClient);
  console.log("📡 SSE client connected:", clientId);

  res.write(`event: connected\ndata: ${clientId}\n\n`);

  req.on("close", () => {
    console.log("❌ SSE client disconnected:", clientId);
    clients = clients.filter((c) => c.id !== clientId);
  });
});

export function pushEvent(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client) => client.res.write(payload));
}

export default router;
