import mongoose from "mongoose";

const cached = new Map();

/**
 * Dynamically connects to tenant database.
 * Works with Render and MongoDB Atlas.
 */
export async function getTenantConnection(tenantSlug) {
  if (!tenantSlug) throw new Error("Missing tenantSlug");

  // ✅ Use cached connection if exists
  if (cached.has(tenantSlug)) return cached.get(tenantSlug);

  // ✅ Use base URI and options from .env
  const baseUri = process.env.MONGO_BASE_URI;
  const options = process.env.MONGO_OPTIONS || "?retryWrites=true&w=majority";

  if (!baseUri)
    throw new Error("Missing MONGO_BASE_URI in environment variables.");

  // ✅ Ensure prefix correctness
  if (!baseUri.startsWith("mongodb://") && !baseUri.startsWith("mongodb+srv://")) {
    throw new Error(
      `Invalid MONGO_BASE_URI format. Must start with mongodb:// or mongodb+srv://`
    );
  }

  // ✅ Build the full tenant URI
  const dbName = `app_${tenantSlug}`;
  const uri = `${baseUri}/${dbName}${options.startsWith("?") ? options : `?${options}`}`;

  console.log(`🔗 Connecting tenant DB: ${uri}`);

  // ✅ Create tenant connection
  const conn = await mongoose.createConnection(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  cached.set(tenantSlug, conn);
  console.log(`✅ Tenant DB ready for: ${dbName}`);

  return conn;
}
