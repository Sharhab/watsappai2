import express from "express";
import multer from "multer";
import uploadToCloudinary from "../utils/cloudinaryUpload.js";
import { withTenant } from "../middleware/withTenant.js";
import { sendWithRetry } from "../utils/senders.js";
import { encodeForWhatsApp } from "../utils/encodeForWhatsApp.js";
import fs from "fs";
import fetch from "node-fetch";

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


const upload = multer();

router.post("/send-voice", withTenant, upload.single("audio"), async (req, res) => {
  try {
    const { CustomerSession } = req.models;
    const { phone } = req.body;
    const blob = req.file;

    if (!phone || !blob) return res.status(400).json({ error: "Missing phone or audio" });

    // Convert blob → buffer
    const buffer = blob.buffer;

    // Encode to WhatsApp-safe .mp3
    const tmpInput = `./tmp_${Date.now()}`;
    const tmpOutput = await encodeForWhatsApp(tmpInput, "audio");

    fs.writeFileSync(tmpInput, buffer);
    fs.writeFileSync(tmpOutput, buffer);

    // Upload to Cloudinary
    const cloudUrl = await uploadToCloudinary(buffer, "audio", "agent_voice");

    // Send to customer
    const fromWhatsApp = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
    const toWhatsApp = phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;

    await sendWithRetry({
      from: fromWhatsApp,
      to: toWhatsApp,
      mediaUrl: [cloudUrl],
    });

    // Save in DB
    let session = await CustomerSession.findOne({ phoneNumber: toWhatsApp });
    if (!session) session = await CustomerSession.create({ phoneNumber: toWhatsApp });

    session.conversationHistory.push({
      sender: "ai",
      type: "audio",
      content: cloudUrl,
      timestamp: new Date(),
    });

    await session.save();

    res.json({ success: true, url: cloudUrl });

  } catch (err) {
    console.error("❌ Voice send error:", err);
    res.status(500).json({ error: "Failed to send voice" });
  }
});

export default router;



