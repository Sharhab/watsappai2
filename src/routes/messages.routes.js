import express from "express";
import { withTenant } from "../middleware/withTenant.js";
import { sendWithRetry } from "../utils/senders.js";

const router = express.Router();

router.post("/send", withTenant, async (req, res) => {
  try {
    const { CustomerSession } = req.models;
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.json({ success: false, error: "Missing phone or message" });
    }

    const whatsapp = phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
    const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER.startsWith("whatsapp:")
      ? process.env.TWILIO_WHATSAPP_NUMBER
      : `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;

    // Send the text
    await sendWithRetry({ from: fromWhatsApp, to: whatsapp, body: message });

    // Save to DB
    await CustomerSession.updateOne(
      { phoneNumber: whatsapp },
      {
        $push: {
          conversationHistory: {
            sender: "ai",
            type: "text",
            content: message,
            timestamp: new Date(),
          },
        },
      }
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Send message error:", err);
    res.json({ success: false, error: err?.message || err });
  }
});

export default router;
