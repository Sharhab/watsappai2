import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function migrate() {
  const uri = process.env.MONGO_URI;
  const dbName = "test"; // ✅ only test database

  try {
    const conn = await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
    console.log("✅ Connected to MongoDB:", dbName);

    const db = conn.connection.useDb(dbName);

    // Load all `questions`
    const questions = await db.collection("questions").find().toArray();

    if (!questions.length) {
      console.log("⚠️ No questions found in `questions` collection.");
      return;
    }

    // Remove _id before inserting into qas
    const docsToInsert = questions.map(({ _id, ...rest }) => rest);

    // Insert into qas
    await db.collection("qas").insertMany(docsToInsert);
    console.log(`🎯 Successfully copied ${docsToInsert.length} documents → qas`);

    console.log("🎉 Migration complete!");
    await conn.disconnect();
  } catch (err) {
    console.error("❌ Migration failed:", err);
  }
}

migrate();
