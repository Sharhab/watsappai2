import mongoose from "mongoose";

const cached = new Map();

export async function getTenantConnection(tenantSlug) {
  if (!tenantSlug) throw new Error("Missing tenantSlug");

  if (cached.has(tenantSlug)) return cached.get(tenantSlug);

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not set in env");

  // Split into base + query
  const [base, query] = mongoUri.split("?");
  const cleanBase = base.endsWith("/") ? base : base + "/"; // ensure trailing slash

  const dbName = `app_${tenantSlug}`;
  const uri = query
    ? `${cleanBase}${dbName}?${query}`
    : `${cleanBase}${dbName}`;

  console.log("🔗 Connecting tenant DB:", uri);

  const conn = await mongoose.createConnection(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });

  cached.set(tenantSlug, conn);
  console.log(`✅ Tenant DB ready: ${dbName}`);
  return conn;
}
