// /src/utils/stt.js
import fs from "fs";
import path from "path";
import axios from "axios";
import { exec } from "child_process";

// ---- Key helpers ------------------------------------------------------------
function readAssemblyKey() {
  // Read + sanitize common mistakes: surrounding quotes, trailing spaces/newlines
  const raw =
    (process.env.ASSEMBLYAI_API_KEY ?? "")
      .trim()
      .replace(/^"(.*)"$/s, "$1")
      .replace(/^'(.*)'$/s, "$1");

  return raw;
}

function maskKey(key) {
  if (!key) return "(empty)";
  if (key.length <= 8) return `${key[0]}***${key[key.length - 1]} (len=${key.length})`;
  return `${key.slice(0, 4)}…${key.slice(-4)} (len=${key.length})`;
}

// Preflight: auth sanity check. If we GET a fake transcript id:
// - 404 => auth OK (id not found, but authorized)
// - 401 => auth BAD
async function verifyAssemblyAIAuth(authKey) {
  try {
    const url = "https://api.assemblyai.com/v2/transcript/does-not-exist";
    const res = await axios.get(url, {
      headers: { "Authorization": authKey },
      validateStatus: () => true, // don't throw on 404/401
      timeout: 10000,
    });
    return { status: res.status, data: res.data };
  } catch (err) {
    return { status: -1, data: err?.message || String(err) };
  }
}

// ---- Main transcription ------------------------------------------------------
export async function transcribeAudio(mediaUrl, accountSid, authToken) {
  const oggPath = path.resolve("./voice.ogg");
  const wavPath = path.resolve("./voice.wav");

  const ASSEMBLYAI_API_KEY = readAssemblyKey();
  console.log("🔐 ASSEMBLY KEY (masked):", maskKey(ASSEMBLYAI_API_KEY));
  console.log('🔤 Header casing check -> sending header: { "Authorization": "<KEY>" }');

  if (!ASSEMBLYAI_API_KEY) {
    console.error("❌ ASSEMBLYAI_API_KEY is missing at runtime.");
    return null;
  }

  // Preflight auth probe
  const probe = await verifyAssemblyAIAuth(ASSEMBLYAI_API_KEY);
  if (probe.status === 401) {
    console.error("❌ AssemblyAI auth preflight failed (401 Unauthorized).");
    console.error("   ➤ Key seen by process:", maskKey(ASSEMBLYAI_API_KEY));
    console.error("   ➤ Response:", probe.data);
    console.error("   Hints: key in *Service* env (not Build), no quotes, no spaces, restart service.");
    return null;
  } else if (probe.status === 404) {
    console.log("✅ AssemblyAI auth preflight OK (404 Not Found is expected for fake id).");
  } else {
    console.warn("⚠️ Unexpected preflight status:", probe.status, probe.data);
    // Continue anyway; this is just diagnostic.
  }

  try {
    if (!mediaUrl) {
      console.warn("⚠️ No mediaUrl provided");
      return null;
    }

    // 1) Download from Twilio (basic auth)
    console.log("⬇️ Downloading audio from Twilio CDN…");
    const audioRes = await axios({
      url: mediaUrl,
      method: "GET",
      responseType: "arraybuffer",
      auth: { username: accountSid, password: authToken },
      timeout: 30000,
    });
    fs.writeFileSync(oggPath, Buffer.from(audioRes.data));

    // 2) Convert to WAV 16k mono
    console.log("🎛 Converting audio → WAV 16k mono…");
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i "${oggPath}" -ar 16000 -ac 1 -f wav "${wavPath}"`, (err) =>
        err ? reject(err) : resolve()
      );
    });

    // 3) Upload to AssemblyAI
    console.log("⬆️ Uploading to AssemblyAI…");
    const uploadRes = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      fs.readFileSync(wavPath),
      {
        headers: {
          "Authorization": ASSEMBLYAI_API_KEY,            // MUST be capitalized
          "Content-Type": "application/octet-stream",
          "Transfer-Encoding": "chunked",
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000,
      }
    );

    // 4) Create transcript job
    console.log("📝 Creating transcript job…");
    const createRes = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      {
        audio_url: uploadRes.data.upload_url,
        language_code: "ha", // Hausa
        // You can add: "auto_chapters": false, "format_text": true, etc.
      },
      {
        headers: {
          "Authorization": ASSEMBLYAI_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    // 5) Poll for completion
    console.log("⏳ Polling transcript status…");
    let status = "queued";
    let result;
    while (status !== "completed" && status !== "error") {
      await new Promise((r) => setTimeout(r, 1700));
      result = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${createRes.data.id}`,
        { headers: { "Authorization": ASSEMBLYAI_API_KEY }, timeout: 15000 }
      );
      status = result.data.status;
      // Optional: console.log("…status =", status);
    }

    if (status === "completed") {
      const text = (result.data.text || "").trim();
      console.log("🎤 STT:", text || "(empty)");
      return text || null;
    }

    console.error("❌ AssemblyAI transcription error:", result.data?.error || result.data);
    return null;

  } catch (err) {
    // Deep diagnostics
    if (err?.response) {
      console.error("❌ AssemblyAI STT ERROR:", {
        status: err.response.status,
        data: err.response.data,
        headers: err.response.headers,
      });
    } else {
      console.error("❌ AssemblyAI STT ERROR:", err?.message || err);
    }
    return null;

  } finally {
    try { fs.existsSync(oggPath) && fs.unlinkSync(oggPath); } catch {}
    try { fs.existsSync(wavPath) && fs.unlinkSync(wavPath); } catch {}
  }
}
