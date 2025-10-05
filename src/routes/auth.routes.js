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

// ✅ Basic Registration (phase 1)
router.post("/register", async (req, res) => {
  try {
    const { businessName, ownerEmail, ownerPhone, password } = req.body;

    if (!businessName || !ownerEmail || !password) {
      return res.status(400).json({ error: "Business name, email, and password are required." });
    }

    // Check if already exists
    const slug = `app_${toSlug(businessName)}`;
    const existing = await Tenant.findOne({ slug });
    if (existing) return res.status(409).json({ error: "Business already registered." });

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create tenant without Twilio yet
    const tenant = await Tenant.create({
      slug,
      businessName,
      ownerEmail,
      ownerPhone,
      password: hashed,
      plan: "free",
      active: false, // will activate after payment
      twilio: {},    // empty for now
    });

    // Create JWT token
    const token = jwt.sign(
      { id: tenant._id, tenantSlug: slug, role: "owner" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      tenant: slug,
      message: "Registration successful! Please proceed to payment.",
    });
  } catch (err) {
    console.error("❌ Registration failed:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/login
 */

router.post("/update-twilio", async (req, res) => {
  try {
    const { tenantSlug, accountSid, authToken, whatsappNumber, templateSid, statusCallbackUrl } = req.body;

    if (!tenantSlug) return res.status(400).json({ error: "Missing tenantSlug" });

    const tenant = await Tenant.findOne({ slug: tenantSlug });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    tenant.twilio = {
      accountSid,
      authToken,
      whatsappNumber,
      templateSid,
      statusCallbackUrl,
    };

    tenant.active = true; // ✅ activate after Twilio setup
    await tenant.save();

    res.json({ success: true, message: "Twilio setup complete!" });
  } catch (err) {
    console.error("❌ Twilio update failed:", err);
    res.status(500).json({ error: "Twilio update failed" });
  }
});


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

