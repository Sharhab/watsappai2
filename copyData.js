// copyData.js
import 'dotenv/config';
import mongoose from "mongoose";

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.DATABASE_URL ||
  process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing. Check your .env file.");
  process.exit(1);
}

async function copyCollections() {
  try {
    console.log("🔗 Connecting to MongoDB…", MONGO_URI);

    await mongoose.connect(MONGO_URI);

    const appTest = mongoose.connection.useDb("app_test");
    const defaultTenant = mongoose.connection.useDb("app_default_env_tenant");

    console.log("📦 Copying QA…");
    const qas = await appTest.collection("qas").find({}).toArray();
    if (qas.length > 0) {
      await defaultTenant.collection("qas").insertMany(qas);
      console.log(`✅ Copied ${qas.length} QA items`);
    } else {
      console.log("⚠️ No QA found in app_test database.");
    }

    console.log("🎞 Copying Intro…");
    const intro = await appTest.collection("intros").find({}).toArray();
    if (intro.length > 0) {
      await defaultTenant.collection("intros").insertMany(intro);
      console.log(`✅ Copied ${intro.length} Intro documents`);
    } else {
      console.log("⚠️ No Intro found in app_test database.");
    }

    console.log("✨ Done.");
    process.exit(0);

  } catch (err) {
    console.error("❌ ERROR:", err);
    process.exit(1);
  }
}

copyCollections();
