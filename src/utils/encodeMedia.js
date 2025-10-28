import { exec } from "child_process";
import path from "path";
import fs from "fs";

/**
 * Re-encode audio/video to WhatsApp-safe format and size.
 * WhatsApp limits media to 16MB and requires:
 *  - Video: H.264 Baseline, AAC
 *  - Audio: MP3, 44.1kHz, 128kbps
 */
export function encodeForWhatsApp(inputPath, type) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    const ext = type === "video" ? ".mp4" : ".mp3";
    const safePath = path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}-safe${ext}`
    );

    // Add compression to keep file <16MB
    let cmd;
    if (type === "video") {
      cmd = `ffmpeg -y -i "${inputPath}" -vf "scale=720:-2" -c:v libx264 -profile:v baseline -level 3.0 -preset veryfast -b:v 900k -c:a aac -b:a 128k -movflags +faststart "${safePath}"`;
    } else {
      cmd = `ffmpeg -y -i "${inputPath}" -ar 44100 -ac 2 -b:a 128k "${safePath}"`;
    }

    console.log("🎬 Re-encoding for WhatsApp:", cmd);
    exec(cmd, (error) => {
      if (error) {
        return reject(new Error(`ffmpeg failed: ${error.message}`));
      }
      console.log("✅ Encoded safe media:", safePath);
      resolve(safePath);
    });
  });
}
