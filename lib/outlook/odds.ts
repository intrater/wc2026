// Betting-odds parsing. The tier board stores championship odds as display strings in two
// formats — American ("+475", "-150") and fractional ("10-1", "2500-1"). Convert to an
// implied probability, and de-vig a set so they sum to 1 (removes the bookmaker overround).
export function impliedProb(odds: string | null | undefined): number | null {
  if (!odds) return null;
  const s = odds.trim();
  const american = /^([+-])(\d+)$/.exec(s);
  if (american) {
    const n = Number(american[2]);
    if (n === 0) return null;
    return american[1] === "-" ? n / (n + 100) : 100 / (n + 100);
  }
  const fractional = /^(\d+)\s*-\s*(\d+)$/.exec(s); // a-b = "a to b against"
  if (fractional) {
    const a = Number(fractional[1]);
    const b = Number(fractional[2]);
    return a + b > 0 ? b / (a + b) : null;
  }
  return null;
}

/** Normalize a set of implied probabilities to sum to 1 (de-vig). */
export function deVig(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0);
  return sum > 0 ? probs.map((p) => p / sum) : probs;
}
