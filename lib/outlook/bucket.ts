// Map a modeled win share to one of the four "alive" buckets, with cut-points expressed as
// multiples of a fair share (1/N) so they auto-scale with the field size and across the
// tournament. (no_shot is decided by the exact layer, not here.)
export type ModeledBucket = "front_runner" | "in_hunt" | "live" | "long_shot";

const FRONT_RUNNER = 2.5; // ≥ 2.5× fair share — the clear pack-leader(s)
const IN_HUNT = 1.2; // ≥ 1.2× fair share
const LIVE = 0.3; // ≥ 0.3× fair share

export function bucketForWinShare(winShare: number, fieldSize: number): ModeledBucket {
  const fair = fieldSize > 0 ? 1 / fieldSize : 0;
  if (winShare >= FRONT_RUNNER * fair) return "front_runner";
  if (winShare >= IN_HUNT * fair) return "in_hunt";
  if (winShare >= LIVE * fair) return "live";
  return "long_shot"; // alive (not exactly eliminated) but rarely wins, incl. 0 sampled wins
}
