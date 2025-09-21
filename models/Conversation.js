import mongoose from "mongoose";

// Each message in the conversation
const messageSchema = new mongoose.Schema({
  sender: { 
    type: String, 
    enum: ["customer", "ai"], 
    required: true 
  },
  content: { type: String },              // text body or file URL
  type: { 
    type: String, 
    enum: ["text", "audio", "video", "image", "file"], // ✅ expanded
    default: "text" 
  },
  timestamp: { type: Date, default: Date.now },
  matchedQA: { type: String },            // which QA triggered this answer
  confidence: { type: Number }            // fuzzy match score
});

// Conversation session
const conversationSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    sessionId: { type: String },          // to track across ads/sessions
    messages: { type: [messageSchema], default: [] }
  },
  {
    timestamps: true // ✅ auto-manages createdAt & updatedAt
  }
);

export default mongoose.model("Conversation", conversationSchema);
