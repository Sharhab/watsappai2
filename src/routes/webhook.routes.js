// /src/routes/webhook.routes.js
import { Router } from "express";
import Tesseract from "tesseract.js";
import fetch from "node-fetch";
import fs from "fs";
import { withTenant } from "../middleware/withTenant.js";
import uploadToCloudinary from "../utils/cloudinaryUpload.js";
import { transcribeAudio } from "../utils/stt.js";
import { findBestMatch, normalizeText } from "../utils/matching.js";
import { toAbsoluteUrl } from "../utils/media.js";
import { sendTemplate, sendWithRetry } from "../utils/senders.js";
import { encodeForWhatsApp } from "../utils/encodeForWhatsApp.js";

const r = Router();
const INTRO_DELAY = Number(process.env.INTRO_DELAY_MS || 800);
const REENGAGE_TEMPLATE = process.env.WHATSAPP_REENGAGE_TEMPLATE_SID;

// ------------ helpers ---------------
async function withRetry(task, { retries = 2, baseDelayMs = 800 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await task(); } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensurePublicMedia(url, type) {
  const abs = toAbsoluteUrl(url);
  const ok = await headOk(abs);
  if (ok) return abs;

  console.warn("⚠️ QA media not publicly reachable. Re-uploading to Cloudinary…", abs);
  try {
    const dl = await fetch(abs);
    const buf = Buffer.from(await dl.arrayBuffer());
    const uploaded = await uploadToCloudinary(buf, type, "qa_media");
    console.log("☁️  Cloudinary public QA media:", uploaded);
    return uploaded;
  } catch (e) {
    console.error("❌ Failed to re-upload QA media:", e?.message || e);
    return abs;
  }
}

// ------------------------------------

r.post("/webhook", withTenant, async (req, res) => {
  try { res.status(200).send("OK"); } catch {}

  (async () => {
    const { QA, Intro, CustomerSession, Order } = req.models;
    const { From } = req.body || {};

    const AccountSid = process.env.TWILIO_ACCOUNT_SID;
    const AuthToken = process.env.TWILIO_AUTH_TOKEN;
    const templateSid = process.env.TWILIO_TEMPLATE_SID;
    const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL;
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const fromWhatsApp = whatsappNumber.startsWith("whatsapp:") ? whatsappNumber : `whatsapp:${whatsappNumber}`;

    const numMedia = parseInt(req.body?.NumMedia || "0", 10);
    const mediaType = req.body?.MediaContentType0 || "";
    const mediaUrl = req.body?.MediaUrl0;
    let incomingMsg = req.body?.Body || "";

    try {
      // IMAGE → OCR
      if (numMedia && mediaType.startsWith("image/")) {
        const resp = await fetch(mediaUrl, {
          headers: { Authorization: "Basic " + Buffer.from(`${AccountSid}:${AuthToken}`).toString("base64") }
        });
        const buffer = Buffer.from(await resp.arrayBuffer());
        const uploaded = await uploadToCloudinary(buffer, "image", "receipts");
        const { data: { text }} = await Tesseract.recognize(uploaded, "eng");
        await Order.create({ phone: From.replace("whatsapp:", ""), receiptUrl: uploaded, receiptExtract: { rawText: text } });
      }

      // AUDIO → STT
      if (numMedia && mediaType.includes("audio")) {
        console.log("🎙 Voice message detected → Calling STT...");
        const transcript = await withRetry(() => transcribeAudio(mediaUrl, AccountSid, AuthToken));
        if (transcript) {
          incomingMsg = transcript;
          console.log("📝 TRANSCRIBED:", transcript);
        }
      }

      // SESSION
      let session = await CustomerSession.findOne({ phoneNumber: From });
      if (!session) {
        session = await CustomerSession.create({ phoneNumber: From, hasReceivedWelcome: false, conversationHistory: [] });
      }

      if (normalizeText(incomingMsg)) {
        console.log("🧠 USER SAID:", incomingMsg);
        session.conversationHistory.push({ sender: "customer", content: incomingMsg, type: numMedia ? "voice" : "text", timestamp: new Date() });
        await session.save();
      }

      // INTRO
      if (!session.hasReceivedWelcome) {
        if (templateSid) await sendTemplate(From, fromWhatsApp, templateSid, { 1: "Friend" }, statusCallback);
        const intro = await Intro.findOne();
        if (intro?.sequence?.length) {
          for (const step of intro.sequence) {
            if (step.type === "text") {
              await sendWithRetry({ from: fromWhatsApp, to: From, body: step.content });
            } else if ((step.type === "audio" || step.type === "video") && step.fileUrl) {
              const abs = toAbsoluteUrl(step.fileUrl);
              await sendWithRetry({ from: fromWhatsApp, to: From, mediaUrl: [abs] });
            }
            session.conversationHistory.push({ sender: "ai", content: step.content || `[${step.type}]`, type: step.type, timestamp: new Date() });
            await session.save();
            await new Promise(r => setTimeout(r, INTRO_DELAY));
          }
        }
        session.hasReceivedWelcome = true;
        await session.save();
        return;
      }

      // ✅ 24-HOUR REOPEN LOGIC HERE
      if (session.conversationHistory.length > 0) {
        const lastMsg = session.conversationHistory[session.conversationHistory.length - 1];
        const hours = (Date.now() - new Date(lastMsg.timestamp)) / 36e5;
        if (hours > 24 && REENGAGE_TEMPLATE) {
          console.log(`⛔ ${hours.toFixed(1)}h since last message → Reopening...`);
          await sendTemplate(From, fromWhatsApp, REENGAGE_TEMPLATE, { 1: "Muna nan 😊" }, statusCallback);
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      // QA MATCH
      const match = normalizeText(incomingMsg) ? await findBestMatch(QA, incomingMsg) : null;
if (match.answerAudio) {
  const url = await ensurePublicMedia(match.answerAudio, "audio");

  console.log("🔊 SENDING QA AUDIO:");
  console.log({
    to: From,
    from: fromWhatsApp,
    mediaUrl: url,
    isHttps: url.startsWith("https://"),
    fileExtension: url.split("?")[0].split(".").pop(),
    sessionHasWelcome: session.hasReceivedWelcome,
    lengthHistory: session.conversationHistory.length
  });

  try {
    await sendWithRetry({
      from: fromWhatsApp,
      to: From,
      mediaUrl: [url],
      ...(statusCallback ? { statusCallback } : {}),
    });

    console.log("✅ AUDIO SENT SUCCESSFULLY");
  } catch (err) {
    console.error("❌ FAILED TO SEND AUDIO:", {
      error: err?.response?.data || err?.message,
      sid: err?.code || null,
      url
    });
  }

  return;
}

      // FALLBACK
      await sendWithRetry({ from: fromWhatsApp, to: From, body: "Ba mu gane tambayarka sosai. Don Allah ka bayyana." });

    } catch (err) {
      console.error("❌ Webhook error:", err);
    }
  })();
});

export default r;
