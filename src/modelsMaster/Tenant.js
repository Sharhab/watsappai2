import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    businessName: { type: String, required: true },
    whatsappNumber: { type: String },

    // Twilio credentials (added later after payment)
    twilio: {
      accountSid: { type: String },
      authToken: { type: String },
      templateSid: { type: String },
      statusCallbackUrl: { type: String },
    },

    // Owner info
    ownerEmail: { type: String, required: true },
    ownerPhone: { type: String },
    password: { type: String }, // ✅ for authentication (hashed)
    
    // Business state
    plan: { type: String, enum: ["free", "basic", "medium", "pro"], default: "free" },
    isActive: { type: Boolean, default: false }, // inactive until payment complete
    paymentStatus: { type: String, enum: ["pending", "paid"], default: "pending" },
    
    // Optional payment metadata
    paymentRef: { type: String, default: null },
    paymentMethod: { type: String, enum: ["card", "transfer", null], default: null },
  },
  { timestamps: true }
);

export { tenantSchema };
export default mongoose.models.Tenant || mongoose.model("Tenant", tenantSchema);
