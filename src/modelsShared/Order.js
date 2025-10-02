import mongoose from "mongoose";

const receiptExtractSchema = new mongoose.Schema({
  paidAmount: String,
  payerAccount: String,
  referenceNumber: String,
  transactionDate: Date,
}, { _id: false });

const orderSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  receiptUrl: String,
  receiptExtract: receiptExtractSchema,
}, { timestamps: true });



export { orderSchema };
export default mongoose.models.Order || mongoose.model("Order", orderSchema)