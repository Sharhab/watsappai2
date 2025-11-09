import "dotenv/config";
import mongoose from "mongoose";
import https from "https";
import fs from "fs";
import path from "path";
import uploadToCloudinary from "./src/utils/cloudinaryUpload.js";
import { encodeForWhatsApp } from "./src/utils/encodeForWhatsApp.js";
import introSchema from "./src/modelsShared/Intro.js";
import { toAbsoluteUrl } from "./src/utils/media.js";

console.log("🔌 Connecting to MongoDB...");
await mongoose.connect(process.env.MONGO_URI);
console.log("✅ Connected");

// Use correct collection
const Intro = mongoose.model("Intro", introSchema, "intros");

const intro = await Intro.findOne();
if (!intro?.sequence?.length) {
  console.log("❌ No intro found");
  process.exit(0);
}

const step = intro.sequence[0];

if (step.type !== "video") {
  console.log("❌ First step is not video, nothing to do");
  process.exit(0);
}

console.log(`🎬 Optimizing First Video: ${step.fileUrl}`);

function downloadToFile(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) return reject(new Error("Download failed"));
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
  });
}

const abs = toAbsoluteUrl(step.fileUrl);
const tmp = path.join(".", `intro_first_${Date.now()}_src`);

await downloadToFile(abs, tmp);

// Convert → WhatsApp safe
const converted = await encodeForWhatsApp(tmp, "video");

// Upload back to Cloudinary
const uploaded = await uploadToCloudinary(fs.readFileSync(converted), "video", "intro_optimized");

step.fileUrl = uploaded;
await intro.save();

fs.unlinkSync(tmp);
fs.unlinkSync(converted);

console.log(`✅ First Video Successfully Optimized → ${uploaded}`);
process.exit();
