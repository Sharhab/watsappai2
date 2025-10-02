// src/modelsShared/orderSchema.js
import mongoose from "mongoose";

const receiptExtractSchema = new mongoose.Schema({
  paidAmount: String,
  payerAccount: String,
  referenceNumber: String,
  transactionDate: Date,
});

const orderSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  receiptUrl: String,
  receiptExtract: receiptExtractSchema,
  createdAt: { type: Date, default: Date.now },
});

export default orderSchema;
