// Plain-English "why this rating" sentence, generated from the same computed numbers as the
// badge (deterministic — no re-simulation). Honest by construction: coarse chance, never a decimal.
export const BUCKET_LABEL: Record<string, string> = {
  front_runner: "Front-runner",
  in_hunt: "In the hunt",
  live: "Live",
  long_shot: "Long shot",
  no_shot: "No shot",
};

export const BUCKET_EMOJI: Record<string, string> = {
  front_runner: "🔥",
  in_hunt: "💪",
  live: "🎲",
  long_shot: "🌱",
  no_shot: "💀",
};

/** "about even" / "~1 in 6" / "almost none" — deliberately coarse, never a false-precise %. */
export function coarseChance(winShare: number | null): string {
  if (winShare == null || winShare <= 0) return "almost no";
  if (winShare >= 0.5) return "about an even";
  return `roughly a 1 in ${Math.round(1 / winShare)}`;
}

export interface RationaleParts {
  bucket: string;
  clinched: boolean;
  winShare: number | null;
  aliveCount: number;
  strongestAlive: { name: string; flag: string } | null;
  gapToLeader: number; // current leader total minus this entry's total (0 = at the top)
  coLeaders: number; // how many entries share the top total (1 = sole leader)
}

export function buildRationale(p: RationaleParts): string {
  if (p.clinched) return "Mathematically clinched — first place is locked up. 🔒";
  if (p.bucket === "no_shot") {
    return "Out of it — even a perfect run from here can't catch the leader's banked points.";
  }

  const chance = `${coarseChance(p.winShare)} chance to win it all`;
  const alive =
    p.aliveCount > 0
      ? `${p.aliveCount} of your 12 teams still alive${p.strongestAlive ? `, led by ${p.strongestAlive.flag} ${p.strongestAlive.name}` : ""}`
      : "none of your teams are still alive";
  const gap =
    p.gapToLeader > 0
      ? `you trail the lead by ${p.gapToLeader}`
      : p.coLeaders > 1
        ? "you're tied for the lead"
        : "you're out front";

  return `${capitalize(chance)}. ${capitalize(alive)}, and ${gap}.`;
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
