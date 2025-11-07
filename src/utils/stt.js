// /src/utils/stt.js
import fs from "fs";
import path from "path";
import axios from "axios";
import { exec } from "child_process";
import speech from "@google-cloud/speech";
import { GoogleAuth } from "google-auth-library";

/**
 * Load Google credentials exactly how they are stored in .env
 */
function loadGoogleCredentials() {
  const key = (process.env.GCP_PRIVATE_KEY || process.env["private_key"])?.replace(/\\n/g, "\n");

  const creds = {
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

  if (!creds.client_email || !creds.private_key) {
    console.warn("⚠️ Missing Google STT credentials — transcription will fail.");
  } else {
    console.log("✅ Google STT credentials loaded:", creds.client_email);
  }

  return creds;
}

// ✅ Use GoogleAuth properly (fixes 401 Unauthorized issues)
const googleAuth = new GoogleAuth({
  credentials: loadGoogleCredentials(),
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const googleClient = new speech.SpeechClient({ auth: googleAuth });

/**
 * Download Twilio audio → Convert → STT
 */
export async function transcribeAudio(mediaUrl, AccountSid, AuthToken) {
  const oggPath = path.resolve("./voice.ogg");
  const wavPath = path.resolve("./voice.wav");

  try {
    if (!mediaUrl) return null;

    console.log("⬇️  Downloading audio from Twilio CDN...");
    const writer = fs.createWriteStream(oggPath);
    const res = await axios({
      url: mediaUrl,
      method: "GET",
      responseType: "stream",
      auth: { username: AccountSid, password: AuthToken },
    });

    res.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log("🎛  Converting to WAV...");
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i "${oggPath}" -ar 16000 -ac 1 -f wav "${wavPath}"`, err => {
        if (err) return reject(err);
        resolve();
      });
    });

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

    const text = (resp.results || [])
      .map(r => r.alternatives?.[0]?.transcript || "")
      .join(" ")
      .trim();

    console.log("🎤 STT:", text || "(empty)");
    return text || null;

  } catch (err) {
    console.error("❌ STT ERROR:", err?.message || err);

    // ✅ If Google returned API error details, print them
    if (err?.response?.data?.error) {
      console.error("📡 Google API Error:", err.response.data.error);
      console.error("💬 Message:", err.response.data.error.message);
      console.error("🔑 Reason:", err.response.data.error.status);
    }

    // ✅ gRPC STT error details
    if (err?.details) {
      console.error("📝 Google STT Details:", err.details);
    }

    return null;
  } finally {
    try { fs.unlinkSync(oggPath); } catch {}
    try { fs.unlinkSync(wavPath); } catch {}
  }
}
