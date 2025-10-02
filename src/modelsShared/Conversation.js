import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender: { type: String, enum: ["customer","ai"], required: true },
  content: String,
  type: { type: String, enum: ["text","audio","video","image","file"], default: "text" },
  timestamp: { type: Date, default: Date.now },
  matchedQA: { type: String },
  confidence: { type: Number }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  sessionId: { type: String },
  messages: { type: [messageSchema], default: [] }
}, { timestamps: true });

export { conversationSchema };
export default mongoose.models.Conversation ||
  mongoose.model("Conversation", conversationSchema);