import natural from "natural";

export function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function findBestMatch(QA, userMsg) {
  const input = normalizeText(userMsg || "");

  const questions = await QA.find({
    $or: [
      { type: { $exists: false } },
      { type: { $ne: "intro" } }
    ]
  }).lean();

  if (!questions.length) return null;

  // Build TF-IDF model
  const tfidf = new natural.TfIdf();
  questions.forEach(q => tfidf.addDocument(normalizeText(q.question || "")));

  let best = { index: -1, score: 0 };

  tfidf.tfidf(input, (i, score) => {
    if (score > best.score) best = { index: i, score };
  });

  const match = best.index >= 0 ? questions[best.index] : null;

  // Strict threshold — VERY IMPORTANT
  if (!match || best.score < 0.18) {
    console.log("❌ No strong match:", { score: best.score.toFixed(3) });
    return null;
  }

  console.log("🎯 MATCH FOUND (TF-IDF):", {
    question: match.question.slice(0, 120),
    score: best.score.toFixed(3),
  });

  return match;
}
