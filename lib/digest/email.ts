// Morning digest email composer — pure functions over RecapStats + a fresh docket.
// Plain text, matching the existing transactional emails. The deterministic
// sections (numbers, movers, top of pool) always render, so the rank-jump story
// reaches the inbox even when the narrative is null or misses it.
import type { RecapStats } from "@/lib/db/types";
import { docketTextLines, type DocketItem } from "./docket";

/** One-line teaser; shared by the email subject and the /digest day cards. */
export function hookFor(stats: RecapStats): string {
  if (stats.upsets.length > 0) {
    const u = stats.upsets[0];
    return `${u.teamName} shocker (+${u.points})`;
  }
  if (stats.topGainer) return `${stats.topGainer} had a day`;
  if (stats.topThree.length > 0) return `${stats.topThree[0]} leads the pool`;
  return "Full results inside";
}

export function digestSubject(stats: RecapStats): string {
  const leader = stats.topThree[0];
  // Subject hook skips the point detail (that lives in the body) — e.g.
  // "WC2026 Day 1 digest: South Korea shocker & Josh Bortnick in 1st place".
  const hook =
    stats.upsets.length > 0
      ? `${stats.upsets[0].teamName} shocker`
      : stats.topGainer
        ? `${stats.topGainer} had a day`
        : "full results inside";
  // Skip the leader clause when the hook already names them.
  const tail = leader && !hook.includes(leader) ? ` & ${leader} in 1st place` : "";
  return `WC2026 Day ${stats.dayNumber} digest: ${hook}${tail}`;
}

/** "1st", "2nd", "3rd", "11th", "21st"… */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function resultLine(r: RecapStats["results"][number]): string {
  const home = r.home ? `${r.home.flag} ${r.home.name}` : "TBD";
  const away = r.away ? `${r.away.name} ${r.away.flag}` : "TBD";
  if (r.postponed) return `${home} vs ${away} (postponed)`;
  const suffix = r.decidedBy === "penalties" ? " (pens)" : r.decidedBy === "extra_time" ? " (aet)" : "";
  return `${home} ${r.home?.goals ?? 0}–${r.away?.goals ?? 0} ${away}${suffix}`;
}

function moverLine(e: RecapStats["entries"][number]): string {
  const base = `${e.displayName} +${e.pointsToday}`;
  if (e.rankDelta == null || e.rankDelta === 0) return base;
  const prevRank = e.rank + e.rankDelta;
  return `${base} (${ordinal(prevRank)} → ${ordinal(e.rank)})`;
}

export interface DigestTextInput {
  stats: RecapStats;
  narrative: string | null;
  dayLabel: string; // formatBusinessDayLabel(recapped day), e.g. "Friday, June 12"
  todayLabel: string; // formatBusinessDayLabel(today)
  docket: DocketItem[];
  unsubscribeUrl: string; // per-recipient
}

export function buildDigestText(input: DigestTextInput): string {
  const { stats, narrative, dayLabel, todayLabel, docket, unsubscribeUrl } = input;
  const sections: string[] = [];

  sections.push(`Day ${stats.dayNumber} digest\n${dayLabel}`);

  sections.push(
    narrative ?? "The robot pundit was speechless last night. Here's the box score.",
  );

  if (stats.results.length > 0) {
    sections.push(["THE NUMBERS", ...stats.results.map(resultLine)].join("\n"));
  }

  const movers = stats.entries
    .filter((e) => e.pointsToday != null && e.pointsToday > 0)
    .slice(0, 5);
  if (movers.length > 0) {
    sections.push(["MOVERS", ...movers.map(moverLine)].join("\n"));
  }

  if (stats.upsets.length > 0) {
    sections.push(["UPSETS", ...stats.upsets.map((u) => `${u.teamName}: ${u.label}`)].join("\n"));
  }

  if (stats.topThree.length > 0) {
    sections.push(
      `TOP OF THE POOL\n${stats.topThree.map((n, i) => `${i + 1}. ${n}`).join("  ·  ")}`,
    );
  }

  sections.push(
    docket.length > 0
      ? [`TODAY'S DOCKET: ${todayLabel}`, ...docketTextLines(docket)].join("\n")
      : `TODAY'S DOCKET: ${todayLabel}\nNo matches today. Rest day. ⚽️`,
  );

  sections.push(
    `You get this because you signed up for daily digests.\nUnsubscribe: ${unsubscribeUrl}`,
  );

  return sections.join("\n\n");
}
