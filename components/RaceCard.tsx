import Link from "next/link";
import type { RaceData, RaceTeam } from "@/lib/race/compute";

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

function ContenderRow({ c, full }: { c: RaceData["contenders"][number]; full?: boolean }) {
  return (
    <li className="border-b border-border px-4 py-2.5 last:border-0">
      <div className="flex items-baseline gap-2">
        <span className={`w-5 text-center font-mono text-sm font-bold ${c.rank === 1 ? "text-neon" : "text-muted-foreground"}`}>
          {c.rank}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
        <span className="tabular-nums text-sm text-muted-foreground">{c.total}</span>
        {c.winPct != null && (
          <span className="tabular-nums text-sm font-bold text-neon">{c.winPct}%</span>
        )}
      </div>
      <div className="mt-0.5 space-y-0.5 pl-7 text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">Root for</span>{" "}
          <Teams teams={c.rootFor} full={full} />
        </div>
        {c.rootAgainst.length > 0 && (
          <div>
            <span className="font-semibold text-foreground">Hope they slip</span>{" "}
            <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5 align-middle">
              {c.rootAgainst.map((t) => (
                <span key={t.id} title={t.name}>
                  {t.flag}
                  {full ? <span className="ml-0.5 text-foreground">{t.name}</span> : null}
                  <span className="text-muted-foreground"> ({t.owner})</span>
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * "The Race" rooting guide. `full` renders every contender + the pivotal game and an
 * eliminated tally (the /race page); otherwise it truncates to the top few with a link.
 */
export function RaceCard({ data, full = false }: { data: RaceData; full?: boolean }) {
  const shown = full ? data.contenders : data.contenders.slice(0, HOME_LIMIT);
  const ends = dayLabel(data.groupsEndISO);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          The Race
        </h2>
        <span className="text-xs text-muted-foreground">
          {data.aliveCount} alive for 1st{ends ? ` · groups end ${ends}` : ""}
        </span>
      </div>

      <ol>
        {shown.map((c) => (
          <ContenderRow key={c.entryId} c={c} full={full} />
        ))}
      </ol>

      {!full && data.aliveCount > shown.length && (
        <Link
          href="/race"
          className="block border-t border-border px-4 py-2.5 text-center text-sm font-semibold text-neon transition-colors hover:bg-accent/40"
        >
          See all {data.aliveCount} contenders →
        </Link>
      )}

      {full && (
        <div className="space-y-1 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {data.pivotal && (
            <p>
              <span className="font-semibold text-foreground">Most-watched game:</span>{" "}
              {data.pivotal.home.flag} {data.pivotal.home.name} v {data.pivotal.away.flag}{" "}
              {data.pivotal.away.name}
              {dayLabel(data.pivotal.kickoffISO) ? ` (${dayLabel(data.pivotal.kickoffISO)})` : ""} —{" "}
              {data.pivotal.owners} {data.pivotal.owners === 1 ? "roster" : "rosters"} have a stake.
            </p>
          )}
          {data.eliminatedCount > 0 && (
            <p>{data.eliminatedCount} {data.eliminatedCount === 1 ? "entry is" : "entries are"} out of the running for 1st.</p>
          )}
          <p className="pt-1 italic">
            Root-for = your teams still playing. Hope-they-slip = a leader&apos;s team you don&apos;t own.
            Odds from the chance-to-win model.
          </p>
        </div>
      )}
    </div>
  );
}
