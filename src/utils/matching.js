import stringSimilarity from "string-similarity";

/**
 * Hausa & Nigerian slang normalization
 */
const replacements = [
  ["ina", "ni"],
  ["ne", ""],
  ["ko", ""],
  ["toh", ""],
  ["yaya", "iya"],
  ["magani", "magani"],
  ["ciwo", "ciwon"],
  ["infection", "sanyi"],
  ["toilet infection", "sanyi"],
  ["ciwon mara", "sanyi"],
  ["kankancewa", "karfinmaza"],
  ["karfin maza", "karfinmaza"],
  ["karfin namiji", "karfinmaza"],
  ["karfi na maza", "karfinmaza"],
  ["karfin gaba", "karfinmaza"],
  ["alaura", "karfinmaza"],
  ["gaba", "jiki"],
  ["azaba", "ciwo"],
  // Saurin inzali group
  ["saurin inzali", "saurininzali"],
  ["saurin kawowa", "saurininzali"],
  ["gaggawar fitar maniyyi", "saurininzali"],
  ["fitar maniyyi da wuri", "saurininzali"],
];

/**
 * Main meaning synonym groups
 */
const synonymGroups = [
  ["sanyi", "infection", "ciwon mara", "toilet infection"],
  ["karfinmaza", "alaura", "karfin maza", "karfi na maza", "karfin namiji", "karfin gaba"],
  ["saurininzali", "saurin inzali", "saurin kawowa", "gaggawar fitar maniyyi", "fitar maniyyi da wuri"],
  ["ciwon jiki", "jiki", "ciwo", "gajiya"],
];

function normalizeHausa(str) {
  let s = (str || "").toLowerCase().replace(/\s+/g, " ").trim();

  replacements.forEach(([a, b]) => {
    s = s.replace(new RegExp(`\\b${a}\\b`, "g"), b);
  });

  synonymGroups.forEach(group => {
    const root = group[0];
    group.forEach(word => {
      s = s.replace(new RegExp(`\\b${word}\\b`, "g"), root);
    });
  });

  return s;
}

function tokenScore(input, target) {
  const A = new Set(normalizeHausa(input).split(" "));
  const B = new Set(normalizeHausa(target).split(" "));
  if (!A.size || !B.size) return 0;
  let match = [...A].filter(t => B.has(t)).length;
  return match / Math.min(A.size, B.size);
}

export async function findBestMatch(QA, userMsg) {
  const input = normalizeHausa(userMsg);
  const qs = await QA.find({ $or: [{ type: { $exists: false } }, { type: { $ne: "intro" } }] }).lean();
  if (!qs.length) return null;

  const questions = qs.map(q => ({ ...q, norm: normalizeHausa(q.question || "") }));
  const texts = questions.map(q => q.norm);
  const sim = stringSimilarity.findBestMatch(input, texts).ratings;

  let scored = questions.map((q, i) => ({
    q,
    sim: sim[i].rating,
    token: tokenScore(input, q.norm)
  }));

  scored = scored.map(s => ({
    ...s,
    final: s.sim * 0.6 + s.token * 0.4
  })).sort((a, b) => b.final - a.final);

  const best = scored[0];

  // Strong match
  if (best.final >= 0.50) return best.q;

  // Good token match fallback
  if (best.token >= 0.5) return best.q;

  return null;
}
