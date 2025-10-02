import { Router } from "express";
import Tenant from "../modelsMaster/Tenant.js";

const r = Router();

/**
 * Utility: create slug from business name
 * e.g. "Globstand Technologies" -> "globstand_technologies"
 */
function toSlug(name = "") {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_") // non-alphanumeric → "_"
    .replace(/^_+|_+$/g, "");   // trim underscores
}

//
// ✅ Tenant Registration

//
r.post("/register", async (req, res) => {
  try {
    const {
      businessName,
      whatsappNumber,
      twilioAccountSid,
      twilioAuthToken,
      templateSid,
      statusCallbackUrl,
      ownerEmail,
      ownerPhone,
      plan,
    } = req.body;

    if (!businessName || !whatsappNumber || !twilioAccountSid || !twilioAuthToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const slug = `app_${toSlug(businessName)}`;

    // Ensure uniqueness
    const existing = await Tenant.findOne({ slug });
    if (existing) {
      return res.status(409).json({ error: "Business already registered" });
    }

    const tenant = await Tenant.create({
      slug,
      businessName,
      whatsappNumber,
      twilio: {
        accountSid: twilioAccountSid,
        authToken: twilioAuthToken,
        templateSid,
        statusCallbackUrl,
      },
      ownerEmail,
      ownerPhone,
      plan: plan || "free",
    });

    res.json({ success: true, tenant });
  } catch (err) {
    console.error("❌ Tenant registration failed:", err);
    res.status(500).json({ error: err.message });
  }
});

//
// ✅ List all tenants (admin only in real use)
//
r.get("/", async (req, res) => {
  try {
    const tenants = await Tenant.find().sort({ createdAt: -1 });
    res.json({ tenants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default r;
