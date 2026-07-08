import Link from "next/link";
import type { FinishRaceData, FinishContender, FinishTeam } from "@/lib/race/finish";

const HOME_LIMIT = 4;

function Flags({ teams }: { teams: FinishTeam[] }) {
  if (teams.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-base leading-none">
      {teams.map((t) => (
        <span key={t.name} title={t.name} className="mr-0.5">{t.flag}</span>
      ))}
    </span>
  );
}

function ContenderRow({ c, top }: { c: FinishContender; top: boolean }) {
  return (
    <li className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
      <span className={`w-4 text-center font-mono text-xs font-bold ${top ? "text-neon" : "text-muted-foreground"}`}>
        {c.rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{c.name}</span>
          {c.bankedGroupPrize && (
            <span title="Already holds a group-stage prize" className="shrink-0 text-xs">💰</span>
          )}
        </span>
        <span className="mt-0.5 block"><Flags teams={c.aliveTeams} /></span>
      </span>
      <span className="text-right">
        <span className={`block text-lg font-extrabold tabular-nums ${top ? "text-neon" : ""}`}>{c.moneyPct}%</span>
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">in the money</span>
      </span>
    </li>
  );
}

/**
 * "Race to the Finish" — the knockout-stage chase for the two overall prizes (champion +
 * runner-up). Truncated to the top contenders on the home page, with the full field on /race.
 * Renders nothing until the knockouts start (loadFinishRace → null).
 */
export function RaceToFinishCard({ data, full = false }: { data: FinishRaceData; full?: boolean }) {
  const shown = full ? data.contenders : data.contenders.slice(0, HOME_LIMIT);
  const hiddenContenders = data.inContention - shown.length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 className="font-bold">Race to the Finish</h2>
        <span className="text-xs text-muted-foreground">{data.aliveCount} teams left</span>
      </div>

      <p className="px-4 pt-2.5 text-xs leading-relaxed text-muted-foreground">
        Chance to finish in the money — <span className="font-semibold text-foreground">champion or runner-up</span>.
        {" "}{data.whoToWatch}
      </p>

      <ul className="mt-1.5">
        {shown.map((c, i) => (
          <ContenderRow key={c.entryId} c={c} top={i === 0} />
        ))}
      </ul>

      <div className="px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {!full && hiddenContenders > 0 && (
          <Link href="/race" className="font-semibold text-neon hover:underline">
            +{hiddenContenders} more in contention →
          </Link>
        )}
        {(data.groupWinner || data.groupRunnerUp) && (
          <p className={!full && hiddenContenders > 0 ? "mt-1" : ""}>
            💰 Group-stage prizes already banked
            {data.groupWinner ? ` by ${data.groupWinner}` : ""}
            {data.groupRunnerUp ? ` & ${data.groupRunnerUp}` : ""}.
          </p>
        )}
        <p className="mt-1">
          Odds from a 10,000-run simulation, refreshed after every game.{" "}
          <Link href="/how-its-built#chance-to-win" className="text-neon hover:underline">how it works</Link>
        </p>
      </div>
    </section>
  );
}
