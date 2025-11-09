// /src/routes/webhook.routes.js
import { Router } from "express";
import Tesseract from "tesseract.js";
import fetch from "node-fetch";
import fs from "fs";
import twilio from "twilio"; // ✅ ADDED
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

// ✅ Twilio Client (for delivery confirmation)
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ------------ helpers ---------------
async function waitForDelivered(messageSid) {
  if (!messageSid) return;
  for (let i = 0; i < 40; i++) { // max ~20 seconds
    try {
      const m = await client.messages(messageSid).fetch();
      if (["sent", "delivered", "read"].includes(m.status)) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
}

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

r.post("/webhook", withTenant, async (req, res) => {

  try { res.status(200).send("OK"); } catch {}

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const INTRO_TEMPLATE_DELAY = parseInt(process.env.INTRO_TEMPLATE_DELAY || "1200", 10);
  const INTRO_TEXT_DELAY     = parseInt(process.env.INTRO_TEXT_DELAY     || "1500", 10);
  const INTRO_MEDIA_DELAY    = parseInt(process.env.INTRO_MEDIA_DELAY    || "4500", 10);
  const jitter = () => 200 + Math.floor(Math.random() * 400);

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

      // ---------- OCR ----------
      if (numMedia && mediaType.startsWith("image/")) {
        const resp = await fetch(mediaUrl, {
          headers: { Authorization: "Basic " + Buffer.from(`${AccountSid}:${AuthToken}`).toString("base64") }
        });
        const buffer = Buffer.from(await resp.arrayBuffer());
        const uploaded = await uploadToCloudinary(buffer, "image", "receipts");
        const { data: { text }} = await Tesseract.recognize(uploaded, "eng");
        await Order.create({ phone: From.replace("whatsapp:", ""), receiptUrl: uploaded, receiptExtract: { rawText: text } });
      }

      // ---------- STT ----------
      if (numMedia && mediaType.includes("audio")) {
        const transcript = await withRetry(() => transcribeAudio(mediaUrl, AccountSid, AuthToken));
        if (transcript) incomingMsg = transcript;
      }

      // ---------- Session ----------
      let session = await CustomerSession.findOne({ phoneNumber: From });
      if (!session) session = await CustomerSession.create({ phoneNumber: From, hasReceivedWelcome: false, conversationHistory: [] });

      if (normalizeText(incomingMsg)) {
        session.conversationHistory.push({ sender: "customer", content: incomingMsg, type: numMedia ? "voice" : "text", timestamp: new Date() });
        await session.save();
      }

// ✅ INTRO — FINAL ORDER-SAFE VERSION
if (!session.hasReceivedWelcome) {

  if (templateSid) {
    const sid = await sendTemplate(From, fromWhatsApp, templateSid, { 1: "Friend" }, statusCallback);
    await waitForDelivered(sid?.sid);
    await sleep(INTRO_TEMPLATE_DELAY + jitter());
  }

  const intro = await Intro.findOne();
  if (intro?.sequence?.length) {
    for (const step of intro.sequence) {

      if (step.type === "text") {
        const sid = await sendWithRetry({
          from: fromWhatsApp,
          to: From,
          body: step.content,
          ...(statusCallback ? { statusCallback } : {}),
        });

        await waitForDelivered(sid?.sid || sid);
        await sleep(INTRO_TEXT_DELAY + jitter());
      }

      else if ((step.type === "audio" || step.type === "video") && step.fileUrl) {

        const url = toAbsoluteUrl(step.fileUrl);

        const sid = await sendWithRetry({
          from: fromWhatsApp,
          to: From,
          mediaUrl: [url],
          ...(statusCallback ? { statusCallback } : {}),
        });

        // ✅ This ensures Twilio completes sending before next step
        await waitForDelivered(sid?.sid || sid);

        await sleep(INTRO_MEDIA_DELAY + jitter());
      }

      session.conversationHistory.push({
        sender: "ai",
        content: step.content || `[${step.type}]`,
        type: step.type,
        timestamp: new Date(),
      });
      await session.save();
    }
  }

  session.hasReceivedWelcome = true;
  await session.save();
  return;
}

     // ✅ 24-HOUR REOPEN
      if (session.conversationHistory.length > 0) {
        const lastMsg = session.conversationHistory[session.conversationHistory.length - 1];
        const hours = (Date.now() - new Date(lastMsg.timestamp)) / 36e5;
        if (hours > 24 && REENGAGE_TEMPLATE) {
          await sendTemplate(From, fromWhatsApp, REENGAGE_TEMPLATE, { 1: "Muna nan 😊" }, statusCallback);
          await sleep(1200);
        }
      }

      const match = normalizeText(incomingMsg) ? await findBestMatch(QA, incomingMsg) : null;

      if (match && match.answerAudio) {
        let url = await ensurePublicMedia(match.answerAudio, "audio");
        if (url.endsWith(".mp4")) {
          const tmp = `./qa_${Date.now()}.mp4`;
          const res = await fetch(url);
          fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
          const converted = await encodeForWhatsApp(tmp, "audio");
          const uploaded = await uploadToCloudinary(fs.readFileSync(converted), "audio", "qa_voice");
          url = uploaded;
          fs.unlinkSync(tmp);
          fs.unlinkSync(converted);
        }
        await sendWithRetry({ from: fromWhatsApp, to: From, mediaUrl: [url], ...(statusCallback ? { statusCallback } : {}) });
        session.conversationHistory.push({ sender: "ai", content: "[audio]", type: "audio", timestamp: new Date() });
        await session.save();
        return;
      }

    } catch (err) {
      console.error("❌ Webhook error:", err);
    }

  })();

});

export default r;
