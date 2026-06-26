import Link from "next/link";
import type { RaceData, RaceContender, RaceTeam } from "@/lib/race/compute";

const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
const dayLabel = (iso: string | null) => (iso ? ET_DAY.format(new Date(iso)) : null);

const HOME_LIMIT = 3;

/** Flags only — names are noisy; the country shows on hover. */
function Flags({ teams }: { teams: RaceTeam[] }) {
  if (teams.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-base leading-tight">
      {teams.map((t) => (
        <span key={t.id} title={t.name} className="mr-1">{t.flag}</span>
      ))}
    </span>
  );
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
      <div className="mt-1 space-y-1 pl-7 text-xs">
        <div>{statusChip(c, data.leaderPrize, data.runnerUpPrize)}</div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Rooting for: </span>
          <Flags teams={c.rootFor} />
        </div>
        {c.rootAgainst.length > 0 && (
          <div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Rooting against: </span>
            <Flags teams={c.rootAgainst} />
          </div>
        )}
      </div>
    </li>
  );
}

/** Odds-driven "if the likely result happens, these contenders gain" lines. */
function Scenarios({ scenarios, limit }: { scenarios: RaceData["scenarios"]; limit: number }) {
  const shown = scenarios.slice(0, limit);
  if (shown.length === 0) return null;
  return (
    <div className="border-t border-border px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        📊 Likely scenarios <span className="font-normal normal-case">(per betting odds)</span>
      </div>
      <ul className="mt-1.5 space-y-1 text-xs">
        {shown.map((s) => (
          <li key={s.favorite.id}>
            <span title={s.favorite.name}>{s.favorite.flag}</span>{" "}
            <span className="font-semibold">beat</span>{" "}
            <span title={s.underdog.name}>{s.underdog.flag}</span>{" "}
            <span className="text-muted-foreground">({s.winPct}%)</span> →{" "}
            <span className="text-foreground">lifts {s.lifts.join(", ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "The Race" — the group-stage money race: standings + who each contender is rooting
 * for and against. `full` renders all contenders (the /race page); else top few + link.
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

      <ol>
        {shown.map((c) => (
          <ContenderRow key={c.entryId} c={c} data={data} />
        ))}
      </ol>

      <Scenarios scenarios={data.scenarios} limit={full ? 4 : 2} />

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
          last group game ends — separate from the overall-title prizes. &ldquo;Rooting for&rdquo; = your teams
          still playing; &ldquo;rooting against&rdquo; = a leader&apos;s team you don&apos;t own.
        </p>
      )}
    </div>
  );
}
