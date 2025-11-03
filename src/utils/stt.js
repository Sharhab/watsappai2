import fs from "fs";
import path from "path";
import axios from "axios";
import { exec } from "child_process";
import speech from "@google-cloud/speech";
import { JWT } from "google-auth-library";

function loadGoogleCredentials() {
  const privateKey = process.env.GCP_PRIVATE_KEY_BASE64
    ? Buffer.from(process.env.GCP_PRIVATE_KEY_BASE64, "base64").toString("utf8")
    : (process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  const projectId = process.env.GCP_PROJECT_ID;

  console.log("🔍 GOOGLE STT CREDENTIAL CHECK:");
  console.log("client_email:", clientEmail || "(missing)");
  console.log("project_id:", projectId || "(missing)");
  console.log("private_key:", privateKey ? "(loaded ✅)" : "(missing ❌)");
  console.log("────────────────────────────────────────────");

  if (!clientEmail || !privateKey || !projectId) {
    console.error("❌ Missing Google credentials — STT will fail.");
  }

  return { clientEmail, privateKey, projectId };
}

const { clientEmail, privateKey, projectId } = loadGoogleCredentials();

// ✅ Create JWT Auth Client (Correct way)
const jwtClient = new JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// ✅ Create Speech Client using JWT Auth
const googleClient = new speech.SpeechClient({
  projectId,
  auth: jwtClient,
});

export async function transcribeAudio(mediaUrl, accountSid, authToken) {
  const oggPath = path.resolve("./voice.ogg");
  const wavPath = path.resolve("./voice.wav");

  try {
    if (!mediaUrl) return null;

    console.log("⬇️  Downloading audio from Twilio CDN...");
    const writer = fs.createWriteStream(oggPath);
    const response = await axios({
      url: mediaUrl,
      method: "GET",
      responseType: "stream",
      auth: { username: accountSid, password: authToken },
    });

    response.data.pipe(writer);
    await new Promise((res, rej) => {
      writer.on("finish", res);
      writer.on("error", rej);
    });

    console.log("🎛 Converting to WAV...");
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
      },
    };

    console.log("🗣 Calling Google STT...");
    const [resp] = await googleClient.recognize(request);
    const transcription = (resp.results || [])
      .map(r => r.alternatives?.[0]?.transcript || "")
      .join(" ")
      .trim();

    console.log("🎤 STT:", transcription || "(empty)");
    return transcription || null;

  } catch (err) {
    console.error("❌ Google STT failed:", err?.message || err);
    return null;
  } finally {
    try { fs.unlinkSync(oggPath); } catch {}
    try { fs.unlinkSync(wavPath); } catch {}
  }
}
