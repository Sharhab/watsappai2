import stringSimilarity from "string-similarity";

const slangMap = {
  "wlhi": "wallahi",
  "wlh": "wallahi",
  "plz": "don Allah",
  "pls": "don Allah",
  "pls.": "don Allah",
  "abeg": "don Allah",
  "haba": "",
  "toh": "",
  "to": "",
  "ehm": "",
  "kai": "",
  "dan Allah": "don Allah"
};

export function normalizeText(s) {
  if (!s) return "";

  let text = s.toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // apply slang normalization
  Object.keys(slangMap).forEach(key => {
    const regex = new RegExp(`\\b${key}\\b`, "g");
    text = text.replace(regex, slangMap[key]);
  });

  // remove repeated vowels "yaaaa" → "ya"
  text = text.replace(/([aeiou])\1+/g, "$1");

  return text;
}

function tokenOverlapScore(a, b) {
  const A = new Set(normalizeText(a).split(" ").filter(Boolean));
  const B = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;

  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;

  return inter / Math.min(A.size, B.size);
}

// ✅ NEW: Hausa keyword groups
const keywordGroups = [
  ["farashi", "kudin", "kudin magani", "rage", "sayi"], // price
  ["inganci", "tabbaci", "amfani", "aiki"], // effectiveness
  ["side effect", "illa", "lafiya", "amintacce"], // safety
  ["yadda ake", "yaya ake", "take amfani"], // usage
  ["kawo", "delivery", "isowa", "zuwa"], // delivery
];

function keywordWeight(input, question) {
  let score = 0;
  for (const group of keywordGroups) {
    if (group.some(word => input.includes(word) && question.includes(word))) {
      score += 0.15; // keyword match adds boost
    }
  }
  return score;
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

  const normalizedQuestions = questions.map(q => normalizeText(q?.question || ""));

  // string similarity scoring
  const ratings = stringSimilarity.findBestMatch(input, normalizedQuestions).ratings;
  let scored = ratings.map((r, idx) => {
    return {
      idx,
      score: r.rating + keywordWeight(input, normalizedQuestions[idx]) // ✅ include keyword boost
    };
  });

  scored.sort((a, b) => b.score - a.score);
  let best = scored[0];

  // ✅ Relaxed threshold
  if (best && best.score >= 0.22) return questions[best.idx];

  // token overlap fallback
  let bestOverlap = { idx: -1, score: 0 };
  normalizedQuestions.forEach((q, idx) => {
    const score = tokenOverlapScore(input, q);
    if (score > bestOverlap.score) bestOverlap = { idx, score };
  });

  if (bestOverlap.idx >= 0 && bestOverlap.score >= 0.18)
    return questions[bestOverlap.idx];

  return null;
}
