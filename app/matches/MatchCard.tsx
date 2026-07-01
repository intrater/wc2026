import Link from "next/link";
import type { Match } from "@/lib/db/types";
import type { TeamInfo } from "@/lib/views/data";
import { STAGE_LABEL, cardStateFor, type CardState } from "@/lib/matches/day";
import { LocalTime } from "@/components/LocalTime";
import { computeRooting, type Backer, type Owner } from "@/lib/matches/rooting";

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
  | "odds_home"
  | "odds_away"
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
            updated <LocalTime iso={updatedAt} />
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

function TeamSide({
  team,
  mine,
  alignRight,
  winProb,
  favored,
}: {
  team?: TeamInfo;
  mine: boolean;
  alignRight?: boolean;
  winProb?: number | null; // pre-match win probability to show, or null to hide
  favored?: boolean; // mark this side as the favorite (★)
}) {
  const tier = team?.tier ?? null;
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${alignRight ? "flex-row-reverse text-right" : ""}`}>
      <span className="text-2xl">{team?.flag ?? "🏳️"}</span>
      <span className="min-w-0">
        <span className={`block truncate font-semibold ${mine ? "text-neon" : ""}`}>{team?.name ?? "TBD"}</span>
        {(tier != null || winProb != null) && (
          <span className={`block truncate text-[10px] ${favored ? "font-bold text-foreground" : "text-muted-foreground"}`}>
            {favored && "★ "}
            {tier != null ? `Tier ${tier}` : ""}
            {winProb != null ? `${tier != null ? " · " : ""}${Math.round(winProb * 100)}%` : ""}
          </span>
        )}
      </span>
    </div>
  );
}

/** One team's backers: flag + count header, then up to 4 names (rank-ordered), "+N more". */
function BackerCol({
  flag,
  count,
  backers,
  alignRight,
}: {
  flag: string;
  count: number;
  backers: Backer[];
  alignRight?: boolean;
}) {
  const shown = backers.slice(0, 4);
  const more = backers.length - shown.length;
  return (
    <div className={`min-w-0 ${alignRight ? "text-right" : ""}`}>
      <div className="font-bold text-foreground">
        {flag} {count} {count === 1 ? "backer" : "backers"}
      </div>
      {count === 0 ? (
        <div className="text-muted-foreground/60">nobody</div>
      ) : (
        shown.map((b, i) => (
          <div key={i} className={`truncate ${b.isViewer ? "font-bold text-neon" : "text-muted-foreground"}`}>
            {b.isViewer ? "You" : b.name} <span className="opacity-70">#{b.rank}</span>
          </div>
        ))
      )}
      {more > 0 && <div className="text-muted-foreground/70">+{more} more</div>}
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
  ownersByTeam,
  viewerEntryId,
  viewerRank,
  isToday,
}: {
  match: CalendarMatch;
  teamMap: Map<number, TeamInfo>;
  myTeamIds: Set<number>;
  viewerPoints: ViewerPoints[];
  showStake: boolean;
  ownersByTeam: Map<number, Owner[]>;
  viewerEntryId: string | null;
  viewerRank: number | null;
  isToday: boolean;
}) {
  const state = cardStateFor(match);
  const home = match.home_team_id ? teamMap.get(match.home_team_id) : undefined;
  const away = match.away_team_id ? teamMap.get(match.away_team_id) : undefined;
  const mine = [home, away].filter((t): t is TeamInfo => !!t && myTeamIds.has(t.id));
  const highlight = showStake && mine.length > 0;

  // "Who's rooting" — shown on today's + in-play games (the ones you're actually watching),
  // not the whole future schedule. Decided games fall back to the points block instead.
  const inPlay = state.kind === "live" || state.kind === "halftime" || state.kind === "paused";
  const decidedKind = ["final", "postponed", "cancelled", "abandoned"].includes(state.kind);
  const showRooting = !!home && !!away && !decidedKind && (inPlay || isToday);
  const rooting = showRooting
    ? computeRooting({
        homeOwners: ownersByTeam.get(home!.id) ?? [],
        awayOwners: ownersByTeam.get(away!.id) ?? [],
        homeName: home!.name,
        awayName: away!.name,
        viewerEntryId,
        viewerRank,
      })
    : null;
  const isKnockout = !!match.stage && match.stage !== "group";

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

  // "Who's favored" — from live odds where we have them, else from the frozen tier (lower =
  // stronger). Only meaningful before a result; the win % shows for upcoming games only.
  const oddsHome = match.odds_home == null ? null : Number(match.odds_home);
  const oddsAway = match.odds_away == null ? null : Number(match.odds_away);
  const hasOdds = oddsHome != null && oddsAway != null;
  const decided = ["final", "postponed", "cancelled", "abandoned"].includes(state.kind);
  const favSide: "home" | "away" | null = decided
    ? null
    : hasOdds
      ? oddsHome! > oddsAway!
        ? "home"
        : oddsAway! > oddsHome!
          ? "away"
          : null
      : home?.tier != null && away?.tier != null && home.tier !== away.tier
        ? home.tier < away.tier
          ? "home"
          : "away"
        : null;
  const showPct = (state.kind === "upcoming" || state.kind === "tbd") && hasOdds;

  return (
    <Link
      href={`/match/${match.fixture_id}`}
      className={`block rounded-xl border bg-card p-3 shadow-sm transition-[border-color,transform] hover:border-neon/50 active:scale-[0.99] ${highlight ? "border-neon/40" : "border-border"}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold tabular-nums">
          {match.kickoff ? <LocalTime iso={match.kickoff} /> : "TBD"}
        </span>
        <div className="flex items-center gap-2">
          <StatusBadge state={state} updatedAt={match.updated_at} />
          {chip && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{chip}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <TeamSide
          team={home}
          mine={!!home && myTeamIds.has(home.id)}
          winProb={showPct ? oddsHome : null}
          favored={favSide === "home"}
        />
        <div className="shrink-0 text-center">
          <CenterCell state={state} />
          {(state.kind === "live" || state.kind === "paused") && match.ht_home_goals != null && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              HT {match.ht_home_goals}–{match.ht_away_goals}
            </div>
          )}
        </div>
        <TeamSide
          team={away}
          mine={!!away && myTeamIds.has(away.id)}
          alignRight
          winProb={showPct ? oddsAway : null}
          favored={favSide === "away"}
        />
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
          ) : !rooting ? (
            <p className="truncate font-medium text-foreground">
              {mine.length === 2 ? (
                "⚡ Both your teams play"
              ) : (
                <>You picked {mine[0].flag}</>
              )}
              {mine.some((t) => t.goalBonus) && " / bonus for pts scored"}
            </p>
          ) : null}
        </div>
      )}

      {rooting && (rooting.homeCount > 0 || rooting.awayCount > 0) && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <BackerCol flag={home!.flag} count={rooting.homeCount} backers={rooting.home} />
            <BackerCol flag={away!.flag} count={rooting.awayCount} backers={rooting.away} alignRight />
          </div>
          {isKnockout && (
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
              💀 Loser is out — {rooting.homeCount} lose {home!.name}, {rooting.awayCount} lose {away!.name}
            </p>
          )}
          {rooting.you && (
            <p className="mt-1.5 rounded-md bg-neon/10 px-2 py-1 text-center text-[11px] font-medium text-foreground">
              👉 {rooting.you.text}
            </p>
          )}
        </div>
      )}
    </Link>
  );
}
