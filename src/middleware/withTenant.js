// src/middleware/withTenant.js
import Tenant from "../modelsMaster/Tenant.js";
import { getTenantConnection } from "../tenant/connection.js";
import { createModelsForConnection } from "../tenant/modelFactory.js";

/** Normalize a phone-ish value:
 * - strips "whatsapp:" prefix
 * - trims spaces
 * - ensures leading "+" when digits include a country code
 * - collapses any internal spaces
 */
function normalizeWhatsAppValue(v = "") {
  if (!v) return "";
  let s = String(v).trim();
  if (s.startsWith("whatsapp:")) s = s.slice("whatsapp:".length);
  s = s.replace(/\s+/g, ""); // remove all spaces
  if (s && !s.startsWith("+") && /^\d{8,}$/.test(s)) {
    // add '+' if this looks like an E.164 number missing '+'
    s = `+${s}`;
  }
  return s;
}

/** Try to find a tenant by any of its sender numbers.
 * Supports:
 *  - exact match on whatsappNumber (normalized)
 *  - legacy stored values that included "whatsapp:" (we normalize both sides)
 *  - optional aliasNumbers: [ "+1555...", "+234..." ] if you add it later
 */
async function findTenantByNumber(raw) {
  const n = normalizeWhatsAppValue(raw);
  if (!n) return null;

  // Primary: direct compare against stored whatsappNumber
  let tenant = await Tenant.findOne({ whatsappNumber: n });
  if (tenant) return tenant;

  // Legacy data: some tenants may have stored "whatsapp:+1555..."
  // We can try to match after stripping "whatsapp:" from db field on the fly
  // (Mongo doesn't let us transform field values in a basic query, so we try variants)
  tenant = await Tenant.findOne({ whatsappNumber: `whatsapp:${n}` });
  if (tenant) return tenant;

  // Optional secondary field if you maintain multiple senders later
  tenant = await Tenant.findOne({ aliasNumbers: n });
  if (tenant) return tenant;

  return null;
}

export async function withTenant(req, res, next) {
  try {
    let tenant = null;
    let detectedFrom = "unknown";

    // 1️⃣ JWT (most explicit)
    if (req.user?.tenant) {
      tenant = await Tenant.findOne({ slug: req.user.tenant });
      if (tenant) detectedFrom = "jwt";
    }

    // 2️⃣ Header (explicit caller intent)
    if (!tenant && req.headers["x-tenant-id"]) {
      const slug = String(req.headers["x-tenant-id"]).trim();
      if (slug) {
        tenant = await Tenant.findOne({ slug });
        if (tenant) detectedFrom = "header";
      }
    }

    // 3️⃣ Webhook path: try To first (sender number), then From (customer)
    //    Twilio WhatsApp delivers: To=whatsapp:+1..., From=whatsapp:+234...
    //    We should resolve tenant by the SENDER number ("To") primarily.
    const toRaw = req.body?.To;
    const fromRaw = req.body?.From;

    if (!tenant && toRaw) {
      tenant = await findTenantByNumber(toRaw);
      if (tenant) detectedFrom = "whatsapp:To";
    }

    if (!tenant && fromRaw) {
      // Only attempt by From if you intentionally map customers to a tenant
      // (Less reliable; keep as a last resort)
      tenant = await Tenant.findOne({ customerPhones: normalizeWhatsAppValue(fromRaw) });
      if (tenant) detectedFrom = "whatsapp:From";
    }

    // 4️⃣ Fallback (kept to "never break the code", but clearly flagged)
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
          statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL || process.env.TWILIO_STATUS_CALLBACK || "",
        },
      };
      detectedFrom = "env-fallback";
      // expose a flag so routes can choose to short-circuit if desired
      req.isFallbackTenant = true;
    } else {
      req.isFallbackTenant = false;
    }

    // 5️⃣ Inactive tenant guard
    if (tenant && tenant.isActive === false) {
      return res.status(403).json({
        error: "Account inactive. Please complete your payment first.",
      });
    }

    // 6️⃣ Connect to tenant DB
    const slug = tenant.slug || "default_env_tenant";
    const conn = await getTenantConnection(slug);

    if (!conn) {
      console.error("❌ No DB connection established for tenant:", slug);
      return res.status(500).json({
        error: "Tenant DB connection failed",
        tenant: slug,
      });
    }

    req.models = createModelsForConnection(conn);
    req.tenant = tenant;

    // Helpful, compact diagnostics
    const toNorm = normalizeWhatsAppValue(toRaw || "");
    const fromNorm = normalizeWhatsAppValue(fromRaw || "");
    console.log(
      `✅ Tenant resolved from ${detectedFrom}: ${slug} | To=${toNorm || "-"} From=${fromNorm || "-"}`
    );

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
