// /src/utils/semanticEmbedder.js
process.env.TRANSFORMERS_BACKEND = "wasm";

import { pipeline } from "@xenova/transformers";
import cosineSimilarity from "compute-cosine-similarity";

let embedder;

export async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

export async function embedText(text) {
  const extractor = await getEmbedder();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return output.data;
}

export function similarity(vecA, vecB) {
  return cosineSimilarity(vecA, vecB);
}
