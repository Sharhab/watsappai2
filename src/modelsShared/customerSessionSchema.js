import mongoose from "mongoose";

const conversationEntrySchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ["customer", "ai"],
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "audio", "video", "image"],
      required: true,
    },
    content: { type: String, required: true }, // text or media URL
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);



const customerSessionSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true, index: true, unique: true },
    hasReceivedWelcome: { type: Boolean, default: false },
    answeredQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: "QA" }],
    conversationHistory: { type: [conversationEntrySchema], default: [] },
    adSource: {
      headline: { type: String, default: null },
      source: { type: String, default: null },
      type: { type: String, default: null },
      ctwa_clid: { type: String, default: null },
    },
  },
  { timestamps: true }
);

// ✅ Export only schema, not model
export default customerSessionSchema;
