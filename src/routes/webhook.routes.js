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
import { encodeForWhatsApp } from "../utils/encodeForWhatsApp.js";

const r = Router();
const INTRO_DELAY = Number(process.env.INTRO_DELAY_MS || 800); // FAST intro

async function withRetry(task, { retries = 2, baseDelayMs = 800, label = "task" } = {}) {
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

function safePreview(str, max = 120) {
  if (!str) return "";
  const s = String(str).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

async function headOk(url) {
  try {
    return (await fetch(url, { method: "HEAD" })).ok;
  } catch {
    return false;
  }
}

r.post("/webhook", withTenant, async (req, res) => {
  res.status(200).send("OK");

  (async () => {
    const { QA, Intro, CustomerSession, Order } = req.models;
    const tenant = req.tenant;
    const { From } = req.body || {};

    const AccountSid = process.env.TWILIO_ACCOUNT_SID;
    const AuthToken = process.env.TWILIO_AUTH_TOKEN;
    const templateSid = process.env.TWILIO_TEMPLATE_SID;
    const statusCallback = tenant?.twilio?.statusCallbackUrl || process.env.TWILIO_STATUS_CALLBACK_URL;
    const whatsappNumber = tenant?.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER;
    const fromWhatsApp = whatsappNumber.startsWith("whatsapp:") ? whatsappNumber : `whatsapp:${whatsappNumber}`;

   
    const googleCredentials = {
      type: process.env.GCP_TYPE || process.env["gcp-type"],
      project_id: process.env.GCP_PROJECT_ID || process.env["gcp-project_id"],
      private_key_id: process.env.GCP_PRIVATE_KEY_ID || process.env["gcp-private_key_id"],
      private_key: (process.env.GCP_PRIVATE_KEY || process.env["gcp-private_key"])?.replace(/\\n/g, "\n"),
      client_email: process.env.GCP_CLIENT_EMAIL || process.env["gcp-client_email"],
      client_id: process.env.GCP_CLIENT_ID || process.env["gcp-client_id"],
      auth_uri: process.env.GCP_AUTH_URI || process.env["gcp-auth_uri"],
      token_uri: process.env.GCP_TOKEN_URI || process.env["gcp-token_uri"],
      auth_provider_x509_cert_url: process.env.GCP_AUTH_PROVIDER_X509_CERT_URL || process.env["gcp-auth_provider_x509_cert_url"],
      client_x509_cert_url: process.env.GCP_CLIENT_X509_CERT_URL || process.env["gcp-client_x509_cert_url"],
      universe_domain: process.env.GCP_UNIVERSE_DOMAIN || process.env["gcp-universe_domain"],
    };

    const numMedia = parseInt(req.body?.NumMedia || "0", 10);
    const mediaType = req.body?.MediaContentType0 || "";
    const mediaUrl = req.body?.MediaUrl0;
    let incomingMsg = req.body?.Body || "";

    try {
      // ---------------- RECEIPT IMAGE OCR ----------------
      if (numMedia && mediaType.startsWith("image/")) {
        const response = await fetch(mediaUrl, {
          headers: { Authorization: "Basic " + Buffer.from(`${AccountSid}:${AuthToken}`).toString("base64") }
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        const uploaded = await uploadToCloudinary(buffer, "image", "receipts");

        const { data: { text }} = await Tesseract.recognize(uploaded, "eng");
        await Order.create({ phone: From.replace("whatsapp:", ""), receiptUrl: uploaded, receiptExtract: { rawText: text } });
      }

      // ---------------- AUDIO → TRANSCRIBE ----------------
      if (numMedia && mediaType.includes("audio")) {
        const transcript = await withRetry(() => transcribeAudio(mediaUrl, AccountSid, AuthToken), { label: "STT" });
        if (transcript) incomingMsg = transcript;
      }

      // ---------------- SESSION ----------------
      let session = await CustomerSession.findOne({ phoneNumber: From });
      if (!session) session = await CustomerSession.create({ phoneNumber: From, hasReceivedWelcome: false, conversationHistory: [] });

      if (incomingMsg.trim()) {
        session.conversationHistory.push({ sender: "customer", content: incomingMsg, type: numMedia ? "voice" : "text", timestamp: new Date() });
        await session.save();
      }

      // ---------------- INTRO SEQUENCE ----------------
      if (!session.hasReceivedWelcome) {
        if (templateSid) await sendTemplate(From, fromWhatsApp, templateSid, { 1: "Friend" }, statusCallback);

        const intro = await Intro.findOne();
        if (intro?.sequence) {
          for (const step of intro.sequence) {
            if (step.type === "text") {
              await sendWithRetry({ from: fromWhatsApp, to: From, body: step.content, ...(statusCallback ? { statusCallback } : {}) });

            } else if ((step.type === "audio" || step.type === "video") && step.fileUrl) {
              const abs = toAbsoluteUrl(step.fileUrl);
              const tmp = `./tmp_${Date.now()}.${step.type === "audio" ? "mp3" : "mp4"}`;

              try {
                const res = await fetch(abs);
                fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
                const encoded = await encodeForWhatsApp(tmp, step.type);
                const uploaded = await uploadToCloudinary(fs.readFileSync(encoded), step.type, "intro_steps");

                await sendWithRetry({ from: fromWhatsApp, to: From, mediaUrl: [uploaded], ...(statusCallback ? { statusCallback } : {}) });
                fs.unlinkSync(tmp); fs.unlinkSync(encoded);
              } catch {
                await sendWithRetry({ from: fromWhatsApp, to: From, mediaUrl: [abs], ...(statusCallback ? { statusCallback } : {}) });
              }
            }

            session.conversationHistory.push({ sender: "ai", content: step.content || `[media]`, type: step.type, timestamp: new Date() });
            await session.save();
            await new Promise(r => setTimeout(r, INTRO_DELAY));
          }
        }

        session.hasReceivedWelcome = true;
        await session.save();
        return;
      }

      // ---------------- QA MATCHING ----------------
      const match = incomingMsg ? await findBestMatch(QA, incomingMsg) : null;

      if (match) {
        // ✅ Send AUDIO FIRST
        if (match.answerAudio) {
          await sendWithRetry({ from: fromWhatsApp, to: From, mediaUrl: [match.answerAudio] });
          return;
        }

        // ✅ Then VIDEO
        if (match.answerVideo) {
          await sendWithRetry({ from: fromWhatsApp, to: From, mediaUrl: [match.answerVideo] });
          return;
        }

        // ✅ Then TEXT
        await sendWithRetry({ from: fromWhatsApp, to: From, body: match.answerText || "Mun gane tambayarka." });
        return;
      }

      // ---------------- FALLBACK ----------------
      await sendWithRetry({ from: fromWhatsApp, to: From, body: "Ba mu gane tambayarka ba sosai. Don Allah ka bayyana." });

    } catch (err) {
      console.error("❌ Webhook error:", err);
    }
  })();
});

export default r;



