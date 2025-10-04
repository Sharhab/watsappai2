// src/tenant/connection.js
import mongoose from "mongoose";

const cached = new Map();

export async function getTenantConnection(tenantSlug) {
  if (!tenantSlug) throw new Error("Missing tenantSlug");
  if (cached.has(tenantSlug)) return cached.get(tenantSlug);

  const baseUri = process.env.MONGO_URI;
  if (!baseUri) throw new Error("MONGO_URI missing from environment");

  // ✅ Extract cluster root (remove db name but keep cluster + query)
  const parts = baseUri.split(".net");
  const cluster = parts[0] + ".net"; // e.g. mongodb+srv://user:pass@cluster0.cztgo0n.mongodb.net
  const query = parts[1]?.includes("?") ? parts[1].split("?")[1] : "retryWrites=true&w=majority";

  const dbName = `app_${tenantSlug}`;
  const uri = `${cluster}/${dbName}?${query}`;

  console.log("🔗 Connecting tenant DB:", uri);

  const conn = await mongoose.createConnection(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });

  cached.set(tenantSlug, conn);
  console.log(`✅ Tenant DB ready: ${dbName}`);
  return conn;
}
