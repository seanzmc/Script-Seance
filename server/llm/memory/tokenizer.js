/**
 * Lightweight heuristic token estimator.
 * Over-estimates slightly for safer budget trimming.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

export function estimateTokensForMessages(messages) {
  let total = 0;
  for (const msg of messages) {
    total += 4 + estimateTokens(msg.content);
  }
  return total;
}
