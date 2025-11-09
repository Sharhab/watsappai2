import "dotenv/config";
import mongoose from "mongoose";
import introSchema from "./src/modelsShared/Intro.js"; // this is a schema, not a model

console.log("🔌 Connecting to MongoDB...");
await mongoose.connect(process.env.MONGO_URI);

console.log("✅ Connected");

// ✅ Create model from schema
const Intro = mongoose.model("Intro", introSchema);

// ✅ Fetch intro document
const intro = await Intro.findOne();
if (!intro) {
  console.log("❌ No intro document found");
  process.exit(0);
}

if (!intro.sequence || !Array.isArray(intro.sequence)) {
  console.log("❌ Intro found but sequence is missing or invalid");
  process.exit(0);
}

// ✅ Clean hidden unicode characters (zero-width chars)
intro.sequence = intro.sequence.map(step => {
  if (step.fileUrl) {
    const cleaned = step.fileUrl.replace(/[\u200B-\u200D\uFEFF]/g, "");
    if (cleaned !== step.fileUrl) {
      console.log(`🔧 Fixed URL:`);
      console.log(`   Before: ${step.fileUrl}`);
      console.log(`   After:  ${cleaned}`);
    }
    step.fileUrl = cleaned;
  }
  return step;
});

// ✅ Save corrected intro sequence
await intro.save();
console.log("✅ Cleaned all invisible characters and saved.");
process.exit(0);
