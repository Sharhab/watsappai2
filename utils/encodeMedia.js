const { exec } = require("child_process");
const path = require("path");

/**
 * Re-encode a file to WhatsApp-safe format
 * @param {string} inputPath - Original uploaded file
 * @param {string} type - "audio" | "video"
 * @returns {Promise<string>} - Path to safe re-encoded file
 */
function encodeForWhatsApp(inputPath, type) {
  return new Promise((resolve, reject) => {
    const ext = type === "video" ? ".mp4" : ".mp3";
    const safePath = path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}-safe${ext}`
    );

    let cmd;
    if (type === "video") {
      // WhatsApp requires H.264 Baseline + AAC
      cmd = `ffmpeg -y -i "${inputPath}" -c:v libx264 -profile:v baseline -level 3.0 -c:a aac -b:a 128k "${safePath}"`;
    } else {
      // WhatsApp requires standard MP3
      cmd = `ffmpeg -y -i "${inputPath}" -ar 44100 -ac 2 -b:a 128k "${safePath}"`;
    }

    exec(cmd, (error) => {
      if (error) {
        return reject(error);
      }
      resolve(safePath);
    });
  });
}

module.exports = { encodeForWhatsApp };
