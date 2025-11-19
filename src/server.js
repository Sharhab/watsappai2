import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";

import conversationsRoutes from "./routes/conversations.routes.js";
import statusRoutes from "./routes/status.routes.js";
import authRoutes from "./routes/auth.routes.js";
import tenantsRoutes from "./routes/tenants.routes.js";
import qaRoutes from "./routes/qas.routes.js";
import introRoutes from "./routes/intro.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import messagesRoutes from "./routes/messages.routes.js";

import { authOptional } from "./middleware/auth.js";

// Realtime / Socket.IO
import http from "http";
import { initRealtime, pushEvent as sendEvent } from "./utils/realtime.js";

async function startServer() {
  const app = express();

  // ✔️ Create HTTP server BEFORE initializing Socket.IO
  const server = http.createServer(app);

  // ✔️ Initialize realtime ONCE
  initRealtime(server);

  // ✔️ Expose pushEvent to all files
  global.pushEvent = sendEvent;

  // Security
  app.use(helmet());
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ extended: true }));

  // CORS
  app.use(
    cors({
      origin: [
        "http://localhost:5173",
        "https://watsappai.onrender.com",
        "https://watsappai2.onrender.com",
      ],
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-tenant-id"],
      exposedHeaders: ["Authorization"],
    })
  );

  // DB Connection
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("✅ Master DB connected");
  } catch (err) {
    console.error("❌ DB connection failed:", err.message);
    process.exit(1);
  }

  // Auth Middleware
  app.use(authOptional);

  // Routes
  app.use("/", statusRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/tenants", tenantsRoutes);
  app.use("/api/qas", qaRoutes);
  app.use("/api/intro", introRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/", webhookRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/conversations", conversationsRoutes);
  app.use("/api/messages", messagesRoutes);

  // Start API + Realtime server
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`🚀 API + REALTIME running on port ${port}`);
  });
}

startServer();
