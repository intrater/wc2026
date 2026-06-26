import Link from "next/link";
import type { RaceData, RaceContender, RaceTeam, SwingBacker } from "@/lib/race/compute";

const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
const dayLabel = (iso: string | null) => (iso ? ET_DAY.format(new Date(iso)) : null);

const HOME_LIMIT = 3;

/** Flags only — names are visually noisy. Country shows on hover (title). */
function Flags({ teams }: { teams: RaceTeam[] }) {
  if (teams.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5 align-middle text-base leading-tight">
      {teams.map((t) => (
        <span key={t.id} title={t.name}>{t.flag}</span>
      ))}
    </span>
  );
}

/** Owners list, by rank: "Mike (1), Drew (6) +3". */
function backerList(backers: SwingBacker[]) {
  const shown = backers.slice(0, 3);
  return shown.map((b) => `${b.name} (${b.rank})`).join(", ") + (backers.length > 3 ? ` +${backers.length - 3}` : "");
}

function statusLine(c: RaceContender, leaderPrize: string, runnerUpPrize: string) {
  if (c.rank === 1) return <span className="font-semibold text-neon">🥇 leads · {leaderPrize}</span>;
  if (c.inMoneyNow) return <span className="font-semibold text-neon">🥈 in the money · {runnerUpPrize}</span>;
  return <span className="text-muted-foreground">{c.gapToMoney} back of the money</span>;
}

function ContenderRow({ c, data }: { c: RaceContender; data: RaceData }) {
  return (
    <li className="border-b border-border px-4 py-2.5 last:border-0">
      <div className="flex items-baseline gap-2">
        <span className={`w-5 text-center font-mono text-sm font-bold ${c.rank === 1 ? "text-neon" : "text-muted-foreground"}`}>
          {c.rank}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
        <span className="tabular-nums text-sm font-bold">{c.points}</span>
      </div>
      <div className="mt-1 space-y-1.5 pl-7 text-xs">
        <div>{statusLine(c, data.leaderPrize, data.runnerUpPrize)}</div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Root for</div>
          <div className="mt-0.5"><Flags teams={c.rootFor} /></div>
        </div>
        {c.rootAgainst.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Root against</div>
            <div className="mt-0.5 inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-base leading-tight">
              {c.rootAgainst.map((t) => (
                <span key={t.id} title={t.name}>
                  {t.flag}
                  <span className="ml-0.5 align-middle text-[10px] text-muted-foreground">({t.owner})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/** The fun part up top: each remaining game, and who climbs the table if it wins. */
function SwingGames({ games, limit }: { games: RaceData["swingGames"]; limit: number }) {
  const shown = games.slice(0, limit);
  if (shown.length === 0) return null;
  return (
    <div className="border-b border-border bg-accent/20 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        👀 Swing games to watch
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">Each game&apos;s winner earns its owners points — who climbs:</p>
      <ul className="mt-1.5 space-y-2">
        {shown.map((g) => (
          <li key={`${g.home.id}-${g.away.id}`} className="text-xs">
            <div className="font-semibold">
              <span title={g.home.name}>{g.home.flag}</span> <span className="text-muted-foreground">v</span>{" "}
              <span title={g.away.name}>{g.away.flag}</span>
              {dayLabel(g.kickoffISO) ? <span className="font-normal text-muted-foreground"> · {dayLabel(g.kickoffISO)}</span> : null}
            </div>
            {g.homeBackers.length > 0 && (
              <div className="mt-0.5 text-muted-foreground">
                <span title={g.home.name}>{g.home.flag}</span> win lifts <span className="text-foreground">{backerList(g.homeBackers)}</span>
              </div>
            )}
            {g.awayBackers.length > 0 && (
              <div className="text-muted-foreground">
                <span title={g.away.name}>{g.away.flag}</span> win lifts <span className="text-foreground">{backerList(g.awayBackers)}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "The Race" — the group-stage money race. Leads with the swing games, then the
 * standings. `full` renders every contender + 5 swing games (the /race page);
 * otherwise it truncates with a link.
 */
export function RaceCard({ data, full = false }: { data: RaceData; full?: boolean }) {
  const shown = full ? data.contenders : data.contenders.slice(0, HOME_LIMIT);
  const ends = dayLabel(data.groupsEndISO);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">The Race · group-stage $</h2>
          <Link href="/payouts" className="text-xs font-semibold text-neon hover:underline">
            {data.leaderPrize} / {data.runnerUpPrize}
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Top 2 on points when groups end{ends ? ` (${ends})` : ""} win the money · line at{" "}
          <span className="font-semibold text-foreground">{data.moneyLine}</span> pts
        </p>
      </div>

      <SwingGames games={data.swingGames} limit={full ? 5 : 3} />

      <ol>
        {shown.map((c) => (
          <ContenderRow key={c.entryId} c={c} data={data} />
        ))}
      </ol>

      {!full && data.contenders.length > shown.length && (
        <Link
          href="/race"
          className="block border-t border-border px-4 py-2.5 text-center text-sm font-semibold text-neon transition-colors hover:bg-accent/40"
        >
          See the full race →
        </Link>
      )}

      {full && (
        <p className="border-t border-border px-4 py-3 text-xs italic text-muted-foreground">
          Two group-stage prizes ({data.leaderPrize} most points, {data.runnerUpPrize} runner-up) lock in when
          the last group game ends. &ldquo;Root for&rdquo; = your teams still playing; &ldquo;root against&rdquo;
          = a leader&apos;s team you don&apos;t own. Separate from the overall-title prizes.
        </p>
      )}
    </div>
  );
}
