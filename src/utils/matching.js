// ✅ If strong match
if (best && best.score >= 0.45) {
  console.log("🔍 MATCH (string-sim):", {
    user: input,
    matchedQuestion: questions[best.idx]?.question,
    score: best.score
  });
  return questions[best.idx];
}

// ✅ Try token overlap (catch Hausa slang)
let bestOverlap = { idx: -1, score: 0 };
normalizedQuestions.forEach((q, idx) => {
  const score = tokenOverlapScore(input, q);
  if (score > bestOverlap.score) bestOverlap = { idx, score };
});

if (bestOverlap.idx >= 0 && bestOverlap.score >= 0.35) {
  console.log("🔍 MATCH (token-overlap):", {
    user: input,
    matchedQuestion: questions[bestOverlap.idx]?.question,
    score: bestOverlap.score
  });
  return questions[bestOverlap.idx];
}

console.log("❌ NO MATCH FOUND FOR:", input);
return null;
