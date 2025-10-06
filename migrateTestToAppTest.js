// migrateTestToAppTest.js
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function migrate() {
  const uri = process.env.MONGO_URI;
  const sourceDbName = "test";
  const targetDbName = "app_test";

  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log("✅ Connected to MongoDB");

    const source = conn.connection.useDb(sourceDbName);
    const target = conn.connection.useDb(targetDbName);

    const collections = [
      "qas",
      "questions",
      "orders",
      "intros",
      "customersessions",
      "conversations",
    ];

    // General copy
    for (const coll of collections) {
      const docs = await source.collection(coll).find().toArray();
      if (docs.length > 0) {
        await target.collection(coll).insertMany(docs);
        console.log(`✅ Copied ${docs.length} docs from ${coll}`);
      } else {
        console.log(`⚠️ No documents found in ${coll}`);
      }
    }

    // 🔁 Additional step: Copy `questions` → `qas`
    const questionsDocs = await source.collection("questions").find().toArray();
    if (questionsDocs.length > 0) {
      // Optionally transform if needed (e.g., rename fields)
      await target.collection("qas").insertMany(questionsDocs);
      console.log(`🎯 Also copied ${questionsDocs.length} docs from questions → qas`);
    } else {
      console.log("⚠️ No questions found to migrate into qas");
    }

    console.log("🎉 Migration complete!");
    await conn.disconnect();
  } catch (err) {
    console.error("❌ Migration failed:", err);
  }
}

migrate();
