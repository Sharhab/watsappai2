import { Router } from "express";
import Tesseract from "tesseract.js";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import { withTenant } from "../middleware/withTenant.js";
import uploadToCloudinary from "../utils/cloudinaryUpload.js";
import { transcribeAudio } from "../utils/stt.js";
import { findBestMatch } from "../utils/matching.js";
import { toAbsoluteUrl } from "../utils/media.js";
import { sendTemplate, sendWithRetry } from "../utils/senders.js";

const r = Router();
const INTRO_DELAY = Number(process.env.INTRO_DELAY_MS || 800);

async function withRetry(task, { retries = 2, baseDelayMs = 800 } = {}) {
  let err;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await task();
    } catch (e) {
      err = e;
      if (attempt <= retries) await new Promise(r => setTimeout(r, baseDelayMs * attempt));
    }
  }
  throw err;
}

r.post("/webhook", withTenant, async (req, res) => {
  res.status(200).send("OK");

  (async () => {
    const { QA, Intro, CustomerSession, Order } = req.models;
    const tenant = req.tenant;
    const { From } = req.body || {};

    const AccountSid = process.env.TWILIO_ACCOUNT_SID;
    const AuthToken = process.env.TWILIO_AUTH_TOKEN;
    const templateSid = tenant?.twilio?.templateSid || process.env.TWILIO_TEMPLATE_SID;
    const statusCallback = tenant?.twilio?.statusCallbackUrl || process.env.TWILIO_STATUS_CALLBACK_URL;
    const whatsappNumber = tenant?.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER;
    const fromWhatsApp = whatsappNumber.startsWith("whatsapp:") ? whatsappNumber : `whatsapp:${whatsappNumber}`;

    const numMedia = parseInt(req.body?.NumMedia || "0", 10);
    const mediaType = req.body?.MediaContentType0 || "";
    const mediaUrl = req.body?.MediaUrl0;
    let incomingMsg = req.body?.Body || "";

    try {
      // ---------------- AUDIO → TRANSCRIBE ----------------
      if (numMedia && mediaType.includes("audio")) {
        console.log("🎙 Voice message detected → Calling STT...");
        const transcript = await withRetry(() => transcribeAudio(mediaUrl, AccountSid, AuthToken), { label: "STT" });
        if (transcript) {
          console.log("📝 TRANSCRIBED:", transcript);
          incomingMsg = transcript;
        }
      }

      // ---------------- SESSION ----------------
      let session = await CustomerSession.findOne({ phoneNumber: From });
      if (!session) {
        session = await CustomerSession.create({
          phoneNumber: From,
          hasReceivedWelcome: false,
          conversationHistory: []
        });
      }

      if (incomingMsg.trim()) {
        session.conversationHistory.push({
          sender: "customer",
          content: incomingMsg,
          type: numMedia ? "voice" : "text",
          timestamp: new Date(),
        });
        await session.save();
      }

      // ---------------- INTRO SEQUENCE ----------------
      if (!session.hasReceivedWelcome) {
        console.log("🎬 Sending INTRO...");
        if (templateSid) await sendTemplate(From, fromWhatsApp, templateSid, { 1: "Sannu" }, statusCallback);
        const intro = await Intro.findOne();

        if (intro?.sequence) {
          for (const step of intro.sequence) {

            if (step.type === "text") {
              await sendWithRetry({ from: fromWhatsApp, to: From, body: step.content });

            } else if ((step.type === "audio" || step.type === "video") && step.fileUrl) {
              // ✅ DIRECT SEND — NO MMFEG ENCODING
              const direct = toAbsoluteUrl(step.fileUrl);
              await sendWithRetry({ from: fromWhatsApp, to: From, mediaUrl: [direct] });
            }

            session.conversationHistory.push({
              sender: "ai",
              content: step.content || `[media]`,
              type: step.type,
              timestamp: new Date()
            });

            await session.save();
            await new Promise(r => setTimeout(r, INTRO_DELAY));
          }
        }

        session.hasReceivedWelcome = true;
        await session.save();
        return;
      }

      // ---------------- QA MATCHING ----------------
      console.log("🧠 USER SAID:", incomingMsg);
      const match = incomingMsg ? await findBestMatch(QA, incomingMsg) : null;

      if (match) {
        console.log("🎯 MATCH FOUND:", {
          question: match.question,
          hasAudio: !!match.answerAudio,
          hasVideo: !!match.answerVideo,
          textPreview: match.answerText?.slice(0, 60)
        });

        if (match.answerAudio) {
          await sendWithRetry({ from: fromWhatsApp, to: From, mediaUrl: [match.answerAudio] });
          return;
        }

        if (match.answerVideo) {
          await sendWithRetry({ from: fromWhatsApp, to: From, mediaUrl: [match.answerVideo] });
          return;
        }

        await sendWithRetry({ from: fromWhatsApp, to: From, body: match.answerText || "Mun gane tambayarka." });
        return;
      }

      console.log("❌ NO MATCH FOR:", incomingMsg);
      await sendWithRetry({ from: fromWhatsApp, to: From, body: "Ba mu gane tambayarka sosai ba. Don Allah ka sake bayani." });

    } catch (err) {
      console.error("❌ Webhook error:", err);
    }
  })();
});

export default r;
