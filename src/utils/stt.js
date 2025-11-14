// src/utils/stt.js
import fs from "fs";
import fetch from "node-fetch";
import { execSync } from "child_process";
import { Deepgram } from "@deepgram/sdk";
import path from "path";
import { tmpdir } from "os";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";
const USE_WHISPER_FALLBACK = process.env.USE_WHISPER_FALLBACK === "1"; // optional fallback

const deepgram = DEEPGRAM_API_KEY ? new Deepgram(DEEPGRAM_API_KEY) : null;

/**
 * Download a remote URL (Twilio CDN) to a local file
 */
async function downloadToFile(url, destPath, authHeader = null) {
  const headers = authHeader ? { Authorization: authHeader } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

/**
 * Clean audio with ffmpeg: convert to 16k mono WAV and normalize volume.
 * Requires ffmpeg installed on host.
 */
function cleanAudioWithFFmpeg(inputPath) {
  const outPath = path.join(tmpdir(), `clean_${Date.now()}.wav`);
  // -ar 16000 (sample rate), -ac 1 mono, loudnorm: normalize loudness
  const cmd = `ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -af "loudnorm" "${outPath}"`;
  execSync(cmd, { stdio: "inherit" });
  return outPath;
}

/**
 * Transcribe via Deepgram (Hausa)
 * Returns: { text: string, confidence: number (0-1) }
 */
async function transcribeWithDeepgram(filePath) {
  if (!deepgram) throw new Error("Deepgram API key not configured");
  const audio = fs.readFileSync(filePath);
  // Use preRecorded transcription
  const res = await deepgram.transcription.preRecorded(
    { buffer: audio, mimetype: "audio/wav" },
    {
      model: "general", // Deepgram model; language override below
      language: "ha", // Hausa
      punctuate: true,
      tier: "enhanced",
    }
  );

  // Deepgram returns results.results.channels[0].alternatives[0]
  const alt =
    res?.results?.channels?.[0]?.alternatives?.[0] ||
    res?.results?.channels?.[0] ||
    null;

  const text = alt?.transcript?.trim() || "";
  const confidence = alt?.confidence ?? 0;
  return { text, confidence };
}

/**
 * Optional Whisper fallback using OpenAI (if you want).
 * If you use it, make sure OPENAI_API_KEY is set and you have the @openai client installed.
 */
async function whisperFallback(filePath) {
  if (!USE_WHISPER_FALLBACK) return { text: "", confidence: 0 };
  try {
    // Lazy require to avoid hard dep if not used
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "gpt-4o-mini-transcribe", // replace with your available model
      language: "ha",
    });
    return { text: (r?.text || "").trim(), confidence: r?.confidence ?? 0 };
  } catch (e) {
    console.warn("Whisper fallback failed:", e?.message || e);
    return { text: "", confidence: 0 };
  }
}

/**
 * Main exported function:
 * transcribeAudio(mediaUrl, accountSid, authToken)
 * - downloads Twilio media (auth is Basic with AC:AuthToken)
 * - cleans audio
 * - tries Deepgram, then optional Whisper fallback
 * - returns { text, confidence, used: 'deepgram'|'whisper'|'none' }
 */
export async function transcribeAudio(mediaUrl, accountSid, authToken) {
  if (!mediaUrl) return { text: "", confidence: 0, used: "none" };

  const authHeader =
    accountSid && authToken
      ? "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64")
      : null;

  const tmpDownloaded = path.join(tmpdir(), `dl_${Date.now()}`);
  try {
    // 1) download
    await downloadToFile(mediaUrl, tmpDownloaded, authHeader);

    // 2) ffmpeg clean
    let cleaned = tmpDownloaded;
    try {
      cleaned = cleanAudioWithFFmpeg(tmpDownloaded);
    } catch (e) {
      console.warn("ffmpeg cleaning failed, will attempt with original file:", e.message);
      cleaned = tmpDownloaded;
    }

    // 3) Deepgram
    if (deepgram) {
      try {
        const dg = await transcribeWithDeepgram(cleaned);
        if (dg.text && dg.text.length > 0) {
          return { text: dg.text, confidence: dg.confidence ?? 0, used: "deepgram" };
        }
      } catch (e) {
        console.warn("Deepgram error:", e.message || e);
      }
    }

    // 4) optional Whisper fallback
    if (USE_WHISPER_FALLBACK) {
      const wf = await whisperFallback(cleaned);
      if (wf.text && wf.text.length > 0) {
        return { text: wf.text, confidence: wf.confidence ?? 0, used: "whisper" };
      }
    }

    // nothing worked
    return { text: "", confidence: 0, used: "none" };
  } finally {
    // cleanup files if exist
    try {
      if (fs.existsSync(tmpDownloaded)) fs.unlinkSync(tmpDownloaded);
    } catch {}
  }
}
