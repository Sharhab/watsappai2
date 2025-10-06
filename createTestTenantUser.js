
// createTestTenantUser.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Tenant from "./src/modelsMaster/Tenant.js";
import User from "./src/modelsMaster/User.js";

dotenv.config();

async function run() {
  try {
    console.log("🚀 Connecting to Master MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to Master MongoDB");

    const tenantSlug = "test";
    const businessName = "Test Business";

    // 1️⃣ Find existing tenant or create new one
    let tenant = await Tenant.findOne({ slug: tenantSlug });
    if (tenant) {
      console.log(`🏢 Tenant already exists: ${tenantSlug}`);
    } else {
      tenant = await Tenant.create({
        slug: tenantSlug,
        businessName,
        whatsappNumber: "15558830998",
        ownerEmail: "globstandtechnologies@gmail.com",
        ownerPhone: "07065602624",
        plan: "free",
        isActive: true,
      });
      console.log(`✅ Tenant created: ${tenant.businessName}`);
    }

    // 2️⃣ Create or update user linked to tenant
    const email = "globstandtechnologies@gmail.com";
    const password = "@Msharha1";
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log("👤 User already exists. Updating tenant link...");
      existingUser.tenantSlug = tenantSlug;
      existingUser.name = existingUser.name || "Globstand Admin";
      await existingUser.save();
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        name: "Globstand Admin",
        email,
        phone: "07065602624",
        passwordHash,
        role: "owner",
        tenantSlug,
      });
      console.log("✅ New user created:", user.email);
    }

    console.log("🎯 Done! You can now login with:");
    console.log("   Email:", email);
    console.log("   Password:", password);
    console.log("   Tenant:", tenantSlug);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

run();
