import mongoose from "mongoose";

const qaSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, unique: true },
    answerText: { type: String },
    answerAudio: { type: String },
    type: { type: String, enum: ["qa", "intro"], default: "qa" },

    // ✅ INTRO SEQUENCE (unchanged)
    sequence: [
      {
        type: { type: String, enum: ["text", "audio", "image"], required: true },
        content: { type: String, required: true },
      },
    ],

    // ✅ NEW: Embedding vector for semantic similarity
    embedding: {
      type: [Number], // array of floats
      default: [], // safe default (empty array)
      index: "2dsphere", // speed up similarity later
    },
  },
  { timestamps: true }
);

export default mongoose.model("QA", qaSchema);
