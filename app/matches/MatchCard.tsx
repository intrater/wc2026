import Link from "next/link";
import type { Match } from "@/lib/db/types";
import type { TeamInfo } from "@/lib/views/data";
import { STAGE_LABEL, cardStateFor, formatKickoffTimeET, type CardState } from "@/lib/matches/day";

export type CalendarMatch = Pick<
  Match,
  | "fixture_id"
  | "stage"
  | "group_label"
  | "kickoff"
  | "status"
  | "home_goals"
  | "away_goals"
  | "home_team_id"
  | "away_team_id"
  | "live_home_goals"
  | "live_away_goals"
  | "ht_home_goals"
  | "ht_away_goals"
  | "live_elapsed"
  | "decided_by"
  | "venue_name"
  | "venue_city"
  | "updated_at"
>;

export interface ViewerPoints {
  teamId: number;
  points: number;
  label: string;
}

/** 2× the poll interval: beyond this a "live" score may be stale. */
const STALE_MS = 6 * 60 * 1000;

function StatusBadge({ state, updatedAt }: { state: CardState; updatedAt: string }) {
  const base = "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide";
  switch (state.kind) {
    case "live": {
      const stale = Date.now() - new Date(updatedAt).getTime() > STALE_MS;
      return (
        <span className="flex items-center gap-1.5">
          <span className={`${base} ${stale ? "bg-muted text-muted-foreground" : "bg-neon/15 text-neon"}`}>
            ● Live{state.elapsed != null && ` · ${state.elapsed}′`}
          </span>
          <span className={`text-[10px] ${stale ? "text-destructive" : "text-muted-foreground"}`}>
            updated {formatKickoffTimeET(updatedAt)}
          </span>
        </span>
      );
    }
    case "halftime":
      return <span className={`${base} bg-neon/15 text-neon`}>Halftime</span>;
    case "paused":
      return <span className={`${base} bg-muted text-muted-foreground`}>Paused</span>;
    case "final":
      return (
        <span className={`${base} bg-muted text-muted-foreground`}>
          Final{state.decidedBy === "extra_time" ? " · AET" : state.decidedBy === "penalties" ? " · Pens" : ""}
        </span>
      );
    case "postponed":
      return <span className={`${base} bg-muted text-muted-foreground`}>Postponed</span>;
    case "cancelled":
      return <span className={`${base} bg-muted text-muted-foreground`}>Cancelled</span>;
    case "abandoned":
      return <span className={`${base} bg-muted text-muted-foreground`}>Abandoned</span>;
    default:
      return null;
  }
}

/** The center cell between the two teams: a "VS" disc before kickoff, the score once
 * the match is live or done. Kickoff time lives in the card's top-left corner instead. */
function CenterCell({ state }: { state: CardState }) {
  switch (state.kind) {
    case "live":
    case "halftime":
      return (
        <span className="text-lg font-extrabold tabular-nums text-neon">
          {state.home}–{state.away}
        </span>
      );
    case "paused":
      return (
        <span className="text-lg font-extrabold tabular-nums text-muted-foreground">
          {state.home ?? "–"}–{state.away ?? "–"}
        </span>
      );
    case "final":
      return (
        <span className="text-lg font-extrabold tabular-nums">
          {state.home}–{state.away}
        </span>
      );
    case "postponed":
    case "cancelled":
    case "abandoned":
      return <span className="text-xs text-muted-foreground">—</span>;
    default:
      return <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">vs</span>;
  }
}

function TeamSide({ team, mine, alignRight }: { team?: TeamInfo; mine: boolean; alignRight?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${alignRight ? "flex-row-reverse text-right" : ""}`}>
      <span className="text-2xl">{team?.flag ?? "🏳️"}</span>
      <span className={`truncate font-semibold ${mine ? "text-neon" : ""}`}>{team?.name ?? "TBD"}</span>
    </div>
  );
}

/**
 * One match on the calendar (U5). State machine lives in lib/matches/day.ts;
 * this component only renders. Uses existing tokens only — no new colors.
 */
export function MatchCard({
  match,
  teamMap,
  myTeamIds,
  viewerPoints,
  showStake,
}: {
  match: CalendarMatch;
  teamMap: Map<number, TeamInfo>;
  myTeamIds: Set<number>;
  viewerPoints: ViewerPoints[];
  showStake: boolean;
}) {
  const state = cardStateFor(match);
  const home = match.home_team_id ? teamMap.get(match.home_team_id) : undefined;
  const away = match.away_team_id ? teamMap.get(match.away_team_id) : undefined;
  const mine = [home, away].filter((t): t is TeamInfo => !!t && myTeamIds.has(t.id));
  const highlight = showStake && mine.length > 0;

  const chip =
    match.stage === "group"
      ? match.group_label
        ? `Group ${match.group_label}`
        : "Group Stage"
      : match.stage
        ? STAGE_LABEL[match.stage]
        : null;

  // Per-team points the viewer earned in THIS match (final cards only).
  const pointsForTeam = (teamId: number) => viewerPoints.filter((p) => p.teamId === teamId);

  return (
    <Link
      href={`/match/${match.fixture_id}`}
      className={`block rounded-xl border bg-card p-3 shadow-sm transition-[border-color,transform] hover:border-neon/50 active:scale-[0.99] ${highlight ? "border-neon/40" : "border-border"}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold tabular-nums">
          {match.kickoff ? formatKickoffTimeET(match.kickoff) : "TBD"}
        </span>
        <div className="flex items-center gap-2">
          <StatusBadge state={state} updatedAt={match.updated_at} />
          {chip && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{chip}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <TeamSide team={home} mine={!!home && myTeamIds.has(home.id)} />
        <div className="shrink-0 text-center">
          <CenterCell state={state} />
          {(state.kind === "live" || state.kind === "paused") && match.ht_home_goals != null && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              HT {match.ht_home_goals}–{match.ht_away_goals}
            </div>
          )}
        </div>
        <TeamSide team={away} mine={!!away && myTeamIds.has(away.id)} alignRight />
      </div>

      {(match.venue_name || match.venue_city) && (
        <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <span aria-hidden>📍</span>
          <span className="truncate">
            {[match.venue_name, match.venue_city].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}

      {highlight && (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
          {state.kind === "final" ? (
            mine.map((t) => {
              const lines = pointsForTeam(t.id);
              const total = lines.reduce((s, l) => s + l.points, 0);
              return (
                <div key={t.id} className="flex items-baseline justify-between">
                  <span className="font-semibold text-neon">
                    {t.flag} {t.name}
                  </span>
                  <span className="text-right">
                    <span className="font-extrabold tabular-nums text-neon">
                      {total > 0 ? `+${total}` : total}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {lines.length > 0 ? lines.map((l) => l.label).join(" · ") : "pts"}
                    </span>
                  </span>
                </div>
              );
            })
          ) : (
            <p className="truncate font-medium text-foreground">
              {mine.length === 2 ? (
                "⚡ Both your teams play"
              ) : (
                <>You picked {mine[0].flag}</>

              )}
              {mine.some((t) => t.goalBonus) && " / bonus for pts scored"}
            </p>
          )}
        </div>
      )}
    </Link>
  );
}
