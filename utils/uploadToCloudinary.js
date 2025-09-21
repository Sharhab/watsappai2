import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

// ✅ configure from env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} fileBuffer - the file buffer
 * @param {"image" | "video" | "audio" | "auto"} type - file type
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<string>} secure_url of the uploaded file
 */
async function uploadToCloudinary(fileBuffer, type = "auto", folder = "uploads") {
  return new Promise((resolve, reject) => {
    // Force resource_type for audio/video
    let resourceType = "auto";
    if (type === "video" || type === "audio") {
      resourceType = "video"; // ✅ Cloudinary treats both mp3 + mp4 as video
    } else if (type === "image") {
      resourceType = "image";
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder, // dynamic folder (intro_steps, receipts, etc.)
        transformation:
          resourceType === "image"
            ? [{ width: 1200, crop: "limit", quality: "auto" }] // ✅ resize/compress images for OCR
            : undefined,
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary upload failed:", error);
          return reject(error);
        }
        console.log("☁️ Cloudinary upload success:", result.secure_url);
        resolve(result.secure_url);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
}

export default uploadToCloudinary;
