// src/routes/payments.routes.js
import express from "express";
import crypto from "crypto";
import Tenant from "../modelsMaster/Tenant.js";
import { createReservedAccount, initializeCardPayment } from "../utils/monnifyClient.js";

const r = express.Router();

/**
 * 🔰 Initiate a payment — transfer or card
 */
r.post("/initiate", async (req, res) => {
  try {
    const { planId, method, user } = req.body;

    // ✅ Available plans
    const plans = {
      basic: { id: "basic", name: "Basic Plan", price: 3000 },
      medium: { id: "medium", name: "Medium Plan", price: 8000 },
      pro: { id: "pro", name: "Pro Plan", price: 30000 },
    };

    const plan = plans[planId];
    if (!plan) return res.status(400).json({ error: "Invalid plan selected" });
    if (!user?.email) return res.status(400).json({ error: "Missing user email" });

    let result;
    if (method === "transfer") {
      result = await createReservedAccount(user, plan);
    } else if (method === "card") {
      result = await initializeCardPayment(user, plan);
    } else {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    res.json({ success: true, plan, method, result });
  } catch (err) {
    console.error("❌ Payment initiation failed:", err);
    res.status(500).json({ error: "Payment initiation failed", details: err.message });
  }
});

/**
 * 🔔 Webhook: Monnify sends payment notifications here
 * Activates tenant automatically after successful payment
 */
r.post("/webhook", express.json(), async (req, res) => {
  try {
    const rawBody = JSON.stringify(req.body);
    const receivedSig = req.headers["monnify-signature"];
    const computedSig = crypto
      .createHmac("sha512", process.env.MONNIFY_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    if (receivedSig !== computedSig) {
      console.warn("⚠️ Invalid Monnify signature — webhook rejected");
      return res.status(401).send("Invalid signature");
    }

    const event = req.body?.eventType;
    const data = req.body?.eventData;

    if (!event || !data) {
      console.warn("⚠️ Malformed webhook payload");
      return res.status(400).json({ error: "Invalid payload" });
    }

    // ✅ Payment successful
    if (event === "SUCCESSFUL_TRANSACTION") {
      const customerEmail = data?.customer?.email;
      const paymentRef = data?.transactionReference;
      const method = data?.paymentMethod;

      if (!customerEmail) {
        console.warn("⚠️ No customer email provided in webhook");
        return res.sendStatus(200);
      }

      const tenant = await Tenant.findOne({ ownerEmail: customerEmail });
      if (!tenant) {
        console.warn("⚠️ Tenant not found for email:", customerEmail);
        return res.sendStatus(200);
      }

      // ✅ Update and activate tenant account
      tenant.paymentStatus = "paid";
      tenant.isActive = true;
      tenant.paymentRef = paymentRef;
      tenant.paymentMethod = method || "card";
      tenant.plan = tenant.plan || "basic";

      await tenant.save();
      console.log(`✅ Tenant activated after payment: ${tenant.businessName}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Monnify Webhook Error:", err);
    res.status(500).json({ error: "Webhook processing failed", details: err.message });
  }
});

export default r;
