// /src/utils/stt.js
import fs from "fs";
import path from "path";
import axios from "axios";
import { exec } from "child_process";
import speech from "@google-cloud/speech";

/**
 * ✅ Load Google credentials from environment
 * Supports both GCP_* and raw keys for compatibility.
 */
function loadGoogleCredentials() {
  const creds = {
    type: process.env.GCP_TYPE || process.env["type"],
    project_id: process.env.GCP_PROJECT_ID || process.env["project_id"],
    private_key_id: process.env.GCP_PRIVATE_KEY_ID || process.env["private_key_id"],
    private_key: (process.env.GCP_PRIVATE_KEY || process.env["private_key"])?.replace(/\\n/g, "\n"),
    client_email: process.env.GCP_CLIENT_EMAIL || process.env["client_email"],
    client_id: process.env.GCP_CLIENT_ID || process.env["client_id"],
    token_uri: "https://oauth2.googleapis.com/token",
  };

  // Debug check
  console.log("────────────────────────────────────────────");
  console.log("🔍 GOOGLE STT CREDENTIALS CHECK:");
  console.log("client_email:", creds.client_email || "(MISSING)");
  console.log("project_id:", creds.project_id || "(MISSING)");
  console.log("private_key:", creds.private_key ? "(PRESENT ✅)" : "(MISSING ❌)");
  console.log("────────────────────────────────────────────");

  return creds;
}

/**
 * ✅ Create Google Speech Client (correct / modern auth)
 */
const googleClient = new speech.SpeechClient({
  credentials: loadGoogleCredentials(),
  projectId: process.env.GCP_PROJECT_ID,
});

/**
 * 🎙 Download Twilio audio, convert to WAV, and transcribe via Google STT
 */
export async function transcribeAudio(mediaUrl, accountSid, authToken) {
  const oggPath = path.resolve("./voice.ogg");
  const wavPath = path.resolve("./voice.wav");

  try {
    if (!mediaUrl) {
      console.warn("⚠️ No mediaUrl provided to transcribeAudio.");
      return null;
    }

    // Download audio
    console.log("⬇️  Downloading audio from Twilio CDN...");
    const writer = fs.createWriteStream(oggPath);
    const response = await axios({
      url: mediaUrl,
      method: "GET",
      responseType: "stream",
      auth: { username: accountSid, password: authToken },
    });

    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
    console.log("✅ Audio downloaded ->", oggPath);

    // Convert to WAV
    console.log("🎛  Converting to WAV (16k mono)...");
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i "${oggPath}" -ar 16000 -ac 1 -f wav "${wavPath}"`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    console.log("✅ Converted ->", wavPath);

    // Send to Google STT
    const audioBytes = fs.readFileSync(wavPath).toString("base64");
    const request = {
      audio: { content: audioBytes },
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: "ha-NG",
        alternativeLanguageCodes: ["en-US"],
        enableAutomaticPunctuation: true,
      },
    };

    console.log("🗣  Calling Google STT...");
    const [resp] = await googleClient.recognize(request);
    const transcription = (resp.results || [])
      .map((r) => r.alternatives?.[0]?.transcript || "")
      .join(" ")
      .trim();

    console.log("🎤 Raw Google Transcription:", transcription || "(empty)");
    return transcription || null;

  } catch (err) {
    console.error("❌ Google STT failed:", err?.message || err);
    return null;

  } finally {
    try { if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath); } catch {}
    try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch {}
  }
}
