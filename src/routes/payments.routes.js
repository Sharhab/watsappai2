// src/routes/payments.routes.js
import express from "express";
import crypto from "crypto";
import Tenant from "../modelsMaster/Tenant.js";
import { createReservedAccount, initializeCardPayment } from "../utils/monnifyClient.js";

const r = express.Router();

/**
 * 🔰 Initiate a payment — transfer or card
 * Works with Paystack Titan under the hood
 */
r.post("/initiate", async (req, res) => {
  try {
    const { planId, method, user } = req.body;

    // ✅ Available plans
    const plans = {
      basic: { id: "basic", name: "Basic Plan", price: 30000 },
      medium: { id: "medium", name: "Medium Plan", price: 55000 },
      pro: { id: "pro", name: "Pro Plan", price: 900000 },
    };

    const plan = plans[planId];
    if (!plan) return res.status(400).json({ error: "Invalid plan selected" });
    if (!user?.email) return res.status(400).json({ error: "Missing user email" });

    let result;
    if (method === "transfer") {
      // 🏦 Titan virtual account (Paystack dedicated account)
      result = await createReservedAccount(user, plan);
    } else if (method === "card") {
      // 💳 Paystack checkout URL
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
 * 🔔 Webhook: Paystack sends payment notifications here
 * Activates tenant automatically after successful payment
 */
r.post("/webhook", express.json({ verify: rawBodySaver }), async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const receivedSig = req.headers["x-paystack-signature"];

    // 🔐 Verify Paystack HMAC signature
    const computedSig = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (receivedSig !== computedSig) {
      console.warn("⚠️ Invalid Paystack signature — webhook rejected");
      return res.status(401).send("Invalid signature");
    }

    const event = req.body?.event;
    const data = req.body?.data;

    if (!event || !data) {
      console.warn("⚠️ Malformed webhook payload");
      return res.status(400).json({ error: "Invalid payload" });
    }

    // ✅ Handle successful payment
    if (event === "charge.success" || event === "transfer.success") {
      const customerEmail = data?.customer?.email;
      const paymentRef = data?.reference;
      const method = data?.channel || "card";

      if (!customerEmail) {
        console.warn("⚠️ No customer email in Paystack webhook");
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
      tenant.paymentMethod = method;
      tenant.plan = tenant.plan || "basic";

      await tenant.save();
      console.log(`✅ Tenant activated after payment: ${tenant.businessName}`);
    }

    // ⚠️ Handle failed or abandoned payments
    if (event === "charge.failed") {
      const customerEmail = req.body?.data?.customer?.email;
      if (customerEmail) {
        const tenant = await Tenant.findOne({ ownerEmail: customerEmail });
        if (tenant) {
          tenant.paymentStatus = "failed";
          tenant.isActive = false;
          await tenant.save();
          console.log(`⚠️ Payment failed for tenant: ${tenant.businessName}`);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Paystack Webhook Error:", err);
    res.status(500).json({ error: "Webhook processing failed", details: err.message });
  }
});

// Helper: store raw body for signature verification
function rawBodySaver(req, res, buf) {
  if (buf && buf.length) req.rawBody = buf.toString("utf8");
}

export default r;
