// src/utils/matching.js

/**
 * Gentle normalization — keeps core Hausa words intact.
 */
export function normalizeText(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // remove punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Basic string similarity using normalized Levenshtein ratio.
 * This works well for Hausa short text and voice STT outputs.
 */
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  a = normalizeText(a);
  b = normalizeText(b);
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = dp[m][n];
  const maxLen = Math.max(m, n);
  return 1 - distance / maxLen; // normalize 0–1
}

/**
 * Main QA matching logic (no embeddings)
 */
export async function findBestMatch(QACollection, userText) {
  const query = normalizeText(userText || "");
  if (!query) return null;

  console.log("🔎 Searching QA match for:", query);

  const qas = await QACollection.find({}).lean();
  if (!qas || qas.length === 0) {
    console.warn("⚠️ No QA data found in DB");
    return null;
  }

  const scored = qas.map((qa) => ({
    qa,
    score: stringSimilarity(query, qa.question || ""),
  }));

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const bestScore = best?.score ?? 0;
  const MIN_SCORE = Number(process.env.QA_MIN_SIMILARITY || 0.45); // can tune this

  console.log("🔎 Top 3 candidates:");
  scored.slice(0, 3).forEach((s, i) => {
    console.log(
      `   ${i + 1}. [${s.score.toFixed(3)}] ${String(s.qa.question).slice(0, 100)}`
    );
  });

  console.log(`🎯 Best score: ${bestScore.toFixed(3)} (threshold=${MIN_SCORE})`);

  if (bestScore >= MIN_SCORE) {
    console.log("✅ Matched QA:", best.qa.question);
    return best.qa;
  }

  console.log("❌ No strong match found — using text fallback...");
  return textFallback(QACollection, query);
}

/**
 * Text fallback: simple substring & keyword check.
 */
async function textFallback(QACollection, normalizedQuery) {
  const qas = await QACollection.find({}).lean();

  for (const qa of qas) {
    const normQ = normalizeText(qa.question || "");
    if (
      normQ.includes(normalizedQuery) ||
      normalizedQuery.includes(normQ) ||
      normalizedQuery.startsWith(normQ.split(" ")[0])
    ) {
      console.log("✅ textFallback matched:", qa.question);
      return qa;
    }
  }

  console.log("🚫 No text fallback match found.");
  return null;
}
