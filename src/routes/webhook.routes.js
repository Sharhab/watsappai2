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
  // ✅ Respond to Twilio immediately to avoid 11200 timeout
  res.status(200).send("OK");

  // 🔄 Continue processing asynchronously
  (async () => {
    const { To, From } = req.body || {}; // ✅ defensive check
    const { QA, Intro, CustomerSession, Order } = req.models;
    const tenant = req.tenant;

    // ✅ Fallbacks for Twilio credentials (if not set in DB)
    const twilioAccountSid = tenant?.twilio?.accountSid || process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = tenant?.twilio?.authToken || process.env.TWILIO_AUTH_TOKEN;
    const templateSid = tenant?.twilio?.templateSid || process.env.TWILIO_TEMPLATE_SID;
    const statusCallbackUrl =
      tenant?.twilio?.statusCallbackUrl || process.env.TWILIO_STATUS_CALLBACK_URL;
    const whatsappNumber = tenant?.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER;

    // ✅ Build Google credentials JSON from env vars
    const googleCredentials = {
      type: process.env.GCP_TYPE || process.env["gcp-type"],
      project_id: process.env.GCP_PROJECT_ID || process.env["gcp-project_id"],
      private_key_id: process.env.GCP_PRIVATE_KEY_ID || process.env["gcp-private_key_id"],
      private_key: (process.env.GCP_PRIVATE_KEY || process.env["gcp-private_key"])?.replace(/\\n/g, "\n"),
      client_email: process.env.GCP_CLIENT_EMAIL || process.env["gcp-client_email"],
      client_id: process.env.GCP_CLIENT_ID || process.env["gcp-client_id"],
      auth_uri: process.env.GCP_AUTH_URI || process.env["gcp-auth_uri"],
      token_uri: process.env.GCP_TOKEN_URI || process.env["gcp-token_uri"],
      auth_provider_x509_cert_url:
        process.env.GCP_AUTH_PROVIDER_X509_CERT_URL || process.env["gcp-auth_provider_x509_cert_url"],
      client_x509_cert_url:
        process.env.GCP_CLIENT_X509_CERT_URL || process.env["gcp-client_x509_cert_url"],
      universe_domain: process.env.GCP_UNIVERSE_DOMAIN || process.env["gcp-universe_domain"],
    };

    console.log("GCP client email env:", googleCredentials.client_email);

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

        const response = await fetch(mediaUrl, {
          headers: {
            Authorization:
              "Basic " + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64"),
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
          receiptExtract: { rawText: text },
        });

        console.log("✅ Order stored for", from);
      }

      // ---------------- AUDIO -> STT ----------------
      if (numMedia > 0 && (req.body?.MediaContentType0 || "").includes("audio")) {
        const transcript = await transcribeAudio(
          req.body.MediaUrl0,
          twilioAccountSid,
          twilioAuthToken,
          googleCredentials
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

      const fromWhatsApp = `whatsapp:${whatsappNumber}`;
      const tplSid = templateSid;
      const statusCallback = statusCallbackUrl;

      // ---------------- FIRST CONTACT (intro flow) ----------------
      if (!session.hasReceivedWelcome) {
        console.log("👋 Sending intro sequence...");

        if (tplSid) {
          await sendTemplate(from, fromWhatsApp, tplSid, { 1: "Friend" }, statusCallback);
          await new Promise((r) => setTimeout(r, 2500));
        }

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
        console.log("✅ Intro sequence sent successfully");
        return;
      }

      // ---------------- QA MATCH ----------------
      const match = incomingMsg ? await findBestMatch(QA, incomingMsg) : null;

      if (match) {
        const text = match.answerText || "Mun gano tambayar ka, amma ba mu da amsa a rubuce yanzu.";
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

        console.log("✅ Answer sent to", from);
        return;
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

      console.log("⚠️ Fallback message sent to", from);
    } catch (e) {
      console.error("❌ Async webhook error:", e);
    }
  })();
});

export default r;
