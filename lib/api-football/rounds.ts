import type { MatchStage } from "@/lib/db/types";

/**
 * Map an API-Football `league.round` string to our stage enum.
 * Returns null for an unrecognized round → caller flags needs_attention and does NOT score it.
 * Order matters: "Final" is a substring of several rounds, so check specific rounds first.
 */
export function mapRound(raw: string | null | undefined): MatchStage | null {
  if (!raw) return null;
  const r = raw.toLowerCase();

  if (r.includes("group")) return "group";
  if (r.includes("round of 32") || r.includes("1/16")) return "r32";
  if (r.includes("round of 16") || r.includes("1/8")) return "r16";
  if (r.includes("quarter")) return "qf";
  if (r.includes("semi")) return "sf";
  if (r.includes("3rd place") || r.includes("third place") || r.includes("play-off for third")) return "third_place";
  if (r.includes("final")) return "final"; // after qf/sf/3rd checks
  return null;
}
