import Link from "next/link";
import type { RaceData, RaceContender, RaceTeam, SwingBacker } from "@/lib/race/compute";

const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
const dayLabel = (iso: string | null) => (iso ? ET_DAY.format(new Date(iso)) : null);

const HOME_LIMIT = 3;
const firstName = (full: string) => full.split(" ")[0];

/** Flags only — names are noisy; the country shows on hover. */
function Flags({ teams }: { teams: RaceTeam[] }) {
  if (teams.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      {teams.map((t) => (
        <span key={t.id} title={t.name} className="mr-1">{t.flag}</span>
      ))}
    </>
  );
}

/** First names only, capped: "Mike, Drew +3". */
function names(backers: SwingBacker[]) {
  const shown = backers.slice(0, 3).map((b) => firstName(b.name));
  return shown.join(", ") + (backers.length > 3 ? ` +${backers.length - 3}` : "");
}

function statusChip(c: RaceContender, leaderPrize: string, runnerUpPrize: string) {
  if (c.rank === 1) return <span className="font-semibold text-neon">🥇 leads · {leaderPrize}</span>;
  if (c.inMoneyNow) return <span className="font-semibold text-neon">🥈 in the money · {runnerUpPrize}</span>;
  return <span className="text-muted-foreground">{c.gapToMoney} back</span>;
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
      <div className="mt-1 pl-7 text-xs">
        <div>{statusChip(c, data.leaderPrize, data.runnerUpPrize)}</div>
        <div className="mt-1 text-base leading-tight">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">for </span>
          <Flags teams={c.rootFor} />
          {c.rootAgainst.length > 0 && (
            <>
              <span className="mx-1 align-middle text-xs text-muted-foreground">·</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">against </span>
              <Flags teams={c.rootAgainst} />
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** Top of the card: the next games, and which contenders are on each side. */
function SwingGames({ games, limit }: { games: RaceData["swingGames"]; limit: number }) {
  const shown = games.slice(0, limit);
  if (shown.length === 0) return null;
  return (
    <div className="border-b border-border bg-accent/20 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        👀 Swing games — who&apos;s pulling which way
      </div>
      <ul className="mt-1.5 space-y-2 text-xs">
        {shown.map((g) => (
          <li key={`${g.home.id}-${g.away.id}`}>
            <div className="font-semibold">
              <span title={g.home.name}>{g.home.flag}</span> <span className="text-muted-foreground">v</span>{" "}
              <span title={g.away.name}>{g.away.flag}</span>
              {dayLabel(g.kickoffISO) ? <span className="font-normal text-muted-foreground"> · {dayLabel(g.kickoffISO)}</span> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
              {g.homeBackers.length > 0 && (
                <span><span title={g.home.name}>{g.home.flag}</span> <span className="text-foreground">{names(g.homeBackers)}</span></span>
              )}
              {g.awayBackers.length > 0 && (
                <span><span title={g.away.name}>{g.away.flag}</span> <span className="text-foreground">{names(g.awayBackers)}</span></span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "The Race" — the group-stage money race. Leads with the swing games, then the
 * standings. `full` renders all contenders + more swing games (the /race page).
 */
export function RaceCard({ data, full = false }: { data: RaceData; full?: boolean }) {
  const shown = full ? data.contenders : data.contenders.slice(0, HOME_LIMIT);
  const ends = dayLabel(data.groupsEndISO);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">The Race · group $</h2>
          <Link href="/payouts" className="text-xs font-semibold text-neon hover:underline">
            {data.leaderPrize} / {data.runnerUpPrize}
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Top 2 on points when groups end{ends ? ` (${ends})` : ""} take the money · line at{" "}
          <span className="font-semibold text-foreground">{data.moneyLine}</span>
        </p>
      </div>

      <SwingGames games={data.swingGames} limit={full ? 4 : 2} />

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
          Two group-stage prizes ({data.leaderPrize} most points, {data.runnerUpPrize} runner-up) lock in when the
          last group game ends — separate from the overall-title prizes. &ldquo;For&rdquo; = your teams still
          playing; &ldquo;against&rdquo; = a leader&apos;s team you don&apos;t own.
        </p>
      )}
    </div>
  );
}
