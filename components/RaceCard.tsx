import Link from "next/link";
import type { RaceData, RaceContender, RaceTeam, SwingBacker } from "@/lib/race/compute";

const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
const dayLabel = (iso: string | null) => (iso ? ET_DAY.format(new Date(iso)) : null);

const HOME_LIMIT = 3;

/** Inline flag list (flags only on home; flags + names on the full page). */
function Teams({ teams, full }: { teams: RaceTeam[]; full?: boolean }) {
  if (teams.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-1.5 gap-y-0.5 align-middle">
      {teams.map((t) => (
        <span key={t.id} title={t.name}>
          {t.flag}
          {full ? <span className="ml-0.5 text-foreground">{t.name}</span> : null}
        </span>
      ))}
    </span>
  );
}

/** The one-line standing for a contender: leader / in-the-money / how far back. */
function statusLine(c: RaceContender, leaderPrize: string, runnerUpPrize: string) {
  if (c.rank === 1) return <span className="font-semibold text-neon">🥇 leads · {leaderPrize}</span>;
  if (c.inMoneyNow) return <span className="font-semibold text-neon">🥈 in the money · {runnerUpPrize}</span>;
  return <span className="text-muted-foreground">{c.gapToMoney} back of the money</span>;
}

function ContenderRow({ c, full, data }: { c: RaceContender; full?: boolean; data: RaceData }) {
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
          <div className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">Root for</div>
          <div className="mt-0.5 text-base leading-tight">
            <Teams teams={c.rootFor} full={full} />
          </div>
        </div>
        {c.rootAgainst.length > 0 && (
          <div>
            <div className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">Root against</div>
            <div className="mt-0.5 text-base leading-tight">
              <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {c.rootAgainst.map((t) => (
                  <span key={t.id} title={`${t.name} (${t.owner})`}>
                    {t.flag}
                    {full ? <span className="ml-0.5 text-sm text-foreground">{t.name}</span> : null}
                    <span className="ml-0.5 text-[10px] text-muted-foreground">({t.owner})</span>
                  </span>
                ))}
              </span>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/** "🇪🇸 Mike (1), Drew (6)" — who's pulling for this team, by rank. */
function Backers({ flag, backers }: { flag: string; backers: SwingBacker[] }) {
  if (backers.length === 0) return null;
  const shown = backers.slice(0, 3);
  return (
    <span className="inline-flex items-baseline gap-1">
      <span>{flag}</span>
      <span className="text-muted-foreground">
        {shown.map((b) => `${b.name} (${b.rank})`).join(", ")}
        {backers.length > 3 ? ` +${backers.length - 3}` : ""}
      </span>
    </span>
  );
}

function SwingGames({ games, limit }: { games: RaceData["swingGames"]; limit: number }) {
  const shown = games.slice(0, limit);
  if (shown.length === 0) return null;
  return (
    <div className="border-t border-border px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        👀 Swing games to watch
      </div>
      <ul className="mt-1.5 space-y-2">
        {shown.map((g) => (
          <li key={`${g.home.id}-${g.away.id}`} className="text-xs">
            <div className="font-semibold">
              {g.home.flag} {g.home.name} <span className="text-muted-foreground">v</span> {g.away.flag} {g.away.name}
              {dayLabel(g.kickoffISO) ? <span className="text-muted-foreground"> · {dayLabel(g.kickoffISO)}</span> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              <Backers flag={g.home.flag} backers={g.homeBackers} />
              <Backers flag={g.away.flag} backers={g.awayBackers} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "The Race" — the group-stage money race. `full` renders every contender (the /race
 * page); otherwise it truncates to the top few with a link.
 */
export function RaceCard({ data, full = false }: { data: RaceData; full?: boolean }) {
  const shown = full ? data.contenders : data.contenders.slice(0, HOME_LIMIT);
  const ends = dayLabel(data.groupsEndISO);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            The Race · group-stage $
          </h2>
          <Link href="/payouts" className="text-xs font-semibold text-neon hover:underline">
            {data.leaderPrize} / {data.runnerUpPrize}
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Top 2 on points when groups end{ends ? ` (${ends})` : ""} take the money · line at{" "}
          <span className="font-semibold text-foreground">{data.moneyLine}</span> pts
        </p>
      </div>

      <ol>
        {shown.map((c) => (
          <ContenderRow key={c.entryId} c={c} full={full} data={data} />
        ))}
      </ol>

      <SwingGames games={data.swingGames} limit={full ? 5 : 2} />

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
          the last group game ends. &ldquo;Root for&rdquo; = your teams still playing; &ldquo;hope they
          slip&rdquo; = a leader&apos;s team you don&apos;t own. Separate from the overall-title prizes.
        </p>
      )}
    </div>
  );
}
