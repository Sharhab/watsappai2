import express from "express";
import Order from "../models/Order.js"; // make sure you created an Order schema
const router = express.Router();

// GET /api/orders?phone=2347065602624
router.get("/orders", async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }

    // Find orders for that phone
    const orders = await Order.find({ phone }).sort({ createdAt: -1 });

    res.json({ orders });
  } catch (err) {
    console.error("❌ Error fetching orders:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
