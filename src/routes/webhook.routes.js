// src/routes/webhook.routes.js
import { Router } from "express";
import Tesseract from "tesseract.js";
import fetch from "node-fetch";
import { withTenant } from "../middleware/withTenant.js";
import uploadToCloudinary from "../utils/cloudinaryUpload.js";
import { transcribeAudio } from "../utils/stt.js";
import { findBestMatch } from "../utils/matching.js";
import { toAbsoluteUrl } from "../utils/media.js";
import { sendTemplate, sendWithRetry } from "../utils/senders.js";

const r = Router();

/**
 * WhatsApp Webhook (multi-tenant aware)
 * Each tenant has its own DB + Twilio credentials
 */
r.post("/webhook", withTenant, async (req, res) => {
  const { To, From } = req.body;
  const { QA, Intro, CustomerSession, Order } = req.models;
  const tenant = req.tenant;

  const from = From;
  const numMedia = parseInt(req.body?.NumMedia || "0", 10) || 0;
  let incomingMsg = req.body?.Body || "";

  try {
    // ---------------- IMAGES -> OCR -> ORDERS ----------------
    if (
      numMedia &&
      req.body?.MediaUrl0 &&
      (req.body?.MediaContentType0 || "").startsWith("image/")
    ) {
      const mediaUrl = req.body.MediaUrl0;
      console.log("📥 New receipt uploaded:", mediaUrl);

      // Secure Twilio media fetch
      const response = await fetch(mediaUrl, {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${tenant.twilio.accountSid}:${tenant.twilio.authToken}`
            ).toString("base64"),
        },
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      const permanentUrl = await uploadToCloudinary(buffer, "image", "receipts");

      const {
        data: { text },
      } = await Tesseract.recognize(permanentUrl, "eng");

      await Order.create({
        phone: from.replace("whatsapp:", ""),
        receiptUrl: permanentUrl,
        receiptExtract: { rawText: text }, // You can still parse with extractReceiptInfo if needed
      });

      console.log("✅ Order stored for", from);
    }

    // ---------------- AUDIO -> STT ----------------
    if (
      numMedia > 0 &&
      (req.body?.MediaContentType0 || "").includes("audio")
    ) {
      const transcript = await transcribeAudio(
        req.body.MediaUrl0,
        tenant.twilio.accountSid,
        tenant.twilio.authToken
      );
      incomingMsg = transcript || incomingMsg;
    }

    // ---------------- SESSION LOAD/CREATE ----------------
    let session = await CustomerSession.findOne({ phoneNumber: from });
    if (!session) {
      session = await CustomerSession.create({
        phoneNumber: from,
        hasReceivedWelcome: false,
        conversationHistory: [],
      });
      console.log("🆕 New session created for", from);
    }

    // Save customer message
    if (incomingMsg) {
      session.conversationHistory.push({
        sender: "customer",
        content: incomingMsg,
        type: numMedia > 0 ? "audio" : "text",
        timestamp: new Date(),
      });
      await session.save();
    }

    const fromWhatsApp = `whatsapp:${tenant.whatsappNumber}`;
    const tplSid = tenant.twilio?.templateSid;
    const statusCallback = tenant.twilio?.statusCallbackUrl;

    // ---------------- FIRST CONTACT (intro flow) ----------------
    if (!session.hasReceivedWelcome) {
      console.log("👋 Sending intro sequence...");

      // Approved template
      if (tplSid) {
        await sendTemplate(from, fromWhatsApp, tplSid, { 1: "Friend" }, statusCallback);
        await new Promise((r) => setTimeout(r, 2500));
      }

      // Intro sequence
      const intro = await Intro.findOne();
      for (const step of intro?.sequence || []) {
        if (step.type === "text") {
          await sendWithRetry({
            from: fromWhatsApp,
            to: from,
            body: step.content,
            ...(statusCallback ? { statusCallback } : {}),
          });
        } else if ((step.type === "audio" || step.type === "video") && step.fileUrl) {
          await sendWithRetry({
            from: fromWhatsApp,
            to: from,
            mediaUrl: [toAbsoluteUrl(step.fileUrl)],
            ...(statusCallback ? { statusCallback } : {}),
          });
        }

        session.conversationHistory.push({
          sender: "ai",
          content: step.type === "text" ? step.content : `[${step.type}]`,
          type: step.type,
          timestamp: new Date(),
        });
        await session.save();

        await new Promise((r) => setTimeout(r, 2500));
      }

      session.hasReceivedWelcome = true;
      await session.save();
      return res.sendStatus(200);
    }

    // ---------------- QA MATCH ----------------
    const match = incomingMsg ? await findBestMatch(QA, incomingMsg) : null;

    if (match) {
      const text =
        match.answerText ||
        "Mun gano tambayar ka, amma ba mu da amsa a rubuce yanzu.";

      await sendWithRetry({
        from: fromWhatsApp,
        to: from,
        body: text,
        ...(statusCallback ? { statusCallback } : {}),
      });

      session.conversationHistory.push({
        sender: "ai",
        content: text,
        type: "text",
        timestamp: new Date(),
      });
      await session.save();

      if (match.answerAudio || match.answerVideo) {
        const mediaUrl = match.answerAudio || match.answerVideo;
        await sendWithRetry({
          from: fromWhatsApp,
          to: from,
          mediaUrl: [mediaUrl],
          ...(statusCallback ? { statusCallback } : {}),
        });

        session.conversationHistory.push({
          sender: "ai",
          content: `[Media reply sent]`,
          type: match.answerAudio ? "audio" : "video",
          timestamp: new Date(),
        });
        await session.save();
      }

      return res.sendStatus(200);
    }

    // ---------------- FALLBACK ----------------
    await sendWithRetry({
      from: fromWhatsApp,
      to: from,
      body: "Ba mu gane tambayarka ba sosai. Don Allah ka bayyana.",
      ...(statusCallback ? { statusCallback } : {}),
    });

    session.conversationHistory.push({
      sender: "ai",
      content: "Ba mu gane tambayarka ba sosai. Don Allah ka bayyana.",
      type: "text",
      timestamp: new Date(),
    });
    await session.save();

    return res.sendStatus(200);
  } catch (e) {
    console.error("❌ Webhook error:", e);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
});

export default r;
