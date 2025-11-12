// src/server.j
// FORCE TRANSFORMERS TO USE WASM (no onnxruntime-node needed)
process.env.TRANSFORMERS_BACKEND = "wasm";
globalThis.TRANSFORMERS_BACKEND = "wasm";

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
import { authOptional } from "./middleware/auth.js";
import messagesRoutes from "./routes/messages.routes.js";




async function startServer() {
  const app = express();

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
   exposedHeaders: ["Authorization"]
  })
);

  // ✅ Master DB (tenants + users)
  try {
    console.log("GCP client email env:", process.env.GCP_CLIENT_EMAIL);
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("✅ Master DB connected");
  } catch (err) {
    console.error("❌ Master DB connection failed:", err.message);
    process.exit(1);
  }

  // ✅ Global auth (optional)
  app.use(authOptional);

  // ✅ Routes
  app.use("/", statusRoutes); // e.g. /twilio-status
  app.use("/api/auth", authRoutes); // register/login
  app.use("/api/tenants", tenantsRoutes);
  app.use("/api/qas", qaRoutes);
  app.use("/api/intro", introRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/", webhookRoutes); // /webhook
app.use("/api/payments", paymentsRoutes);
app.use("/api/conversations", conversationsRoutes);
app.use("/api/messages", messagesRoutes);


  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`✅ API running on http://localhost:${port}`);
  });
}

// Start
startServer();
