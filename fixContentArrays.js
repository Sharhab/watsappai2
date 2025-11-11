import mongoose from "mongoose";
import customerSessionSchema from "./src/modelsTenant/CustomerSession.js"; // adjust if your path is different

const MONGO = process.env.MONGO_URI;

async function run() {
  await mongoose.connect(MONGO);
  const CustomerSession = mongoose.model("CustomerSession", customerSessionSchema);

  const sessions = await CustomerSession.find({
    "conversationHistory.content": { $type: "array" }
  });

  console.log(`Found ${sessions.length} sessions to fix...`);

  for (const s of sessions) {
    s.conversationHistory = s.conversationHistory.map(msg => {
      if (Array.isArray(msg.content)) {
        msg.content = msg.content[0] || ""; // convert to string
      }
      return msg;
    });
    await s.save();
  }

  console.log("✅ Done. All conversationHistory.content arrays fixed to strings.");
  process.exit();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
