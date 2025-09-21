import mongoose from "mongoose";

const ConversationEntrySchema = new mongoose.Schema({
  userMessage: { type: String },              // what customer sent
  botReply: { type: String },                 // what AI replied
  messageType: { type: String, enum: ["text", "audio"] },
  timestamp: { type: Date, default: Date.now }
});

const CustomerSessionSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true, unique: true },

    hasReceivedWelcome: { type: Boolean, default: false },

    answeredQuestions: [
      { type: mongoose.Schema.Types.ObjectId, ref: "QA" }
    ],

    conversationHistory: {
      type: [ConversationEntrySchema],
      default: []
    },

    // ✅ structured ad source metadata
    adSource: {
      headline: { type: String, default: null },
      source: { type: String, default: null },
      type: { type: String, default: null },
      ctwa_clid: { type: String, default: null }
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true // ✅ auto-manages createdAt & updatedAt
  }
);

export default mongoose.model("CustomerSession", CustomerSessionSchema);
