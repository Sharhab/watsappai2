import { normalizeHausa } from "./normalizeHausa.js";
import computeCosineSimilarity from "compute-cosine-similarity";

export async function findBestMatch(QA, incoming) {
  incoming = normalizeHausa(incoming);

  const all = await QA.find({ embedding: { $exists: true } }).lean();
  if (!all.length) return null;

  let best = null;
  let bestScore = 0;

  for (const qa of all) {
    if (!qa.embedding) continue;

    const score = computeCosineSimilarity(qa.embedding, incoming.embedding || qa.embedding);
    if (score > bestScore) {
      bestScore = score;
      best = qa;
    }
  }

  // ✅ Confidence threshold
  if (bestScore < 0.42) return null; // prevents wrong answers

  return best;
}
