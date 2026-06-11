import { createClient } from "@/lib/supabase/server";
import { computePayouts, formatUsd } from "@/lib/payouts/calc";
import { PageTitle, TitleAccent } from "@/components/PageTitle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payouts · World Cup 2026 Pool" };

export default async function PayoutsPage() {
  const supabase = await createClient();
  const [{ data: settings }, { count }] = await Promise.all([
    supabase.from("settings").select("entry_fee_cents, payout_split").single(),
    supabase.from("entries").select("id", { count: "exact", head: true }).not("submitted_at", "is", null),
  ]);
  const entrants = count ?? 0;
  const feeCents = settings?.entry_fee_cents ?? 10000;
  const split = settings?.payout_split ?? { champion: 0.5, runner_up: 0.25, group_leader: 0.15, group_runner_up: 0.1 };
  const p = computePayouts(entrants, feeCents, split);

  const rows = [
    { label: "Overall champion", sub: "most points, whole tournament", cents: p.championCents, pct: split.champion },
    { label: "Runner-up", sub: "2nd overall", cents: p.runnerUpCents, pct: split.runner_up },
    { label: "Most points, group stage", sub: "leader after group play", cents: p.groupLeaderCents, pct: split.group_leader },
    { label: "Group-stage runner-up", sub: "2nd after group play", cents: p.groupRunnerUpCents, pct: split.group_runner_up },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageTitle
        sub={
          <>
            Four prizes out of one pot. It grows{" "}
            <strong className="text-foreground">$100 per entrant</strong>.
          </>
        }
      >
        <TitleAccent>Payouts</TitleAccent>
      </PageTitle>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Total pot</span>
          <span className="font-mono text-2xl font-extrabold tabular-nums text-neon">{formatUsd(p.potCents)}</span>
        </div>
        <ul className="mt-1">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
              <span>
                <span className="font-semibold">{r.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.sub} · {Math.round(r.pct * 100)}%
                </span>
              </span>
              <span className="shrink-0 font-mono text-lg font-extrabold tabular-nums">{formatUsd(r.cents)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
          Projected from ${(feeCents / 100).toLocaleString("en-US")} × {entrants}{" "}
          {entrants === 1 ? "entrant" : "entrants"}. Grows as more join; final once picks lock.
          Ties break by underdog points, then upset points; exact ties split the prize.
        </p>
      </section>
    </div>
  );
}
