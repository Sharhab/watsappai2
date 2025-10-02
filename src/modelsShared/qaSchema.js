// src/modelsShared/qaSchema.js
import mongoose from "mongoose";

const qaSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    unique: true,
  },
  answerText: {
    type: String,
  },
  answerAudio: {
    type: String,
  },
  answerVideo: {
    type: String,
  },
  type: {
    type: String,
    enum: ["qa", "intro"],
    default: "qa",
  },
  sequence: [
    {
      type: {
        type: String,
        enum: ["text", "audio", "video"],
        required: true,
      },
      content: {
        type: String,
        required: true,
      },
      fileUrl: {
        type: String,
      },
    },
  ],
});

export default qaSchema;
