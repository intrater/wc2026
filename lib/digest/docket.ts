// Today's slate ("the docket") — pure mapping from match rows to display items,
// shared by the /digest page and the morning email so both always agree. Built
// fresh at render/send time (never from stored stats) so overnight postponements
// and reschedules are reflected.
import type { Match, MatchStage } from "@/lib/db/types";
import { STAGE_LABEL, businessDayOf, formatKickoffTimeET, isLive } from "@/lib/matches/day";

export type DocketMatchRow = Pick<
  Match,
  | "fixture_id"
  | "stage"
  | "group_label"
  | "kickoff"
  | "status"
  | "home_team_id"
  | "away_team_id"
  | "live_home_goals"
  | "live_away_goals"
>;

export interface DocketItem {
  fixtureId: number;
  kickoffET: string; // "12:00 PM"
  contextLabel: string; // "Group A" | "Round of 32" | ...
  home: { name: string; flag: string } | null; // null = TBD knockout slot
  away: { name: string; flag: string } | null;
  live: { home: number; away: number } | null; // populated while the match is live
}

function contextLabelFor(stage: MatchStage | null, groupLabel: string | null): string {
  if (stage === "group" && groupLabel) return `Group ${groupLabel}`;
  return stage ? STAGE_LABEL[stage] : "Match";
}

/** The given ET day's fixtures, kickoff-sorted, mapped for display. */
export function buildDocket(
  matches: DocketMatchRow[],
  teams: Map<number, { name: string; flag: string }>,
  day: string,
): DocketItem[] {
  return matches
    .filter((m) => m.kickoff && businessDayOf(m.kickoff) === day)
    .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""))
    .map((m) => {
      const home = m.home_team_id != null ? teams.get(m.home_team_id) : undefined;
      const away = m.away_team_id != null ? teams.get(m.away_team_id) : undefined;
      return {
        fixtureId: m.fixture_id,
        kickoffET: formatKickoffTimeET(m.kickoff!),
        contextLabel: contextLabelFor(m.stage, m.group_label),
        home: home ? { name: home.name, flag: home.flag } : null,
        away: away ? { name: away.name, flag: away.flag } : null,
        live: isLive(m.status)
          ? { home: m.live_home_goals ?? 0, away: m.live_away_goals ?? 0 }
          : null,
      };
    });
}

/** Plain-text docket lines for the email body. */
export function docketTextLines(items: DocketItem[]): string[] {
  return items.map((i) => {
    const home = i.home ? `${i.home.flag} ${i.home.name}` : "TBD";
    const away = i.away ? `${i.away.name} ${i.away.flag}` : "TBD";
    const live = i.live ? ` (LIVE ${i.live.home}–${i.live.away})` : "";
    return `${i.kickoffET} ET: ${home} vs ${away} (${i.contextLabel})${live}`;
  });
}
