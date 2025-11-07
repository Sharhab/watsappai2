
// /src/utils/matching.js
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

  // Fetch only real QA entries
  let questions = await QA.find({
    $or: [
      { type: { $exists: false } },
      { type: { $ne: "intro" } }
    ]
  }).lean();

  if (!questions.length) return null;

  // ✅ Remove any entry missing question text
  questions = questions.filter(q => q && q.question && normalizeText(q.question).length > 0);

  if (!questions.length) return null;

  // ✅ Build TF-IDF
  const tfidf = new natural.TfIdf();
  const normalizedQuestions = questions.map(q => normalizeText(q.question));

  normalizedQuestions.forEach(qText => {
    if (qText && qText.length > 0) {
      tfidf.addDocument(qText);
    }
  });

  let best = { index: -1, score: 0 };

  tfidf.tfidf(input, (i, score) => {
    if (score > best.score) best = { index: i, score };
  });

  if (best.index < 0) return null;
  const match = questions[best.index];

  // ✅ Strict threshold — prevents wrong matches
  if (best.score < 0.17) {
    console.log("❌ No confident match. Score:", best.score.toFixed(3));
    return null;
  }

  console.log("🎯 MATCH FOUND (TF-IDF):", {
    question: match.question.slice(0, 100),
    score: best.score.toFixed(3)
  });

  return match;
}
