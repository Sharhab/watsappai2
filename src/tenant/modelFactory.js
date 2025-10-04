// src/tenant/modelFactory.js
import mongoose from "mongoose";

// --- Shared Schemas ---
import qaSchema from "../modelsShared/qaSchema.js";
import introSchema from "../modelsShared/introSchema.js";
import customerSessionSchema from "../modelsShared/customerSessionSchema.js";
import orderSchema from "../modelsShared/orderSchema.js";
import conversationSchema from "../modelsShared/conversationSchema.js";

/**
 * Dynamically attach models to a tenant-specific Mongoose connection.
 * Each tenant DB must have its own compiled models.
 * This version caches safely and prevents "OverwriteModelError" or
 * "The 2nd parameter to mongoose.model()..." errors.
 */
export function createModelsForConnection(conn) {
  if (!conn) throw new Error("❌ Missing tenant DB connection");

  // --- Model caching to prevent duplication ---
  if (!conn.models.QA) {
    conn.model("QA", qaSchema);
    console.log(`✅ QA model attached to ${conn.name}`);
  }

  if (!conn.models.Intro) {
    conn.model("Intro", introSchema);
    console.log(`✅ Intro model attached to ${conn.name}`);
  }

  if (!conn.models.CustomerSession) {
    conn.model("CustomerSession", customerSessionSchema);
    console.log(`✅ CustomerSession model attached to ${conn.name}`);
  }

  if (!conn.models.Order) {
    conn.model("Order", orderSchema);
    console.log(`✅ Order model attached to ${conn.name}`);
  }

  if (!conn.models.Conversation) {
    conn.model("Conversation", conversationSchema);
    console.log(`✅ Conversation model attached to ${conn.name}`);
  }

  // --- Return compiled models for use in routes ---
  return {
    QA: conn.models.QA,
    Intro: conn.models.Intro,
    CustomerSession: conn.models.CustomerSession,
    Order: conn.models.Order,
    Conversation: conn.models.Conversation,
  };
}
