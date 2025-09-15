import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

// ✅ configure from env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(fileBuffer, type = "auto") {
  return new Promise((resolve, reject) => {
    // force resource_type for audio/video
    let resourceType = "auto";
    if (type === "video" || type === "audio") {
      resourceType = "video"; // ✅ mp3 + mp4 both handled as video
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder: "intro_steps",
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary upload failed:", error);
          return reject(error);
        }
        resolve(result.secure_url);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
}

export default uploadToCloudinary;
