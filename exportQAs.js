import "dotenv/config";
import mongoose from "mongoose";
import qaSchema from "./src/modelsShared/QA.js"; // <-- your QA model schema
import fs from "fs";

async function exportQAs() {
  // 1) Connect DB
  await mongoose.connect(process.env.MONGO_URI);

  // 2) Load model
  const QA = mongoose.model("QA", qaSchema);

  // 3) Fetch all
  const data = await QA.find({}).lean();

  // 4) Convert for frontend use
  const formatted = data.map((q) => ({
    _id: q._id.toString(),
    question: q.question,
    answerText: q.answerText,
    answerAudio: q.answerAudio || null,
    type: q.type || "qa",
  }));

  // 5) Save to file
  fs.writeFileSync("./qaLocal.json", JSON.stringify(formatted, null, 2));

  console.log("✅ Exported", formatted.length, "QAs → qaLocal.json");
  process.exit();
}

exportQAs();
