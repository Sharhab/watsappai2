// /src/utils/stt.js
import fs from "fs";
import path from "path";
import axios from "axios";
import { exec } from "child_process";

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;

if (!ASSEMBLYAI_KEY) {
  console.warn("⚠️ Missing ASSEMBLYAI_API_KEY — voice messages will not transcribe.");
}

/**
 * Download → Convert → Upload to Assembly → Transcribe
 */
export async function transcribeAudio(mediaUrl, accountSid, authToken) {
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
      auth: { username: accountSid, password: authToken },
    });

    res.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log("🎛  Converting to WAV (16k mono)...");
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i "${oggPath}" -ar 16000 -ac 1 "${wavPath}"`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    console.log("⬆️  Uploading to AssemblyAI...");
    const uploadRes = await axios({
      url: "https://api.assemblyai.com/v2/upload",
      method: "POST",
      headers: { authorization: ASSEMBLYAI_KEY },
      data: fs.createReadStream(wavPath),
    });

    const audioUrl = uploadRes.data.upload_url;

    console.log("🗣  Requesting transcription...");
    const transcribeRes = await axios({
      url: "https://api.assemblyai.com/v2/transcribe",
      method: "POST",
      headers: {
        authorization: ASSEMBLYAI_KEY,
        "content-type": "application/json",
      },
      data: {
        audio_url: audioUrl,
        language_detection: true,
        punctuate: true,
      },
    });

    const transcriptId = transcribeRes.data.id;

    // ⏱ Poll for completion
    let text = null;
    while (true) {
      const statusRes = await axios({
        url: `https://api.assemblyai.com/v2/transcribe/${transcriptId}`,
        method: "GET",
        headers: { authorization: ASSEMBLYAI_KEY },
      });

      if (statusRes.data.status === "completed") {
        text = statusRes.data.text;
        break;
      }

      if (statusRes.data.status === "error") {
        console.error("❌ AssemblyAI STT error:", statusRes.data.error);
        return null;
      }

      await new Promise((r) => setTimeout(r, 800));
    }

    console.log("🎤 STT:", text || "(empty)");
    return text || null;

  } catch (err) {
    console.error("❌ AssemblyAI STT ERROR:", err?.message || err);
    return null;
  } finally {
    try { fs.unlinkSync(oggPath); } catch {}
    try { fs.unlinkSync(wavPath); } catch {}
  }
}
