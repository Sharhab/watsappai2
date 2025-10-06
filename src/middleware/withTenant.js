// src/middleware/withTenant.js
import Tenant from "../modelsMaster/Tenant.js";
import { getTenantConnection } from "../tenant/connection.js";
import { createModelsForConnection } from "../tenant/modelFactory.js";

/**
 * Multi-tenant middleware
 * - Detects tenant from JWT, header, or WhatsApp webhook number
 * - Falls back to env Twilio credentials if tenant not found
 * - Ensures inactive tenants cannot access
 */
export async function withTenant(req, res, next) {
  try {
    let tenant = null;

    // ✅ 1. From header (for API calls)
    const headerTenant = req.headers["x-tenant-id"];

    // ✅ 2. From JWT (authenticated requests)
    if (req.user?.tenant) {
      tenant = await Tenant.findOne({ slug: req.user.tenant });
    }

    // ✅ 3. From x-tenant-id header
    if (!tenant && headerTenant) {
      tenant = await Tenant.findOne({ slug: headerTenant });
    }

    // ✅ 4. From WhatsApp webhook payload
    const from = req.body?.To || req.body?.From;
    if (!tenant && from) {
      const num = from.replace("whatsapp:", "").trim();
      tenant = await Tenant.findOne({ whatsappNumber: num });
    }

    // ✅ 5. Tenant not found → fallback to environment config
    if (!tenant) {
      console.warn("⚠️ Tenant not found — using fallback environment configuration");

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
    }

    // ✅ 6. Block inactive tenants
    if (tenant && tenant.isActive === false) {
      return res.status(403).json({
        error: "Account inactive. Please complete your payment first.",
      });
    }

    // ✅ 7. Connect to tenant DB (safe even for fallback)
    const conn = await getTenantConnection(tenant.slug);
    req.models = createModelsForConnection(conn);
    req.tenant = tenant;

    next();
  } catch (err) {
    console.error("❌ withTenant error:", err);
    return res.status(500).json({
      error: "Failed to establish tenant context",
      details: err.message,
    });
  }
}
