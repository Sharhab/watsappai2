// /scripts/updateEmbeddings.js
process.env.TRANSFORMERS_BACKEND = "wasm"; // ✅ Force WASM backend (no onnxruntime)

// Load env before mongo
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { embedText } from "../src/utils/embed.js"; // ✅ Will also use WASM
import QA from "../src/modelsShared/QA.js";

async function run() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected");

    console.log("🔄 Fetching QAs...");
    const qas = await QA.find({});

    console.log(`📌 Found: ${qas.length} QAs`);
    let count = 0;

    for (const qa of qas) {
      // Ensure text is normalized before embedding
      const text = (qa.question || "").trim();
      if (!text) continue;

      const vec = await embedText(text); // ✅ Embedding using WASM
      qa.embedding = vec;
      await qa.save();

      count++;
      if (count % 10 === 0) console.log(`➡️ Embedded ${count}/${qas.length}`);
    }

    console.log("✅ All embeddings updated successfully!");
  } catch (err) {
    console.error("❌ Embedding update failed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

run();
