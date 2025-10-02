import mongoose from "mongoose";

const conversationEntrySchema = new mongoose.Schema({
  userMessage: { type: String },
  botReply: { type: String },
  messageType: { type: String, enum: ["text","audio","video","image","file"], default: "text" },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const customerSessionSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, index: true, unique: true },
  hasReceivedWelcome: { type: Boolean, default: false },
  answeredQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: "QA" }],
  conversationHistory: { type: [conversationEntrySchema], default: [] },
  adSource: {
    headline: { type: String, default: null },
    source:   { type: String, default: null },
    type:     { type: String, default: null },
    ctwa_clid:{ type: String, default: null }
  }
}, { timestamps: true });


export { customerSessionSchema };
export default mongoose.models.CustomerSession ||
  mongoose.model("CustomerSession", customerSessionSchema);