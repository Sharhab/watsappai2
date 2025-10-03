// src/routes/auth.routes.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import Tenant from "../modelsMaster/Tenant.js";
import User from "../modelsMaster/User.js";
import { getTenantConnection } from "../tenant/connection.js";

const router = express.Router();

// Utility: convert business name → slug
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function generateUniqueSlug(name) {
  let base = slugify(name);
  let slug = base;
  let counter = 1;

  while (await Tenant.findOne({ slug })) {
    slug = `${base}_${counter++}`;
  }
  return slug;
}

/**
 * POST /api/auth/register
 */
router.post("/register", async (req, res) => {
  try {
    const { businessName, ownerEmail, ownerPhone, password, whatsappNumber, twilio } = req.body;

    if (!businessName || !ownerEmail || !password || !whatsappNumber) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // Prevent duplicate email
    const existingUser = await User.findOne({ email: ownerEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, error: "Email already registered" });
    }

    // Create unique tenant slug
    const slug = await generateUniqueSlug(businessName);

    // Create tenant entry
    const tenant = await Tenant.create({
      businessName,
      slug,
      whatsappNumber,
      twilio,
      ownerEmail,
      ownerPhone,
    });

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create owner user in master DB
    const user = await User.create({
      name: businessName,
      email: ownerEmail,
      passwordHash,
      tenantSlug: slug,
      role: "owner",
    });

    // Ensure tenant DB connection exists
    await getTenantConnection(slug);

    // JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, tenant: user.tenantSlug, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: `Tenant created: app_${slug}`,
      tenant: slug,
      token,
    });
  } catch (err) {
    console.error("❌ Register failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/auth/login
 */

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, error: "Invalid credentials" });
    }

    if (!user.passwordHash) {
      console.error("❌ User has no passwordHash:", user);
      return res.status(500).json({ success: false, error: "User misconfigured" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ success: false, error: "Invalid credentials" });
    }

    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET missing in environment!");
      return res.status(500).json({ success: false, error: "Server misconfigured" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, tenant: user.tenantSlug, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ success: true, token, tenant: user.tenantSlug });

  } catch (err) {
    console.error("❌ Login failed with error:", err);
    res.status(500).json({ success: false, error: err.message || "Login failed" });
  }
});

export default router;

