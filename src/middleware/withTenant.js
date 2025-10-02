// src/middleware/withTenant.js
import { getTenantConnection } from "../tenant/connection.js";
import { createModelsForConnection } from "../tenant/modelFactory.js";
import Tenant from "../modelsMaster/Tenant.js";

export async function withTenant(req, res, next) {
  try {
    let tenantSlug = null;

    // ✅ Prefer tenantSlug from JWT
    if (req.user?.tenantSlug) {
      tenantSlug = req.user.tenantSlug;
    }

    // If missing, try resolve by header (for admin tools) 
    if (!tenantSlug && req.headers["x-tenant-id"]) {
      tenantSlug = req.headers["x-tenant-id"];
    }

    // If still missing, resolve by WhatsApp number (for incoming webhook)
    if (!tenantSlug && req.body?.To) {
      const tenantDoc = await Tenant.findOne({ whatsappNumber: req.body.To }).lean();
      if (tenantDoc) {
        tenantSlug = tenantDoc.slug;
        req.tenant = tenantDoc;
      }
    }

    if (!tenantSlug) {
      return res.status(400).json({ error: "Missing tenant context" });
    }

    // Connect to tenant DB
    const conn = await getTenantConnection(tenantSlug);
    req.models = createModelsForConnection(conn);
    req.tenantSlug = tenantSlug;

    if (!req.tenant) {
      req.tenant = await Tenant.findOne({ slug: tenantSlug }).lean();
    }

    next();
  } catch (err) {
    console.error("❌ withTenant error:", err);
    res.status(500).json({ error: "Tenant resolution failed" });
  }
}
