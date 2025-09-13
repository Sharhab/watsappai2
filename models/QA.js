const mongoose = require("mongoose");

const qaSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    unique: true
  },
  answerText: {
    type: String
  },
  answerAudio: {
    type: String
  },
  type: {
    type: String,
    enum: ["qa", "intro"],
    default: "qa"
  },
  sequence: [
    {
      type: {
        type: String,
        enum: ["text", "audio", "video"],
        required: true
      },
      content: {
        type: String,
        required: true
      }
    }
  ]
});

module.exports = mongoose.model("Question", qaSchema);

