import { embedText } from "./embed.js";

/**
 * Strong Hausa text normalization
 */
export function normalizeText(text) {
  if (!text) return "";

  return text
    .toLowerCase()
    // Remove Hausa & Arabic greetings and fillers
    .replace(
      /\b(ass?alamu|alaikum|warah?mat(ullahi)?|barka|dai|sannu|yaya|ina\s+kwana|lafiya|hello|hi|salamu|salam|ne|fa|to|eh|kai|wai)\b/g,
      ""
    )
    // Remove accents / diacritics
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Remove punctuation and multiple spaces
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cosine similarity
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
 * Smart semantic search + debug log
 */
export async function findBestMatch(QACollection, userText) {
  const query = normalizeText(userText);
  if (!query) return null;

  const queryEmbedding = await embedText(query);
  const qas = await QACollection.find({ embedding: { $exists: true, $ne: [] } });

  const scored = [];

  for (const qa of qas) {
    const score = cosineSim(queryEmbedding, qa.embedding);
    scored.push({ qa, score });
  }

  // Sort by descending similarity
  scored.sort((a, b) => b.score - a.score);

  const top3 = scored.slice(0, 3);
  const best = top3[0] || null;
  const bestScore = best?.score || 0;

  // 🔥 Only accept strong matches
  const MIN_SCORE = 0.48;

  // 🧠 Debug info
  console.log("🔎 Similarity ranking:");
  top3.forEach((item, i) => {
    console.log(
      `   ${i + 1}. ${item.qa.question.slice(0, 80)}... [score=${item.score.toFixed(3)}]`
    );
  });
  console.log(`🎯 Best score: ${bestScore.toFixed(3)} (${bestScore >= MIN_SCORE ? "MATCH ✅" : "NO MATCH ❌"})`);

  return bestScore >= MIN_SCORE ? best.qa : null;
}
