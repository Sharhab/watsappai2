// /src/utils/stt.js
import fs from "fs";
import path from "path";
import axios from "axios";
import { exec } from "child_process";
import speech from "@google-cloud/speech";
import { GoogleAuth } from "google-auth-library";

// Load Google credentials from env (same as before)
function loadGoogleCredentials() {
  return {
    type: process.env["type"],
    project_id: process.env["project_id"],
    private_key_id: process.env["private_key_id"],
    private_key: process.env["private_key"]?.replace(/\\n/g, "\n"),
    client_email: process.env["client_email"],
    client_id: process.env["client_id"],
    auth_uri: process.env["auth_uri"],
    token_uri: process.env["token_uri"],
    auth_provider_x509_cert_url: process.env["auth_provider_x509_cert_url"],
    client_x509_cert_url: process.env["client_x509_cert_url"],
    universe_domain: process.env["universe_domain"],
  };
}

const googleAuth = new GoogleAuth({
  credentials: loadGoogleCredentials(),
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const googleClient = new speech.SpeechClient({ auth: googleAuth });

/**
 * Download audio from Twilio CDN, convert to WAV, run Google STT.
 * @param {string} mediaUrl - Twilio media URL
 * @param {string} accountSid - Twilio SID (for auth)
 * @param {string} authToken - Twilio token (for auth)
 */
export async function transcribeAudio(mediaUrl, accountSid, authToken) {
  const oggPath = path.resolve("./voice.ogg");
  const wavPath = path.resolve("./voice.wav");

  try {
    if (!mediaUrl) {
      console.warn("⚠️ No mediaUrl provided to transcribeAudio.");
      return null;
    }

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

    console.log("🎛  Converting to WAV (16k mono)...");
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i "${oggPath}" -ar 16000 -ac 1 -f wav "${wavPath}"`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    console.log("✅ Converted ->", wavPath);

    const audioBytes = fs.readFileSync(wavPath).toString("base64");

    const request = {
      audio: { content: audioBytes },
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: "ha-NG", // Hausa primary
        alternativeLanguageCodes: ["en-US"], // fallback
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
    try {
      if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath);
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    } catch (cleanupErr) {
      console.warn("⚠️ Cleanup failed:", cleanupErr.message);
    }
  }
}
