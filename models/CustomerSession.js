import mongoose from "mongoose";

const customerSessionSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  hasReceivedWelcome: { type: Boolean, default: false },
  answeredQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: "QA" }],
  history: [
    {
      userMessage: String,
      botReply: String,
      timestamp: { type: Date, default: Date.now }
    }
  ],
  metadata: {
    adHeadline: String,
    adTag: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("CustomerSession", customerSessionSchema);
