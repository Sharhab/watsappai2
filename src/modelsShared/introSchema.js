// src/modelsShared/introSchema.js
import mongoose from "mongoose";

const introStepSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["video", "audio", "text"],
    required: true,
  },
  content: {
    type: String,
  },
  fileUrl: {
    type: String,
  },
});

const introSchema = new mongoose.Schema({
  sequence: {
    type: [introStepSchema],
    validate: {
      validator: function (seq) {
        if (seq.length !== 6) return false;
        const expectedOrder = ["video", "video", "audio", "audio", "text", "audio"];
        return seq.every((step, i) => step.type === expectedOrder[i]);
      },
      message:
        "Intro must have 6 steps in this order: 2 videos, 2 audios, 1 text, 1 audio.",
    },
    required: true,
  },
});

export default introSchema;
