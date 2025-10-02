// /scripts/migrateTenants.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";   // ✅ for hashing owner password

import { qaSchema } from "../src/modelsShared/QA.js";
import { introSchema } from "../src/modelsShared/Intro.js";
import { customerSessionSchema } from "../src/modelsShared/CustomerSession.js";
import { conversationSchema } from "../src/modelsShared/Conversation.js";
import { orderSchema } from "../src/modelsShared/Order.js";
import { tenantSchema } from "../src/modelsMaster/Tenant.js";
import { userSchema } from "../src/modelsMaster/User.js"; // ✅ add this schema

dotenv.config();

// Example tenants (customize as needed)
const tenants = [
  {
    slug: "ai_agent",
    dbName: "app_ai_agent",
    businessName: "AI Agent",
    whatsappNumber: "+2347065602624",
    ownerEmail: "sharhabimuktar2022@gmail.com",
    ownerPhone: "07065602624",
    ownerPassword: "@Msharha1",   // ✅ add password field
    twilio: {
      accountSid: "PLACEHOLDER",
      authToken: "PLACEHOLDER",
      templateSid: "",
      statusCallbackUrl: ""
    },
    plan: "free"
  }
];

// ✅ Helper to extract base URI from MONGO_URI
function getBaseUri() {
  const full = process.env.MONGO_URI;
  if (!full) throw new Error("Missing MONGO_URI in .env");
  return full.split("/")[0].startsWith("mongodb+srv")
    ? full.split(".net/")[0] + ".net"
    : full.split("/")[0] + "//" + full.split("/")[2];
}

async function migrateTenant(tenant) {
  const baseUri = getBaseUri();
  const newDB = `${baseUri}/${tenant.dbName}?retryWrites=true&w=majority`;

  console.log(`🚀 Migrating tenant: ${tenant.slug} → ${newDB}`);

  const oldDB = process.env.MONGO_OLD_URI || `${baseUri}/app_single`;

  const oldConn = await mongoose.createConnection(oldDB, { serverSelectionTimeoutMS: 10000 });
  const newConn = await mongoose.createConnection(newDB, { serverSelectionTimeoutMS: 10000 });
  const rootConn = await mongoose.createConnection(baseUri, { serverSelectionTimeoutMS: 10000 });

  const oldModels = {
    QA: oldConn.model("QA", qaSchema),
    Intro: oldConn.model("Intro", introSchema),
    CustomerSession: oldConn.model("CustomerSession", customerSessionSchema),
    Conversation: oldConn.model("Conversation", conversationSchema),
    Order: oldConn.model("Order", orderSchema),
  };

  const newModels = {
    QA: newConn.model("QA", qaSchema),
    Intro: newConn.model("Intro", introSchema),
    CustomerSession: newConn.model("CustomerSession", customerSessionSchema),
    Conversation: newConn.model("Conversation", conversationSchema),
    Order: newConn.model("Order", orderSchema),
  };

  // ✅ Ensure tenant metadata in master DB
  const Tenant = rootConn.model("Tenant", tenantSchema);
  const User = rootConn.model("User", userSchema);

  await Tenant.updateOne(
    { slug: tenant.slug },
    {
      slug: tenant.slug,
      businessName: tenant.businessName,
      whatsappNumber: tenant.whatsappNumber,
      twilio: tenant.twilio,
      ownerEmail: tenant.ownerEmail,
      ownerPhone: tenant.ownerPhone,
      plan: tenant.plan,
      isActive: true,
    },
    { upsert: true }
  );
  console.log(`✅ Tenant metadata ensured for ${tenant.slug}`);

  // ✅ Ensure owner user
  const existingUser = await User.findOne({ email: tenant.ownerEmail });
  if (!existingUser) {
    const hashed = await bcrypt.hash(tenant.ownerPassword, 10);
    await User.create({
      email: tenant.ownerEmail,
      passwordHash: hashed,
      tenantSlug: tenant.slug,
      role: "owner",
    });
    console.log(`✅ Owner user created: ${tenant.ownerEmail}`);
  } else {
    console.log(`ℹ️ Owner already exists: ${tenant.ownerEmail}`);
  }

  // ✅ Migrate shared collections
  for (const [key, oldModel] of Object.entries(oldModels)) {
    const docs = await oldModel.find().lean();
    if (!docs.length) continue;

    for (const doc of docs) {
      await newModels[key].updateOne(
        { _id: doc._id },
        { $setOnInsert: doc },
        { upsert: true }
      );
    }
    console.log(`   → Migrated ${docs.length} ${key} docs`);
  }

  await oldConn.close();
  await newConn.close();
  await rootConn.close();
  console.log(`🎉 Migration complete for ${tenant.slug}`);
}

async function runMigrations() {
  for (const tenant of tenants) {
    await migrateTenant(tenant);
  }
  console.log("🚀 All migrations completed!");
}

runMigrations().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
