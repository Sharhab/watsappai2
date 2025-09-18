// models/Order.js
import mongoose from "mongoose";

const receiptExtractSchema = new mongoose.Schema({
  paidAmount: String,
  payerAccount: String,
  referenceNumber: String,
  transactionDate: Date,
});

const orderSchema = new mongoose.Schema({
  phone: { type: String, required: true },  // Customer phone
  receiptUrl: String,                       // Cloudinary/file URL
  receiptExtract: receiptExtractSchema,     // Extracted receipt info
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Order", orderSchema);
