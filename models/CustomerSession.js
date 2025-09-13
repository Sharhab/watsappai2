// models/CustomerSession.js
const mongoose = require("mongoose");

const customerSessionSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },

  // Track if intro sequence has been sent
  hasReceivedWelcome: { type: Boolean, default: false },

  // Keep track of all questions answered for this customer
  answeredQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: "QA" }],

  // Full message history (optional, for debugging & future use)
  history: [
    {
      userMessage: String,
      botReply: String,
      timestamp: { type: Date, default: Date.now }
    }
  ],

  // Metadata (like ad headline, tags, etc.)
  metadata: {
    adHeadline: String,
    adTag: String
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("CustomerSession", customerSessionSchema);
