import { Router } from "express";
import multer from "multer";
import uploadToCloudinary from "../utils/cloudinaryUpload.js";
import extractReceiptInfo from "../utils/extractReceiptInfo.js";
import { authRequired } from "../middleware/auth.js";
import { withTenant } from "../middleware/withTenant.js";

const r = Router();
const upload = multer({ storage: multer.memoryStorage() });

r.get("/", authRequired, withTenant, async (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: "Phone required" });
  const orders = await req.models.Order.find({ phone }).sort({ createdAt: -1 });
  res.json({ orders });
});

r.post("/:id/receipt", authRequired, withTenant, upload.single("receipt"), async (req, res) => {
  const order = await req.models.Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const url = await uploadToCloudinary(req.file.buffer, "image", "receipts");
  const ocrData = await extractReceiptInfo(url);

  order.receiptUrl = url;
  order.receiptExtract = ocrData;
  await order.save();

  res.json({ success: true, order });
});

export default r;
