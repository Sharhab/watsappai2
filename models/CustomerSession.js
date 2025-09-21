import mongoose from "mongoose";

const customerSessionSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  hasReceivedWelcome: { type: Boolean, default: false },
  answeredQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: "QA" }],
  conversationHistory: [
    {
       userMessage: { type: String },  // what customer sent
      botReply: { type: String },     // what AI replied
      messageType: { type: String, enum: ["text", "audio"] },
      timestamp: { type: Date, default: Date.now },
    }
  ],
  adSource: {
    headline: String,
    campaignId: String,
    source: String,
   type: String,
    ctwa_clid: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("CustomerSession", customerSessionSchema);
