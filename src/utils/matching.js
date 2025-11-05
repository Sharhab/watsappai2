import stringSimilarity from "string-similarity";
import { HAUSA_KEYWORDS } from "./hausaKeywords.js";

function normalizeText(s) {
  return (s || "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function expandWithSynonyms(input) {
  const words = normalizeText(input).split(" ");
  let boosted = input;

  for (const mainKey in HAUSA_KEYWORDS) {
    const variants = HAUSA_KEYWORDS[mainKey];
    for (const v of variants) {
      if (input.includes(v)) boosted += " " + mainKey;
    }
  }
  return boosted;
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
  let input = normalizeText(userMsg || "");
  input = expandWithSynonyms(input); // ✅ extra intelligence added

  const questions = await QA.find({
    $or: [
      { type: { $exists: false } },
      { type: { $ne: "intro" } }
    ]
  }).lean();

  if (!questions.length) return null;

  const normalizedQuestions = questions.map(q => normalizeText(q?.question || ""));
  const ratings = stringSimilarity.findBestMatch(input, normalizedQuestions).ratings;

  const scored = ratings.map((r, idx) => ({
    idx,
    question: questions[idx]?.question,
    score: r.rating,
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];

  // ✅ If strong match
  if (best && best.score >= 0.45) return questions[best.idx];

  // ✅ Try token overlap (catch Hausa slang)
  let bestOverlap = { idx: -1, score: 0 };
  normalizedQuestions.forEach((q, idx) => {
    const score = tokenOverlapScore(input, q);
    if (score > bestOverlap.score) bestOverlap = { idx, score };
  });

  if (bestOverlap.idx >= 0 && bestOverlap.score >= 0.35) return questions[bestOverlap.idx];

  return null;
}
