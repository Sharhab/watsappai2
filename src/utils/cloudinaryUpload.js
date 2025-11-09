import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import fs from "fs";
import { encodeForWhatsApp } from "./encodeForWhatsApp.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload + encode for WhatsApp BEFORE storing in Cloudinary
 * @param {Buffer} fileBuffer
 * @param {"image" | "video" | "audio"} type
 * @param {string} folder
 */
async function uploadToCloudinary(fileBuffer, type = "auto", folder = "uploads") {
  let processedBuffer = fileBuffer;

  // ✅ If media is audio or video → Encode to WhatsApp safe format first
  if (type === "video" || type === "audio") {
    const tmpInput = `./tmp_input_${Date.now()}`;
    const tmpOutputType = type === "video" ? ".mp4" : ".mp3";
    const tmpOutput = `./tmp_output_${Date.now()}${tmpOutputType}`;

    // Save input to temp file
    fs.writeFileSync(tmpInput, fileBuffer);

    // Convert
    const encodedPath = await encodeForWhatsApp(tmpInput, type);

    // Replace buffer with optimized output
    processedBuffer = fs.readFileSync(encodedPath);

    // Cleanup
    fs.unlinkSync(tmpInput);
    fs.unlinkSync(encodedPath);
  }

  let resourceType = "auto";
  if (type === "video" || type === "audio") resourceType = "video";
  if (type === "image") resourceType = "image";

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, folder },
      (error, result) => {
        if (error) return reject(error);
        console.log("☁️ Cloudinary upload success:", result.secure_url);
        resolve(result.secure_url);
      }
    );

    streamifier.createReadStream(processedBuffer).pipe(uploadStream);
  });
}

export default uploadToCloudinary;
