import express from "express";
import fs from "fs";
import fetch from "node-fetch";
import twilio from "twilio";
import { normalizeText } from "../utils/matching.js";
import { toAbsoluteUrl, uploadToCloudinary, withRetry } from "../utils/media.js";
import { transcribeAudio } from "../utils/stt.js";
import { encodeForWhatsApp } from "../utils/encode.js";
import Tesseract from "tesseract.js";
import { ensurePublicMedia } from "../utils/publicMedia.js";
import { sendWithRetry, sendTemplate } from "../utils/send.js";
import { REENGAGE_TEMPLATE } from "../config.js";

const r = express.Router();

// ✅ Twilio Client (needed for delivery status check)
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ Wait until WhatsApp confirms the previous media has been processed
async function waitForDelivered(messageSid) {
  if (!messageSid) return;
  for (let i = 0; i < 40; i++) { // ~20 seconds max
    try {
      const m = await client.messages(messageSid).fetch();
      if (["sent", "delivered", "read"].includes(m.status)) return;
    } catch {}
    await new Promise(res => setTimeout(res, 500));
  }
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

const INTRO_TEMPLATE_DELAY = parseInt(process.env.INTRO_TEMPLATE_DELAY || "1200", 10);
const INTRO_TEXT_DELAY     = parseInt(process.env.INTRO_TEXT_DELAY     || "1500", 10);
const INTRO_MEDIA_DELAY    = parseInt(process.env.INTRO_MEDIA_DELAY    || "4500", 10);
const jitter = () => 200 + Math.floor(Math.random() * 400);

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

      // AUDIO → TRANSCRIBE
      if (numMedia && mediaType.includes("audio")) {
        const transcript = await withRetry(() => transcribeAudio(mediaUrl, AccountSid, AuthToken));
        if (transcript) incomingMsg = transcript;
      }

      // SESSION
      let session = await CustomerSession.findOne({ phoneNumber: From });
      if (!session) session = await CustomerSession.create({ phoneNumber: From, hasReceivedWelcome: false, conversationHistory: [] });

      if (normalizeText(incomingMsg)) {
        session.conversationHistory.push({ sender: "customer", content: incomingMsg, type: numMedia ? "voice" : "text", timestamp: new Date() });
        await session.save();
      }

      // ✅ INTRO FIXED — key part
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
              const sid = await sendWithRetry({ from: fromWhatsApp, to: From, body: step.content, ...(statusCallback ? { statusCallback } : {}) });
              await waitForDelivered(sid?.sid);
              await sleep(INTRO_TEXT_DELAY + jitter());
            }

            else if ((step.type === "audio" || step.type === "video") && step.fileUrl) {

              let url = toAbsoluteUrl(step.fileUrl);

              if (step.type === "video") {
                try {
                  if (!url.endsWith(".mp4")) {
                    const tmp = `./intro_${Date.now()}.video`;
                    const res = await fetch(url);
                    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));

                    const converted = await encodeForWhatsApp(tmp, "video");
                    const uploaded = await uploadToCloudinary(fs.readFileSync(converted), "video", "intro_video");

                    url = uploaded;

                    fs.unlinkSync(tmp);
                    fs.unlinkSync(converted);
                  }
                } catch (err) {
                  console.error("⚠️ Video conversion failed:", err);
                }
              }

              const sid = await sendWithRetry({
                from: fromWhatsApp,
                to: From,
                mediaUrl: [url],
                ...(statusCallback ? { statusCallback } : {}),
              });

              await waitForDelivered(sid?.sid);
              await sleep(INTRO_MEDIA_DELAY + jitter());
            }

            session.conversationHistory.push({ sender: "ai", content: step.content || `[${step.type}]`, type: step.type, timestamp: new Date() });
            await session.save();
          }
        }

        session.hasReceivedWelcome = true;
        await session.save();
        return;
      }

      // ✅ 24-HOUR REENGAGEMENT — unchanged
      if (session.conversationHistory.length > 0) {
        const lastMsg = session.conversationHistory[session.conversationHistory.length - 1];
        const hours = (Date.now() - new Date(lastMsg.timestamp)) / 36e5;
        if (hours > 24 && REENGAGE_TEMPLATE) {
          await sendTemplate(From, fromWhatsApp, REENGAGE_TEMPLATE, { 1: "Muna nan 😊" }, statusCallback);
          await sleep(1200);
        }
      }

      // ✅ QA AUDIO — unchanged
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
