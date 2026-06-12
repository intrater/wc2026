// Business-day + match-status helpers (U3). Pure module — no IO — shared by the
// calendar UI, the daily-standings snapshot, and the recap trigger so every surface
// agrees on "what day is this match" and "what state is this match in".
//
// Business day = the America/New_York calendar date of kickoff. A 10:30pm ET kickoff
// that ends after midnight still belongs to its ET start date.
import type { Match, MatchStage } from "@/lib/db/types";

// ---------- API-Football status buckets (verified against v3 docs) ----------
// Shared constants so ingest (U2) and the recap day-done predicate (U7) can never
// drift from the calendar's rendering.
// Note: HT lives in LIVE_STATUSES on purpose — "is something happening in this
// match right now" is true at halftime (entry-page Today highlight, live filters).
// cardStateFor() refines HT into its own render state below; that refinement is
// the ONLY place HT is treated specially.
export const UPCOMING_STATUSES = ["TBD", "NS"] as const;
export const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P"] as const;
/** Mid-match pauses expected to resume (keep last live score). */
export const PAUSED_STATUSES = ["SUSP", "INT"] as const;
/** Will not happen (as scheduled): clear live state, never score. */
export const NOT_OCCURRING_STATUSES = ["PST", "CANC", "ABD"] as const;
/** Mirror of TERMINAL_STATUSES in lib/db/types.ts (kept there for scoring imports). */
export const TERMINAL_STATUSES = ["FT", "AET", "PEN", "AWD", "WO"] as const;

const live = new Set<string>(LIVE_STATUSES);
const paused = new Set<string>(PAUSED_STATUSES);
const notOccurring = new Set<string>(NOT_OCCURRING_STATUSES);
const terminal = new Set<string>(TERMINAL_STATUSES);

export const isLive = (status: string) => live.has(status);
export const isPaused = (status: string) => paused.has(status);
export const isNotOccurring = (status: string) => notOccurring.has(status);
export const isTerminal = (status: string) => terminal.has(status);
/** Resolved for recap purposes: the match will produce no further changes today. */
export const isResolved = (status: string) => terminal.has(status) || notOccurring.has(status);

// ---------- business day (America/New_York) ----------
const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** ET calendar date (YYYY-MM-DD) for a kickoff timestamp. */
export function businessDayOf(kickoff: string | Date): string {
  const d = typeof kickoff === "string" ? new Date(kickoff) : kickoff;
  return ET_DAY.format(d); // en-CA yields YYYY-MM-DD
}

/** Today's ET calendar date (YYYY-MM-DD). */
export function todayBusinessDay(now: number = Date.now()): string {
  return ET_DAY.format(new Date(now));
}

/** Yesterday's ET calendar date relative to `now` (recap catch-up, digest send). */
export function yesterdayBusinessDay(now: number = Date.now()): string {
  return todayBusinessDay(now - 24 * 60 * 60 * 1000);
}

/** Human label per stage, shared by the calendar cards and the digest docket. */
export const STAGE_LABEL: Record<MatchStage, string> = {
  group: "Group Stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarterfinal",
  sf: "Semifinal",
  third_place: "3rd-place playoff",
  final: "Final",
};

// ---------- shared ET display formatters ----------
const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  month: "long",
  day: "numeric",
});
const KICKOFF_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

/** "Thursday, June 11" for an ET business day string (noon anchor avoids DST edges). */
export function formatBusinessDayLabel(day: string): string {
  return DAY_LABEL.format(new Date(`${day}T12:00:00-04:00`));
}

const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
const DAY_NUM = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" });
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short" });

/** Calendar-rail parts for an ET business day: e.g. { weekday: "MON", dayNum: "16", month: "JUN" }. */
export function formatDayParts(day: string): { weekday: string; dayNum: string; month: string } {
  const d = new Date(`${day}T12:00:00-04:00`); // noon anchor avoids DST edges
  return {
    weekday: WEEKDAY_SHORT.format(d).toUpperCase(),
    dayNum: DAY_NUM.format(d),
    month: MONTH_SHORT.format(d).toUpperCase(),
  };
}

/** ET clock time for a kickoff timestamp, e.g. "3:00 PM". */
export function formatKickoffTimeET(kickoff: string | Date): string {
  return KICKOFF_TIME.format(typeof kickoff === "string" ? new Date(kickoff) : kickoff);
}

/** Group matches by ET business day; days ascending, matches by kickoff within a day. */
export function groupByDay<M extends { kickoff: string | null }>(
  matches: M[],
): Array<{ day: string; matches: M[] }> {
  const byDay = new Map<string, M[]>();
  for (const m of matches) {
    if (!m.kickoff) continue; // TBD kickoff times can't be placed on a day
    const day = businessDayOf(m.kickoff);
    const list = byDay.get(day) ?? [];
    list.push(m);
    byDay.set(day, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      matches: list.sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "")),
    }));
}

// ---------- card state ----------
export type CardState =
  | { kind: "tbd" }
  | { kind: "upcoming" }
  | { kind: "live"; home: number; away: number; elapsed: number | null }
  | { kind: "halftime"; home: number; away: number }
  | { kind: "paused"; home: number | null; away: number | null }
  | { kind: "final"; home: number; away: number; decidedBy: Match["decided_by"] }
  | { kind: "postponed" }
  | { kind: "cancelled" }
  | { kind: "abandoned" };

type CardMatch = Pick<
  Match,
  | "status"
  | "home_team_id"
  | "away_team_id"
  | "home_goals"
  | "away_goals"
  | "live_home_goals"
  | "live_away_goals"
  | "ht_home_goals"
  | "ht_away_goals"
  | "live_elapsed"
  | "decided_by"
>;

/**
 * Render-time state machine for a match card. Unknown statuses fall back to
 * "upcoming" (safe default — never throws on a new API status string).
 */
export function cardStateFor(m: CardMatch): CardState {
  // Knockout slots published before the bracket resolves have no teams yet.
  if (m.home_team_id == null || m.away_team_id == null) return { kind: "tbd" };

  const s = m.status;
  if (isTerminal(s)) {
    return {
      kind: "final",
      home: m.home_goals ?? 0,
      away: m.away_goals ?? 0,
      decidedBy: m.decided_by,
    };
  }
  if (s === "HT") {
    return {
      kind: "halftime",
      home: m.ht_home_goals ?? m.live_home_goals ?? 0,
      away: m.ht_away_goals ?? m.live_away_goals ?? 0,
    };
  }
  if (isLive(s)) {
    return {
      kind: "live",
      home: m.live_home_goals ?? 0,
      away: m.live_away_goals ?? 0,
      elapsed: m.live_elapsed,
    };
  }
  if (isPaused(s)) {
    return { kind: "paused", home: m.live_home_goals, away: m.live_away_goals };
  }
  if (s === "PST") return { kind: "postponed" };
  if (s === "CANC") return { kind: "cancelled" };
  if (s === "ABD") return { kind: "abandoned" };
  return { kind: "upcoming" };
}
