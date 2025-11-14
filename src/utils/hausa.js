// src/utils/hausa.js
/**
 * Gentle Hausa normalizer and simple keyword extractor for matching help.
 */

export function normalizeHausa(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^\p{L}\p{N}\s']/gu, " ") // allow letters, numbers, apostrophe
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Very small keyword-based intent extractor.
 * Returns { intent: string|null, keywords: [] }
 */
export function extractIntent(text) {
  const t = normalizeHausa(text);
  const keywords = t.split(" ").filter(Boolean);
  // map of keywords -> intents
  const mapping = [
    { intents: ["isma", "insamin"], name: "general_help" },
    { intents: ["magani", "magunguna", "drug", "medicine"], name: "ask_medicine" },
    { intents: ["kankance", "kankancewa", "karami", "baya tashi"], name: "erectile_problem" },
    { intents: ["farashi", "kudi", "price", "nawa"], name: "pricing" },
    { intents: ["akwatin", "receipt", "takarda", "resi"], name: "receipt" },
    { intents: ["yanzu", "lokaci", "sauri"], name: "timing" },
    { intents: ["delivery", "kawo", "kai", "turo"], name: "delivery" },
  ];

  for (const m of mapping) {
    if (m.intents.some((k) => keywords.includes(k))) {
      return { intent: m.name, keywords: keywords.filter((w) => m.intents.includes(w)) };
    }
  }
  return { intent: null, keywords: [] };
}
