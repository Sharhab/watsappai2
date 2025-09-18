import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender: { type: String, enum: ["customer", "ai"], required: true },
  content: String,
  type: { type: String, enum: ["text", "audio", "video"], default: "text" },
  timestamp: { type: Date, default: Date.now },
  matchedQA: { type: String }, // which QA triggered this answer
  confidence: { type: Number }, // fuzzy match score
});

const conversationSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  sessionId: { type: String }, // to track across ads/sessions
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("Conversation", conversationSchema);
