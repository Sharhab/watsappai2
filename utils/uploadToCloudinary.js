import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

// ✅ Cloudinary config (from .env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(file, type = "auto") {
  return new Promise((resolve, reject) => {
    let resourceType;

    // Decide Cloudinary resource_type
    if (type === "video") {
      resourceType = "video";
    } else if (type === "audio") {
      resourceType = "video"; // ✅ audio is treated under "video" in Cloudinary
    } else {
      resourceType = "auto";
    }

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

    if (Buffer.isBuffer(file)) {
      // memoryStorage file (Multer)
      streamifier.createReadStream(file).pipe(uploadStream);
    } else {
      // diskStorage file
      import("fs").then(fs => {
        fs.createReadStream(file).pipe(uploadStream);
      });
    }
  });
}

export default uploadToCloudinary;
