// src/middleware/auth.js
import jwt from "jsonwebtoken";

export function authRequired(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing token" });

  // Accept both "Bearer <token>" and just "<token>"
  const parts = authHeader.split(" ");
  const token = parts.length === 2 ? parts[1] : parts[0];

  if (!token) return res.status(401).json({ error: "Invalid token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, tenant, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// optional auth (doesn't fail if no token)
export function authOptional(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return next();

  const parts = authHeader.split(" ");
  const token = parts.length === 2 ? parts[1] : parts[0];
  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // ignore invalid tokena
  }
  next();
}
