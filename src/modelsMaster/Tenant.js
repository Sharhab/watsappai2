import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  businessName: { type: String, required: true },
  whatsappNumber: { type: String, required: true },
  twilio: {
    accountSid: { type: String, required: false },
    authToken: { type: String, required: false },
    templateSid: { type: String },
    statusCallbackUrl: { type: String },
  },
  ownerEmail: { type: String },
  ownerPhone: { type: String },
  isActive: { type: Boolean, default: true },
  plan: { type: String, enum: ["free", "pro", "enterprise"], default: "free" },
}, { timestamps: true });


export { tenantSchema };
export default mongoose.models.Tenant || mongoose.model("Tenant", tenantSchema);