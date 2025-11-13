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
      let incomingMsg = req.body?.Body?.trim() || "";

      console.log("📦 numMedia:", numMedia, "mediaType:", mediaType, "mediaUrl:", mediaUrl);
      console.log("💬 incomingMsg (raw):", incomingMsg);

      // ---------- Handle Image (receipt etc.) ----------
      if (numMedia && mediaType.startsWith("image/")) {
        console.log("🖼 Detected image, performing OCR...");
        const resp = await fetch(mediaUrl, {
          headers: {
            Authorization:
              "Basic " + Buffer.from(`${AccountSid}:${AuthToken}`).toString("base64"),
          },
        });
        const buffer = Buffer.from(await resp.arrayBuffer());
        const uploaded = await uploadToCloudinary(buffer, "image", "receipts");

        // OCR extract
        const { data: { text } } = await Tesseract.recognize(uploaded, "eng");
        console.log("📄 OCR text:", text);

        // save receipt for record
        await Order.create({
          phone: From.replace("whatsapp:", ""),
          receiptUrl: uploaded,
          receiptExtract: { rawText: text },
        });

        // store in conversation for dashboard view
        const session = await CustomerSession.findOneAndUpdate(
          { phoneNumber: From },
          {
            $push: {
              conversationHistory: {
                sender: "customer",
                type: "image",
                content: uploaded,
                timestamp: new Date(),
              },
            },
          },
          { upsert: true, new: true }
        );

        await session.save();
        console.log("✅ Image stored in dashboard");
        return;
      }

      // ---------- Handle Audio ----------
      if (!incomingMsg && numMedia && mediaType.includes("audio")) {
        console.log("🎤 Audio detected — transcribing...");
        const transcript = await withRetry(() =>
          transcribeAudio(mediaUrl, AccountSid, AuthToken)
        );
        console.log("🗣 STT Transcript:", transcript);
        incomingMsg = transcript?.trim()
          ? transcript
          : "[voice message could not be transcribed]";
      }

      // ---------- Create / Get Session ----------
      let session = await CustomerSession.findOne({ phoneNumber: From });
      if (!session) {
        console.log("🆕 Creating new session...");
        session = await CustomerSession.create({
          phoneNumber: From,
          hasReceivedWelcome: false,
          conversationHistory: [],
        });
      }

      // ---------- Store Customer Message ----------
      if (normalizeText(incomingMsg)) {
        pushHistory(session, {
          sender: "customer",
          type: "text", // always text (even if came from audio)
          content: incomingMsg,
        });
        await session.save();
      }

      // ---------- INTRO ----------
      if (!session.hasReceivedWelcome) {
        console.log("👋 Sending INTRO sequence...");
        if (templateSid) {
          const sid = await sendTemplate(
            From,
            fromWhatsApp,
            templateSid,
            { 1: "Friend" },
            statusCallback
          );
          await waitForDelivered(sid?.sid);
          await sleep(800 + jitter());
        }

        const intro = await Intro.findOne();
        if (intro?.sequence?.length) {
          for (const step of intro.sequence) {
            if (step.type === "text") {
              const sid = await sendWithRetry({
                from: fromWhatsApp,
                to: From,
                body: step.content || "",
              });
              pushHistory(session, { sender: "ai", type: "text", content: step.content });
              await session.save();
              await waitForDelivered(sid?.sid || sid);
              await sleep(1200 + jitter());
            } else if ((step.type === "audio" || step.type === "video") && step.fileUrl) {
              const url = toAbsoluteUrl(step.fileUrl);
              const sid = await sendWithRetry({
                from: fromWhatsApp,
                to: From,
                mediaUrl: [url],
              });
              pushHistory(session, { sender: "ai", type: step.type, content: url });
              await session.save();
              await waitForDelivered(sid?.sid || sid);
              await sleep(4500 + jitter());
            }
          }
        }

        session.hasReceivedWelcome = true;
        await session.save();
        console.log("✅ Intro complete for", From);
        return;
      }

      // ---------- QA MATCH ----------
      const match = normalizeText(incomingMsg)
        ? await findBestMatch(QA, incomingMsg)
        : null;

      if (match) {
        if (match.answerText?.trim()) {
          const textSid = await sendWithRetry({
            from: fromWhatsApp,
            to: From,
            body: match.answerText,
          });
          pushHistory(session, { sender: "ai", type: "text", content: match.answerText });
          await session.save();
          await waitForDelivered(textSid?.sid || textSid);
        }

        if (match.answerAudio) {
          let url = await ensurePublicMedia(match.answerAudio, "audio");
          if (url.endsWith(".mp4")) {
            const tmp = `./qa_${Date.now()}.mp4`;
            const res = await fetch(url);
            fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
            const converted = await encodeForWhatsApp(tmp, "audio");
            const uploaded = await uploadToCloudinary(
              fs.readFileSync(converted),
              "audio",
              "qa_voice"
            );
            url = uploaded;
            fs.unlinkSync(tmp);
            fs.unlinkSync(converted);
          }
          const audSid = await sendWithRetry({
            from: fromWhatsApp,
            to: From,
            mediaUrl: [url],
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
