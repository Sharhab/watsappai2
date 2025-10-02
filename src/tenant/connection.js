// src/tenant/connection.js
import mongoose from "mongoose";

const cached = new Map(); // tenantSlug -> mongoose.Connection

export async function getTenantConnection(tenantSlug) {
  if (!tenantSlug) throw new Error("Missing tenantSlug");

  if (cached.has(tenantSlug)) {
    return cached.get(tenantSlug);
  }

  const dbName = `app_${tenantSlug}`;
  const baseUri = process.env.MONGO_BASE_URI;
  const options = process.env.MONGO_OPTIONS || "";
  const uri = `${baseUri}/${dbName}${options}`;

  const conn = await mongoose.createConnection(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });

  cached.set(tenantSlug, conn);
  console.log(`✅ Tenant DB ready: ${dbName}`);
  return conn;
}
