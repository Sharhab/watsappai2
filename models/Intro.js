import mongoose from "mongoose";

const introStepSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["video", "audio", "text"],
    required: true,
  },
  content: {
    type: String, // text content OR file path
    required: false,
  },
  fileUrl: {
    type: String, // for uploaded file
    required: false,
  },
});

const introSchema = new mongoose.Schema({
  sequence: {
    type: [introStepSchema],
    validate: {
      validator: function (seq) {
        if (seq.length !== 6) return false;

        // Expected order by type only
        const expectedOrder = ["video", "video", "audio", "audio", "text", "audio"];
        return seq.every((step, i) => step.type === expectedOrder[i]);
      },
      message:
        "Intro sequence must have exactly 6 steps in this order: 2 videos, 2 audios, 1 text, 1 audio.",
    },
    required: true,
  },
});

export default mongoose.model("Intro", introSchema);
