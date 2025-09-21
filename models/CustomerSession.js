import mongoose from "mongoose";

// Conversation entry schema for session history
const conversationEntrySchema = new mongoose.Schema({
  userMessage: { type: String },                  // what customer sent
  botReply: { type: String },                     // what AI replied
  messageType: { 
    type: String, 
    enum: ["text", "audio", "video", "image", "file"], // ✅ expanded
    default: "text" 
  },
  timestamp: { type: Date, default: Date.now }
});

// Customer session schema
const customerSessionSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true, unique: true },

    hasReceivedWelcome: { type: Boolean, default: false },

    answeredQuestions: [
      { type: mongoose.Schema.Types.ObjectId, ref: "QA" }
    ],

    conversationHistory: { 
      type: [conversationEntrySchema], 
      default: [] 
    },

    // ✅ structured ad source metadata
    adSource: {
      headline: { type: String, default: null },
      source: { type: String, default: null },
      type: { type: String, default: null },
      ctwa_clid: { type: String, default: null }
    }
  },
  {
    timestamps: true // auto-manages createdAt & updatedAt
  }
);

export default mongoose.model("CustomerSession", customerSessionSchema);
