import { Router } from "express";
import Tesseract from "tesseract.js";
import fetch from "node-fetch";
import fs from "fs";
import twilio from "twilio";
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

// Twilio client for delivery checks
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function waitForDelivered(messageSid) {
  if (!messageSid) return;
  for (let i = 0; i < 40; i++) {
    try {
      const m = await client.messages(messageSid).fetch();
      console.log(`📩 [Twilio] Message ${messageSid} status: ${m.status}`);
      if (["sent", "delivered", "read"].includes(m.status)) return;
    } catch (err) {
      console.error("⚠️ waitForDelivered error:", err.message);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function withRetry(task, { retries = 2, baseDelayMs = 800 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      console.log(`🔁 Attempt ${i + 1}/${retries + 1}`);
      return await task();
    } catch (err) {
      console.error(`⚠️ Retry ${i + 1} failed:`, err.message);
      lastErr = err;
      if (i < retries) await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch (e) {
    console.error("⚠️ HEAD check failed for", url, e.message);
    return false;
  }
}

async function ensurePublicMedia(url, type) {
  console.log(`🔍 Checking media URL: ${url}`);
  const abs = toAbsoluteUrl(url);
  const ok = await headOk(abs);
  if (ok) {
    console.log("✅ Media already public:", abs);
    return abs;
  }

  console.warn("⚠️ QA media not publicly reachable. Re-uploading to Cloudinary…", abs);
  try {
    const dl = await fetch(abs);
    const buf = Buffer.from(await dl.arrayBuffer());
    const uploaded = await uploadToCloudinary(buf, type, "qa_media");
    console.log("☁️  Cloudinary public QA media uploaded:", uploaded);
    return uploaded;
  } catch (e) {
    console.error("❌ Failed to re-upload QA media:", e?.message || e);
    return abs;
  }
}

function pushHistory(session, { sender, type, content }) {
  console.log(`💬 Pushing history: [${sender}] (${type}) -> ${content}`);
  session.conversationHistory.push({
    sender,
    type,
    content: String(content || ""),
    timestamp: new Date(),
  });
}

r.post("/webhook", withTenant, async (req, res) => {
  try {
    res.status(200).send("OK");
  } catch {}

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = () => 200 + Math.floor(Math.random() * 400);
  const INTRO_TEMPLATE_DELAY = parseInt(process.env.INTRO_TEMPLATE_DELAY || "1200", 10);
  const INTRO_TEXT_DELAY = parseInt(process.env.INTRO_TEXT_DELAY || "1500", 10);
  const INTRO_MEDIA_DELAY = parseInt(process.env.INTRO_MEDIA_DELAY || "4500", 10);

  (async () => {
    try {
      console.log("🚀 Incoming Webhook:", JSON.stringify(req.body, null, 2));
      const { QA, Intro, CustomerSession, Order } = req.models;
      const { From } = req.body || {};
      console.log("📱 From:", From);

      const AccountSid = process.env.TWILIO_ACCOUNT_SID;
      const AuthToken = process.env.TWILIO_AUTH_TOKEN;
      const templateSid = process.env.TWILIO_TEMPLATE_SID;
      const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL;
      const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
      const fromWhatsApp = whatsappNumber.startsWith("whatsapp:")
        ? whatsappNumber
        : `whatsapp:${whatsappNumber}`;

      const numMedia = parseInt(req.body?.NumMedia || "0", 10);
      const mediaType = req.body?.MediaContentType0 || "";
      const mediaUrl = req.body?.MediaUrl0;
      let incomingMsg = req.body?.Body || "";

      console.log("📦 numMedia:", numMedia, "mediaType:", mediaType, "mediaUrl:", mediaUrl);
      console.log("💬 incomingMsg (raw):", incomingMsg);

      // ---------- OCR ----------
      if (numMedia && mediaType.startsWith("image/")) {
        console.log("🖼 Detected image, performing OCR...");
        const resp = await fetch(mediaUrl, {
          headers: { Authorization: "Basic " + Buffer.from(`${AccountSid}:${AuthToken}`).toString("base64") },
        });
        const buffer = Buffer.from(await resp.arrayBuffer());
        const uploaded = await uploadToCloudinary(buffer, "image", "receipts");
        const { data: { text } } = await Tesseract.recognize(uploaded, "eng");
        console.log("📄 OCR text:", text);
        await Order.create({
          phone: From.replace("whatsapp:", ""),
          receiptUrl: uploaded,
          receiptExtract: { rawText: text },
        });
      }

      // ---------- STT ----------
      let transcript = "";
      if (numMedia && mediaType.includes("audio")) {
        console.log("🎤 Audio detected — transcribing...");
        transcript = await withRetry(() => transcribeAudio(mediaUrl, AccountSid, AuthToken));
        console.log("🗣 STT Transcript:", transcript);
        if (transcript && transcript.trim() !== "") incomingMsg = transcript;
      }

      // ---------- Session ----------
      console.log("🧠 Fetching/Creating session for:", From);
      let session = await CustomerSession.findOne({ phoneNumber: From });
      if (!session) {
        console.log("🆕 Creating new session...");
        session = await CustomerSession.create({
          phoneNumber: From,
          hasReceivedWelcome: false,
          conversationHistory: [],
        });
      }

      // ---------- Store customer message ----------
      if (normalizeText(incomingMsg) || numMedia) {
        const entry = {
          sender: "customer",
          type: numMedia ? (mediaType.includes("audio") ? "audio" : "media") : "text",
          content: transcript && transcript.trim() !== "" ? transcript : incomingMsg,
          timestamp: new Date(),
        };

        // If audio — include both original audio URL and transcript text for dashboard
        if (numMedia && mediaType.includes("audio")) {
          entry.audioUrl = mediaUrl;
          entry.transcribedText = transcript || "";
        }

        session.conversationHistory.push(entry);
        await session.save();
        console.log("💬 Saved customer message to session:", entry);
      }

      // ---------- INTRO ----------
      if (!session.hasReceivedWelcome) {
        console.log("👋 Sending INTRO sequence...");
        if (templateSid) {
          const sid = await sendTemplate(From, fromWhatsApp, templateSid, { 1: "Friend" }, statusCallback);
          console.log("📨 Template SID:", sid?.sid);
          await waitForDelivered(sid?.sid);
          await sleep(INTRO_TEMPLATE_DELAY + jitter());
        }

        const intro = await Intro.findOne();
        console.log("📜 Intro sequence found:", intro?.sequence?.length || 0);

        if (intro?.sequence?.length) {
          for (const step of intro.sequence) {
            console.log(`▶️ Sending intro step:`, step);
            if (step.type === "text") {
              const sid = await sendWithRetry({
                from: fromWhatsApp,
                to: From,
                body: step.content || "",
                ...(statusCallback ? { statusCallback } : {}),
              });
              pushHistory(session, { sender: "ai", type: "text", content: step.content || "" });
              await session.save();
              await waitForDelivered(sid?.sid || sid);
              await sleep(INTRO_TEXT_DELAY + jitter());
              continue;
            }

            if ((step.type === "audio" || step.type === "video") && step.fileUrl) {
              const url = toAbsoluteUrl(step.fileUrl);
              console.log(`🎬 Sending media: ${url}`);
              const sid = await sendWithRetry({
                from: fromWhatsApp,
                to: From,
                mediaUrl: [url],
                ...(statusCallback ? { statusCallback } : {}),
              });
              pushHistory(session, { sender: "ai", type: step.type, content: url });
              await session.save();
              await waitForDelivered(sid?.sid || sid);
              await sleep(INTRO_MEDIA_DELAY + jitter());
              continue;
            }
          }
        }

        session.hasReceivedWelcome = true;
        await session.save();
        console.log("✅ Intro complete for", From);
        return;
      }

      // ---------- 24H reopen ----------
      if (session.conversationHistory.length > 0) {
        const lastMsg = session.conversationHistory.at(-1);
        const hours = (Date.now() - new Date(lastMsg.timestamp)) / 36e5;
        console.log(`⏱ Last message was ${hours.toFixed(2)} hours ago`);
        if (hours > 24 && REENGAGE_TEMPLATE) {
          console.log("🔁 Re-engaging old user...");
          await sendTemplate(From, fromWhatsApp, REENGAGE_TEMPLATE, { 1: "Muna nan 😊" }, statusCallback);
          await sleep(1200);
        }
      }

      // ---------- QA MATCH ----------
      console.log("🔎 Searching QA match for:", incomingMsg);
      const match = normalizeText(incomingMsg) ? await findBestMatch(QA, incomingMsg) : null;
      console.log("🎯 Match result:", match);

      if (match) {
        if (match.answerText?.trim()) {
          console.log("💬 Sending text answer...");
          const textSid = await sendWithRetry({
            from: fromWhatsApp,
            to: From,
            body: match.answerText,
            ...(statusCallback ? { statusCallback } : {}),
          });
          pushHistory(session, { sender: "ai", type: "text", content: match.answerText });
          await session.save();
          await waitForDelivered(textSid?.sid || textSid);
        }

        if (match.answerAudio) {
          console.log("🎧 Sending audio answer...");
          let url = await ensurePublicMedia(match.answerAudio, "audio");

          if (url.endsWith(".mp4")) {
            console.log("🔄 Converting MP4 to MP3 for WhatsApp...");
            const tmp = `./qa_${Date.now()}.mp4`;
            const res = await fetch(url);
            fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
            const converted = await encodeForWhatsApp(tmp, "audio");
            const uploaded = await uploadToCloudinary(fs.readFileSync(converted), "audio", "qa_voice");
            url = uploaded;
            fs.unlinkSync(tmp);
            fs.unlinkSync(converted);
          }

          const audSid = await sendWithRetry({
            from: fromWhatsApp,
            to: From,
            mediaUrl: [url],
            ...(statusCallback ? { statusCallback } : {}),
          });

          pushHistory(session, { sender: "ai", type: "audio", content: url });
          await session.save();
          await waitForDelivered(audSid?.sid || audSid);
        }

        console.log("✅ QA flow complete");
        return;
      }

      console.log("❓ No QA match found, skipping...");
    } catch (err) {
      console.error("❌ Webhook internal error:", err);
    }
  })();
});

export default r;
