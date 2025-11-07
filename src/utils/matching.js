// /src/utils/matching.js
import stringSimilarity from "string-similarity";

export function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapScore(a, b) {
  const A = new Set(normalizeText(a).split(" ").filter(Boolean));
  const B = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;

  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;

  return inter / Math.min(A.size, B.size);
}

export async function findBestMatch(QA, userMsg) {
  const input = normalizeText(userMsg || "");
  if (!input) return null;

  const questions = await QA.find({
    $or: [
      { type: { $exists: false } },
      { type: { $ne: "intro" } }
    ]
  }).lean();

  if (!questions.length) return null;

  const normalizedQuestions = questions.map(q =>
    normalizeText(q?.question || "")
  );

  // string similarity scoring
  const ratings = stringSimilarity.findBestMatch(input, normalizedQuestions).ratings;
  const scored = ratings
    .map((r, idx) => ({ idx, score: r.rating }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  // ✅ relaxed threshold for Hausa conversational style
  if (best && best.score >= 0.25) return questions[best.idx];

  // token overlap (backup)
  let bestOverlap = { idx: -1, score: 0 };
  normalizedQuestions.forEach((q, idx) => {
    const score = tokenOverlapScore(input, q);
    if (score > bestOverlap.score) bestOverlap = { idx, score };
  });

  if (bestOverlap.idx >= 0 && bestOverlap.score >= 0.20)
    return questions[bestOverlap.idx];

  return null;
}
