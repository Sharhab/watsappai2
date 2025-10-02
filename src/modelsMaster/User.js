import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    phone: { type: String },
    tenantSlug: { type: String, required: true },
    role: { type: String, enum: ["owner", "admin", "staff"], default: "owner" }
  },
  { timestamps: true }
);


export { userSchema };
export default mongoose.models.User || mongoose.model("User", userSchema);