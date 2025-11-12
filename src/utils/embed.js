import { pipeline } from "@xenova/transformers";

// ✅ Ensure we use ONNX CPU backend (safe on Windows)
process.env.TRANSFORMERS_BACKEND = "onnx";

// Load once (global cache)
let extractor = null;

export async function embedText(text) {
  if (!extractor) {
    extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { quantized: true }
    );
  }

  // Convert to vector (mean pooling)
  const output = await extractor(text, { pooling: "mean", normalize: true });

  // Convert typed array -> normal JS array
  return Array.from(output.data);
}
