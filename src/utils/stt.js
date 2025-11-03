// /src/utils/stt.js
import fs from "fs";
import path from "path";
import axios from "axios";
import { exec } from "child_process";
import { SpeechClient } from "@google-cloud/speech";

/**
 * 🎙 Download Twilio audio → Convert → Transcribe via Google STT
 * ✅ Uses credentials PASSED from webhook (correct).
 */
export async function transcribeAudio(mediaUrl, accountSid, authToken, googleCredentials) {
  const oggPath = path.resolve("./voice.ogg");
  const wavPath = path.resolve("./voice.wav");

  try {
    if (!mediaUrl) return null;

    // ✅ Ensure private key newlines are valid
    if (googleCredentials?.private_key) {
      googleCredentials.private_key = googleCredentials.private_key.replace(/\\n/g, "\n");
    }

    const client = new SpeechClient({
      credentials: googleCredentials,
    });

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

    const [result] = await client.recognize({
      audio: { content: audioBytes },
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: "ha-NG", // Hausa
        alternativeLanguageCodes: ["en-US"], // fallback to English
        enableAutomaticPunctuation: true,
      },
    });

    const text = result?.results?.[0]?.alternatives?.[0]?.transcript?.trim() || "";
    console.log("🎤 Raw Google Transcription:", text || "(empty)");

    return text || null;
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
