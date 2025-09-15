import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload file to Cloudinary (supports memoryStorage buffers)
 * @param {Buffer} buffer - File buffer from multer
 * @param {string} resourceType - "video" | "audio" | "auto"
 */
async function uploadToCloudinary(buffer, resourceType = "auto") {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, folder: "intro_steps" },
      (err, result) => {
        if (err) {
          console.error("❌ Cloudinary upload failed:", err);
          return reject(err);
        }
        resolve(result.secure_url);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

export default uploadToCloudinary;
