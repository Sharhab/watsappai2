import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import axios from "axios";
import { createClient } from "@deepgram/sdk";

// Deepgram v3 init
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

export async function transcribeHausaAudio(url) {
  try {
    console.log("📥 Downloading audio...");
    const audioPath = "/tmp/raw.ogg";

    const response = await axios({
      url,
      method: "GET",
      responseType: "arraybuffer",
    });

    fs.writeFileSync(audioPath, response.data);

    const wavPath = "/tmp/converted.wav";

    console.log("🔄 Converting audio to WAV...");
    await new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .audioFrequency(16000)
        .audioChannels(1)
        .format("wav")
        .on("end", resolve)
        .on("error", reject)
        .save(wavPath);
    });

    console.log("🎯 Sending to Deepgram...");

    const { result } = await deepgram.listen.prerecorded.transcribeFile(
      fs.readFileSync(wavPath),
      {
        model: "multilingual",
        language: "hau",
        smart_format: true,
        punctuate: true,
      }
    );

    const transcript =
      result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    console.log("📝 Transcript:", transcript);

    return transcript;
  } catch (err) {
    console.error("❌ Deepgram error:", err);
    return "";
  }
}
