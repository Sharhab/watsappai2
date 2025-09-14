import { v2 as cloudinary } from "cloudinary";
import fs from "fs/promises"; // ✅ promise-based file system API

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file to Cloudinary and auto-delete local temp file
 * @param {string} filePath - Local path of the uploaded file
 * @param {string} resourceType - "video" | "image" | "raw" | "auto"
 * @returns {Promise<string>} - Permanent Cloudinary URL
 */
async function uploadToCloudinary(filePath, resourceType = "auto") {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: resourceType,
      folder: "intro_steps", // optional folder in Cloudinary
    });

    // ✅ Auto-delete local temp file after successful upload
    await fs.unlink(filePath).catch(() => {
      console.warn("⚠️ Could not delete temp file:", filePath);
    });

    return result.secure_url; // Cloudinary public URL
  } catch (err) {
    console.error("❌ Cloudinary upload failed:", err.message);

    // Try cleaning up temp file even if upload fails
    await fs.unlink(filePath).catch(() => {
      console.warn("⚠️ Could not delete temp file after failure:", filePath);
    });

    throw err;
  }
}

export default uploadToCloudinary;
