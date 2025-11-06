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

/** Ensure Twilio-reachable media URL:
 *  - If url is unreachable, download → re-upload to Cloudinary → return new public URL
 */
async function ensurePublicMedia(url, type /* 'audio' | 'video' */) {
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
    console.error("❌ Failed to re-upload QA media, will try raw URL anyway:", e?.message || e);
    return abs;
  }
}

// ------------------------------------

r.post("/webhook", withTenant, async (req, res) => {
  // Always ACK quickly to avoid Twilio retries + 12200 confusion
  try { res.status(200).send("OK"); } catch {}

  (async () => {
    const { QA, Intro, CustomerSession, Order } = req.models;
    const { From } = req.body || {};

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

    try {
      // -------- IMAGE → OCR (receipt) ----------
      if (numMedia && mediaType.startsWith("image/")) {
        const resp = await fetch(mediaUrl, {
          headers: {
            Authorization: "Basic " + Buffer.from(`${AccountSid}:${AuthToken}`).toString("base64"),
          },
        });
        const buffer = Buffer.from(await resp.arrayBuffer());
        const uploaded = await uploadToCloudinary(buffer, "image", "receipts");
        const { data: { text } } = await Tesseract.recognize(uploaded, "eng");
        await Order.create({
          phone: From.replace("whatsapp:", ""),
          receiptUrl: uploaded,
          receiptExtract: { rawText: text },
        });
      }

      // -------- AUDIO → STT ----------
      if (numMedia && mediaType.includes("audio")) {
        console.log("🎙 Voice message detected → Calling STT...");
        const transcript = await withRetry(
          () => transcribeAudio(mediaUrl, AccountSid, AuthToken),
          { retries: 1, baseDelayMs: 800 }
        );
        if (transcript) {
          incomingMsg = transcript;
          console.log("📝 TRANSCRIBED:", transcript);
        }
      }

      // -------- SESSION ----------
      let session = await CustomerSession.findOne({ phoneNumber: From });
      if (!session) {
        session = await CustomerSession.create({
          phoneNumber: From,
          hasReceivedWelcome: false,
          conversationHistory: [],
        });
      }

      if (normalizeText(incomingMsg)) {
        console.log("🧠 USER SAID:", incomingMsg);
        session.conversationHistory.push({
          sender: "customer",
          content: incomingMsg,
          type: numMedia ? "voice" : "text",
          timestamp: new Date(),
        });
        await session.save();
      }

      // -------- INTRO (template + steps; same approach as before) ----------
      if (!session.hasReceivedWelcome) {
        if (templateSid) {
          await sendTemplate(From, fromWhatsApp, templateSid, { 1: "Friend" }, statusCallback);
        }

        const intro = await Intro.findOne();
        if (intro?.sequence?.length) {
          for (const step of intro.sequence) {
            if (step.type === "text") {
              await sendWithRetry({
                from: fromWhatsApp, to: From, body: step.content,
                ...(statusCallback ? { statusCallback } : {}),
              });
            } else if ((step.type === "audio" || step.type === "video") && step.fileUrl) {
              // keep same approach as earlier (encode + reupload → public)
              const abs = toAbsoluteUrl(step.fileUrl);
              const tmp = `./tmp_${Date.now()}.${step.type === "audio" ? "mp3" : "mp4"}`;
              try {
                const dl = await fetch(abs);
                fs.writeFileSync(tmp, Buffer.from(await dl.arrayBuffer()));
                const encoded = await encodeForWhatsApp(tmp, step.type);
                const uploaded = await uploadToCloudinary(fs.readFileSync(encoded), step.type, "intro_steps");
                await sendWithRetry({
                  from: fromWhatsApp, to: From, mediaUrl: [uploaded],
                  ...(statusCallback ? { statusCallback } : {}),
                });
                fs.unlinkSync(tmp); fs.unlinkSync(encoded);
              } catch {
                await sendWithRetry({
                  from: fromWhatsApp, to: From, mediaUrl: [abs],
                  ...(statusCallback ? { statusCallback } : {}),
                });
              }
            }

            session.conversationHistory.push({
              sender: "ai",
              content: step.type === "text" ? step.content : `[${step.type}]`,
              type: step.type,
              timestamp: new Date(),
            });
            await session.save();
            await new Promise(r => setTimeout(r, INTRO_DELAY));
          }
        }

        session.hasReceivedWelcome = true;
        await session.save();
        return;
      }

      // -------- QA MATCH ----------
      const match = normalizeText(incomingMsg)
        ? await findBestMatch(QA, incomingMsg)
        : null;

      if (match) {
        console.log("🎯 MATCH FOUND:", {
          question: match.question,
          hasAudio: !!match.answerAudio,
          hasVideo: !!match.answerVideo,
          textPreview: (match.answerText || "").slice(0, 120),
        });

        // Media first, but ensure public URL
        if (match.answerAudio) {
          const url = await ensurePublicMedia(match.answerAudio, "audio");
          await sendWithRetry({
            from: fromWhatsApp, to: From, mediaUrl: [url],
            ...(statusCallback ? { statusCallback } : {}),
          });
          return;
        }
        if (match.answerVideo) {
          const url = await ensurePublicMedia(match.answerVideo, "video");
          await sendWithRetry({
            from: fromWhatsApp, to: From, mediaUrl: [url],
            ...(statusCallback ? { statusCallback } : {}),
          });
          return;
        }

        // Text
        await sendWithRetry({
          from: fromWhatsApp, to: From,
          body: match.answerText || "Mun gane tambayarka.",
          ...(statusCallback ? { statusCallback } : {}),
        });
        return;
      }

      // -------- FALLBACK ----------
      await sendWithRetry({
        from: fromWhatsApp, to: From,
        body: "Ba mu gane tambayarka ba sosai. Don Allah ka bayyana.",
        ...(statusCallback ? { statusCallback } : {}),
      });

    } catch (err) {
      console.error("❌ Webhook error:", err);
    }
  })();
});

export default r;
