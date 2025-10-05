import jwt from "jsonwebtoken";
import Tenant from "../modelsMaster/Tenant.js";

/**
 * 🔒 Require valid JWT + active tenant
 */
export async function authRequired(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader)
      return res.status(401).json({ error: "Missing Authorization header" });

    // Accept both "Bearer <token>" and just "<token>"
    const parts = authHeader.trim().split(" ");
    const token = parts.length === 2 ? parts[1] : parts[0];
    if (!token) return res.status(401).json({ error: "Missing token" });

    // ✅ Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded)
      return res.status(401).json({ error: "Token verification failed" });

    req.user = decoded; // { id, email, tenant, role }

    // ✅ Tenant activation check
    if (decoded.tenant) {
      const tenant = await Tenant.findOne({ slug: decoded.tenant });
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      if (!tenant.isActive) {
        return res.status(403).json({
          error: "Account inactive. Please complete your payment first.",
        });
      }
      // Attach tenant object for later use
      req.tenant = tenant;
    }

    next();
  } catch (err) {
    console.error("❌ Auth verification failed:", err.message);
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * ⚙️ Optional authentication (public routes)
 */
export async function authOptional(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return next();

  try {
    const parts = authHeader.trim().split(" ");
    const token = parts.length === 2 ? parts[1] : parts[0];
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    if (decoded.tenant) {
      const tenant = await Tenant.findOne({ slug: decoded.tenant });
      if (tenant && tenant.isActive) {
        req.tenant = tenant;
      }
    }
  } catch (err) {
    // Ignore invalid or expired tokens
  }

  next();
}
