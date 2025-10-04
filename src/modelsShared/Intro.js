import mongoose from "mongoose";

const introStepSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["video", "audio", "text"], required: true },
    content: { type: String },
    fileUrl: { type: String },
  },
  { _id: false }
);

const introSchema = new mongoose.Schema(
  {
    sequence: {
      type: [introStepSchema],
      validate: {
        validator(seq) {
          if (seq.length !== 6) return false;
          const order = ["video", "video", "audio", "audio", "text", "audio"];
          return seq.every((s, i) => s.type === order[i]);
        },
        message:
          "Intro must be 6 steps in order: video, video, audio, audio, text, audio",
      },
      required: true,
    },
  },
  { timestamps: true }
);

// ✅ Export only schema (not model)
export default introSchema;
