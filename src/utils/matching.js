import stringSimilarity from "string-similarity";
import { HAUSA_KEYWORDS } from "./hausaKeywords.js";

/** Normalize Hausa/English text */
function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Boost input with controlled synonyms (no over-boost) */
function expandWithSynonyms(inputRaw) {
  const input = normalizeText(inputRaw);
  const tokens = new Set(input.split(" ").filter(Boolean));
  const boosts = [];

  for (const mainKey in HAUSA_KEYWORDS) {
    const variants = HAUSA_KEYWORDS[mainKey] || [];
    const hit = variants.some(v => tokens.has(normalizeText(v)));
    if (hit) boosts.push(mainKey);
  }

  // only small boost to avoid swamping
  return boosts.length ? `${input} ${boosts.join(" ")}` : input;
}

/** Simple token Jaccard over min set size */
function tokenOverlapScore(a, b) {
  const A = new Set(normalizeText(a).split(" ").filter(Boolean));
  const B = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

/** Optional: short message guard so 1–2 word inputs don't match huge Qs */
function isTooShortForFuzzy(s) {
  const len = normalizeText(s).split(" ").filter(Boolean).length;
  return len <= 2; // e.g., "magani", "ina magani"
}

/**
 * findBestMatch
 * - uses string-similarity + token overlap
 * - requires stronger thresholds
 * - logs scoring details (top 5)
 */
export async function findBestMatch(QA, userMsg) {
  const raw = userMsg || "";
  let input = expandWithSynonyms(raw);

  // Pull non-intro QA only
  const questions = await QA.find({
    $or: [{ type: { $exists: false } }, { type: { $ne: "intro" } }],
  }).lean();

  if (!questions.length) return null;

  const normalizedQuestions = questions.map(q => normalizeText(q?.question || ""));
  const inputNorm = normalizeText(input);

  // string-similarity
  const sim = stringSimilarity.findBestMatch(inputNorm, normalizedQuestions);
  const ratings = sim.ratings || [];

  // token-overlap pass
  const overlapScores = normalizedQuestions.map(q => tokenOverlapScore(inputNorm, q));

  // Merge & sort (desc)
  const scored = ratings.map((r, idx) => ({
    idx,
    question: questions[idx]?.question || "",
    sim: Number(r.rating || 0),
    overlap: Number(overlapScores[idx] || 0),
    combo: Number((r.rating || 0) * 0.7 + (overlapScores[idx] || 0) * 0.3),
  }))
  .sort((a, b) => b.combo - a.combo);

  // DEBUG: show top-5
  const top5 = scored.slice(0, 5).map(s => ({
    qPreview: (s.question || "").slice(0, 80),
    sim: Number(s.sim.toFixed(3)),
    overlap: Number(s.overlap.toFixed(3)),
    combo: Number(s.combo.toFixed(3)),
  }));
  console.log("🔎 MATCH DEBUG:", {
    input: raw,
    expanded: input,
    top5,
  });

  // Thresholds
  const STRONG_SIM = 0.55;
  const MIN_OVERLAP = 0.30;
  const MIN_COMBO = 0.50;

  // If input is super short, require overlap signal to avoid random long Q matches
  if (isTooShortForFuzzy(raw)) {
    const best = scored.find(s => s.overlap >= MIN_OVERLAP);
    return best ? questions[best.idx] : null;
  }

  // General rule: require both combo and at least one of (sim or overlap) strong
  const best = scored.find(s =>
    s.combo >= MIN_COMBO &&
    (s.sim >= STRONG_SIM || s.overlap >= MIN_OVERLAP)
  );

  return best ? questions[best.idx] : null;
}

export { normalizeText, tokenOverlapScore, expandWithSynonyms };
