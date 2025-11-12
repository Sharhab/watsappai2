import { embedText } from "./embed.js";

/**
 * Normalize Hausa text strongly
 */
export function normalizeText(text) {
  if (!text) return "";

  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cosine similarity between two vectors
 */
function cosineSim(A, B) {
  if (!A || !B || A.length !== B.length) return 0;
  let dot = 0,
    a = 0,
    b = 0;
  for (let i = 0; i < A.length; i++) {
    dot += A[i] * B[i];
    a += A[i] * A[i];
    b += B[i] * B[i];
  }
  return dot / (Math.sqrt(a) * Math.sqrt(b));
}

/**
 * Smart Semantic Search
 */
export async function findBestMatch(QACollection, userText) {
  const query = normalizeText(userText);
  if (!query) return null;

  const queryEmbedding = await embedText(query);
  const qas = await QACollection.find({ embedding: { $exists: true, $ne: [] } });

  let best = null;
  let bestScore = 0;

  for (const qa of qas) {
    const score = cosineSim(queryEmbedding, qa.embedding);
    if (score > bestScore) {
      bestScore = score;
      best = qa;
    }
  }

  // 🔥 Only return match if similarity is strong enough
  const MIN_SCORE = 0.52; // adjust if needed

  return bestScore >= MIN_SCORE ? best : null;
}
