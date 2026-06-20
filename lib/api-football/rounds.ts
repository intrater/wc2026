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

/**
 * Extract a real group letter from an API-Football standings `group` string.
 *
 * Real group blocks are named "Group A" … "Group L". The cross-group "Ranking of
 * third-placed teams" block is named "Group Stage", which ALSO starts with "Group " —
 * so a loose `/^Group /` test wrongly accepts it and clobbers whichever teams are
 * currently 3rd with the bogus label "Stage". We accept ONLY a single-letter group;
 * anything else (incl. "Group Stage") returns null so the caller leaves the label alone.
 */
export function parseGroupLabel(group: string | null | undefined): string | null {
  if (!group) return null;
  const m = /^Group\s+([A-Z])$/i.exec(group.trim());
  return m ? m[1].toUpperCase() : null;
}
