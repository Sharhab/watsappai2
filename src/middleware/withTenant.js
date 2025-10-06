// src/middleware/withTenant.js
import Tenant from "../modelsMaster/Tenant.js";
import { getTenantConnection } from "../tenant/connection.js";
import { createModelsForConnection } from "../tenant/modelFactory.js";

export async function withTenant(req, res, next) {
  try {
    let tenant = null;
    let detectedFrom = "unknown";

    // 1️⃣ Try JWT
    if (req.user?.tenant) {
      tenant = await Tenant.findOne({ slug: req.user.tenant });
      if (tenant) detectedFrom = "jwt";
    }

    // 2️⃣ Try header
    if (!tenant && req.headers["x-tenant-id"]) {
      tenant = await Tenant.findOne({ slug: req.headers["x-tenant-id"] });
      if (tenant) detectedFrom = "header";
    }

    // 3️⃣ Try WhatsApp number (webhook)
    const from = req.body?.To || req.body?.From;
    if (!tenant && from) {
      const num = from.replace("whatsapp:", "").trim();
      tenant = await Tenant.findOne({ whatsappNumber: num });
      if (tenant) detectedFrom = "whatsapp";
    }

    // 4️⃣ Fallback
    if (!tenant) {
      console.warn("⚠️ Tenant not found — using fallback env Twilio config");
      tenant = {
        slug: "default_env_tenant",
        isActive: true,
        whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || "",
        twilio: {
          accountSid: process.env.TWILIO_ACCOUNT_SID || "",
          authToken: process.env.TWILIO_AUTH_TOKEN || "",
          templateSid: process.env.TWILIO_TEMPLATE_SID || "",
          statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK || "",
        },
      };
      detectedFrom = "env-fallback";
    }

    // 5️⃣ Inactive tenant block
    if (tenant && tenant.isActive === false) {
      return res.status(403).json({
        error: "Account inactive. Please complete your payment first.",
      });
    }

    // 6️⃣ Connect to tenant DB
    const conn = await getTenantConnection(tenant.slug);

    if (!conn) {
      console.error("❌ No DB connection established for tenant:", tenant.slug);
      return res.status(500).json({
        error: "Tenant DB connection failed",
        tenant: tenant.slug,
      });
    }

    req.models = createModelsForConnection(conn);
    req.tenant = tenant;

    console.log(`✅ Tenant resolved from ${detectedFrom}: ${tenant.slug}`);
    next();
  } catch (err) {
    console.error("❌ withTenant error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to establish tenant context",
        details: err.message,
      });
    }
  }
}
