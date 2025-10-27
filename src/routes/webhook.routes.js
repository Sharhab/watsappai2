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

/** ----------------------------
 * Utility: generic retry helper
 * -----------------------------
 * Usage: await withRetry(() => somePromise(), { retries: 3, baseDelayMs: 500 })
 */
async function withRetry(task, { retries = 2, baseDelayMs = 600, label = "task" } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await task();
      if (attempt > 1) console.log(`🔁 [withRetry] ${label} succeeded on attempt ${attempt}`);
      return res;
    } catch (err) {
      lastErr = err;
      console.warn(`🔁 [withRetry] ${label} failed on attempt ${attempt}:`, err?.message || err);
      if (attempt <= retries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // exp backoff
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  console.error(`❌ [withRetry] ${label} ultimately failed after ${retries + 1} attempts`);
  throw lastErr;
}

function safePreview(str, max = 120) {
  if (!str) return "";
  const oneLine = String(str).replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function resolveFromWhatsApp(whatsappNumber) {
  if (!whatsappNumber) return null;
  return whatsappNumber.startsWith("whatsapp:") ? whatsappNumber : `whatsapp:${whatsappNumber}`;
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

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
    const twilioAccountSid =
      tenant?.twilio?.accountSid || process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken =
      tenant?.twilio?.authToken || process.env.TWILIO_AUTH_TOKEN;
    const templateSid =
      tenant?.twilio?.templateSid || process.env.TWILIO_TEMPLATE_SID;
    const statusCallbackUrl =
      tenant?.twilio?.statusCallbackUrl || process.env.TWILIO_STATUS_CALLBACK_URL;
    const whatsappNumber =
      tenant?.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER;

    // ✅ Build Google credentials JSON from env vars
    const googleCredentials = {
      type: process.env.GCP_TYPE || process.env["gcp-type"],
      project_id: process.env.GCP_PROJECT_ID || process.env["gcp-project_id"],
      private_key_id:
        process.env.GCP_PRIVATE_KEY_ID || process.env["gcp-private_key_id"],
      private_key:
        (process.env.GCP_PRIVATE_KEY || process.env["gcp-private_key"])?.replace(
          /\\n/g,
          "\n"
        ),
      client_email:
        process.env.GCP_CLIENT_EMAIL || process.env["gcp-client_email"],
      client_id: process.env.GCP_CLIENT_ID || process.env["gcp-client_id"],
      auth_uri: process.env.GCP_AUTH_URI || process.env["gcp-auth_uri"],
      token_uri: process.env.GCP_TOKEN_URI || process.env["gcp-token_uri"],
      auth_provider_x509_cert_url:
        process.env.GCP_AUTH_PROVIDER_X509_CERT_URL ||
        process.env["gcp-auth_provider_x509_cert_url"],
      client_x509_cert_url:
        process.env.GCP_CLIENT_X509_CERT_URL ||
        process.env["gcp-client_x509_cert_url"],
      universe_domain:
        process.env.GCP_UNIVERSE_DOMAIN || process.env["gcp-universe_domain"],
    };

    console.log("────────────────────────────────────────────────────────");
    console.log("📨 Incoming WhatsApp webhook");
    console.log("To:", To, "From:", From);
    console.log("Tenant:", tenant?.slug || tenant?._id || "n/a");
    console.log("Twilio cfg →",
      {
        accountSid: twilioAccountSid ? "[set]" : "[missing]",
        templateSid: templateSid ? "[set]" : "[missing]",
        statusCallbackUrl: statusCallbackUrl || null,
        whatsappNumber: whatsappNumber || null,
      }
    );
    console.log("GCP client email env:", googleCredentials.client_email);

    const from = From;
    const numMedia = parseInt(req.body?.NumMedia || "0", 10) || 0;
    const media0Type = req.body?.MediaContentType0 || "";
    const media0Url = req.body?.MediaUrl0;
    let incomingMsg = req.body?.Body || "";

    console.log("Body:", safePreview(incomingMsg));
    console.log("NumMedia:", numMedia, "Media0Type:", media0Type);

    try {
      // ---------------- IMAGES -> OCR -> ORDERS ----------------
      if (
        numMedia &&
        media0Url &&
        (media0Type || "").startsWith("image/")
      ) {
        console.log("📥 New receipt uploaded:", media0Url);

        const response = await fetch(media0Url, {
          headers: {
            Authorization:
              "Basic " + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64"),
          },
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        const permanentUrl = await uploadToCloudinary(buffer, "image", "receipts");
        console.log("☁️  Uploaded to Cloudinary:", permanentUrl);

        const {
          data: { text },
        } = await Tesseract.recognize(permanentUrl, "eng");
        console.log("🧾 OCR extracted preview:", safePreview(text));

        await Order.create({
          phone: from?.replace("whatsapp:", ""),
          receiptUrl: permanentUrl,
          receiptExtract: { rawText: text },
        });

        console.log("✅ Order stored for", from);
      }

      // ---------------- AUDIO -> STT ----------------
      if (numMedia > 0 && (media0Type || "").includes("audio")) {
        console.log("🗣 Starting transcription via STT…", { media0UrlPreview: safePreview(media0Url, 80) });
        const transcript = await withRetry(
          () =>
            transcribeAudio(
              media0Url,
              twilioAccountSid,
              twilioAuthToken,
              googleCredentials
            ),
          { retries: 2, baseDelayMs: 800, label: "transcribeAudio" }
        );
        console.log("🎤 Transcript:", safePreview(transcript));
        if (transcript) incomingMsg = transcript || incomingMsg;
        else console.warn("⚠️ Transcription returned empty/null; falling back to text body if present.");
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
          type: numMedia > 0 ? (media0Type.includes("audio") ? "audio" : "media") : "text",
          timestamp: new Date(),
        });
        await session.save();
      }

      const fromWhatsApp = resolveFromWhatsApp(whatsappNumber);
      if (!fromWhatsApp) {
        console.error("❌ Missing whatsappNumber (env or tenant). Cannot send replies.");
        return;
      }

      const tplSid = templateSid;
      const statusCallback = statusCallbackUrl;

      // ---------------- FIRST CONTACT (intro flow) ----------------
      if (!session.hasReceivedWelcome) {
        console.log("👋 Sending intro sequence…", {
          usingTemplate: Boolean(tplSid),
          statusCallback: statusCallback || null,
        });

        if (tplSid) {
          try {
            await sendTemplate(from, fromWhatsApp, tplSid, { 1: "Friend" }, statusCallback);
            console.log("📤 Template sent:", { to: from, templateSid: tplSid });
            await new Promise((r) => setTimeout(r, 2500));
          } catch (e) {
            console.warn("⚠️ Failed to send template:", e?.message || e);
          }
        }

        const intro = await Intro.findOne();
        if (!intro) {
          console.warn("⚠️ No Intro document found; skipping intro sequence.");
        } else {
          console.log("ℹ️ Intro doc found. Steps:", intro?.sequence?.length || 0);

          for (const [i, step] of (intro?.sequence || []).entries()) {
            console.log(`➡️ Intro step #${i + 1}`, step);

            if (step.type === "text") {
              console.log("✉️ (Intro Text) preview:", safePreview(step.content));
              await sendWithRetry({
                from: fromWhatsApp,
                to: from,
                body: step.content,
                ...(statusCallback ? { statusCallback } : {}),
              });
              console.log("✅ (Intro Text) sent.");

            } else if ((step.type === "audio" || step.type === "video") && step.fileUrl) {
              const abs = toAbsoluteUrl(step.fileUrl);
              const ok = await headOk(abs);
              console.log(`🎬 (Intro ${step.type.toUpperCase()}) URL:`, abs, "reachable:", ok);

              await sendWithRetry({
                from: fromWhatsApp,
                to: from,
                mediaUrl: [abs],
                ...(statusCallback ? { statusCallback } : {}),
              });
              console.log(`✅ (Intro ${step.type.toUpperCase()}) sent.`);
            } else {
              console.warn("⚠️ Unknown or incomplete intro step; skipping:", step);
            }

            // Persist the AI message in history
            session.conversationHistory.push({
              sender: "ai",
              content: step.type === "text" ? step.content : `[${step.type}]`,
              type: step.type,
              timestamp: new Date(),
            });
            await session.save();

            await new Promise((r) => setTimeout(r, 2500));
          }
        }

        session.hasReceivedWelcome = true;
        await session.save();
        console.log("✅ Intro sequence sent successfully");
        return;
      }

      // ---------------- QA MATCH ----------------
      let match = null;
      if (incomingMsg && incomingMsg.trim()) {
        try {
          match = await findBestMatch(QA, incomingMsg);
        } catch (e) {
          console.warn("⚠️ findBestMatch failed:", e?.message || e);
        }
      }

      if (match) {
        // Try to log helpful info without assuming exact schema
        const matchInfo = {
          id: match?._id || match?.id || null,
          question: safePreview(match?.question || match?.q),
          answerPreview: safePreview(match?.answerText),
          hasAudio: Boolean(match?.answerAudio),
          hasVideo: Boolean(match?.answerVideo),
        };
        console.log("✅ Matched QA:", matchInfo);

        const text =
          match.answerText ||
          "Mun gano tambayar ka, amma ba mu da amsa a rubuce yanzu.";
        console.log("📤 Sending QA text reply:", safePreview(text));

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
          console.log("📤 Sending QA media reply:", mediaUrl);
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
      } else {
        console.log("ℹ️ No QA match (or empty message).");
      }

      // ---------------- FALLBACK ----------------
      const fallbackText = "Ba mu gane tambayarka ba sosai. Don Allah ka bayyana.";
      console.log("📤 Sending fallback:", fallbackText);

      await sendWithRetry({
        from: fromWhatsApp,
        to: from,
        body: fallbackText,
        ...(statusCallback ? { statusCallback } : {}),
      });

      session.conversationHistory.push({
        sender: "ai",
        content: fallbackText,
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
