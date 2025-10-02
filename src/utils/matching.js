import stringSimilarity from "string-similarity";

function normalizeText(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
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
  const questions = await QA.find({ $or: [{ type: { $exists: false } }, { type: { $ne: "intro" } }] }).lean();
  if (!questions.length) return null;

  const texts = questions.map(q => q?.question || "").filter(Boolean);
  const ratings = stringSimilarity.findBestMatch(input, texts.map(normalizeText)).ratings;

  const scored = ratings.map((r, idx) => ({ idx, question: questions[idx]?.question, score: r.rating }))
                        .sort((a,b) => b.score - a.score);

  const best = scored[0];
  if (best && best.score >= 0.5) return questions[best.idx];

  let bestOverlap = { idx: -1, score: 0 };
  texts.forEach((q, idx) => {
    const s = tokenOverlapScore(input, q);
    if (s > bestOverlap.score) bestOverlap = { idx, score: s };
  });
  if (bestOverlap.idx >= 0 && bestOverlap.score >= 0.5) return questions[bestOverlap.idx];
  return null;
}
