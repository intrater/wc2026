import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPhase } from "@/lib/state/phase";
import { computePayouts, formatUsd, type PayoutSplit } from "@/lib/payouts/calc";

export const dynamic = "force-dynamic";

const DEFAULT_SPLIT: PayoutSplit = { champion: 0.6, runner_up: 0.25, group_leader: 0.15 };

export default async function HomePage() {
  const supabase = await createClient();
  const phase = await getPhase();

  const [{ data: settings }, { data: entries }] = await Promise.all([
    supabase.from("settings").select("payout_split, entry_fee_cents").single(),
    supabase.from("entries").select("id, display_name, paid, submitted_at").order("display_name"),
  ]);

  const split = (settings?.payout_split as PayoutSplit) ?? DEFAULT_SPLIT;
  const fee = settings?.entry_fee_cents ?? 10000;
  const all = entries ?? [];
  const submitted = all.filter((e) => e.submitted_at);
  const paidCount = all.filter((e) => e.paid).length;
  const payouts = computePayouts(paidCount, fee, split);

  return (
    <div className="space-y-6">
      <header className="text-center">
        <div className="text-5xl">🏆⚽️</div>
        <h1 className="mt-1 text-3xl text-[var(--color-pitch-dark)]">World Cup 2026 Pool</h1>
      </header>

      <PotBar payouts={payouts} paidCount={paidCount} />

      {phase.phase === "pre_lock" ? (
        <PreLock entries={submitted} totalEntries={all.length} />
      ) : (
        <Leaderboard supabase={supabase} />
      )}
    </div>
  );
}

function PotBar({ payouts, paidCount }: { payouts: ReturnType<typeof computePayouts>; paidCount: number }) {
  return (
    <div className="rounded-2xl bg-[var(--color-night)] p-4 text-white">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-neutral-300">Prize pool ({paidCount} paid)</span>
        <span className="text-2xl font-extrabold text-[var(--color-gold)]">{formatUsd(payouts.potCents)}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        <Prize label="🥇 Champion" value={formatUsd(payouts.championCents)} />
        <Prize label="🥈 Runner-up" value={formatUsd(payouts.runnerUpCents)} />
        <Prize label="📅 Group stage" value={formatUsd(payouts.groupLeaderCents)} />
      </div>
    </div>
  );
}

function Prize({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/10 p-2">
      <div className="text-neutral-300">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}

function PreLock({ entries, totalEntries }: { entries: { id: string; display_name: string; paid: boolean }[]; totalEntries: number }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
        <div className="text-4xl font-extrabold text-[var(--color-pitch)]">{entries.length}</div>
        <p className="text-neutral-600">entered so far — picks reveal at kickoff 🔒</p>
        <Link href="/pick" className="mt-3 inline-block rounded-lg bg-[var(--color-gold)] px-6 py-3 font-bold text-[var(--color-night)]">
          Make your picks
        </Link>
      </div>
      {entries.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-bold">Who&apos;s in</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2">
                <span className="flex-1">{e.display_name}</span>
                {!e.paid && <span className="text-xs text-[var(--color-flame)]">unpaid</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

async function Leaderboard({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const { data: rows } = await supabase
    .from("scores")
    .select("entry_id, total, group_stage_total, entries(display_name, paid)")
    .order("total", { ascending: false })
    .order("underdog_total", { ascending: false })
    .order("upset_total", { ascending: false });

  const scores = rows ?? [];
  if (scores.length === 0) {
    return <p className="text-center text-neutral-500">No scores yet — check back after the first matches.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="font-bold">Leaderboard</h2>
        <Link href="/rosters" className="text-sm text-[var(--color-pitch)] underline">All rosters</Link>
      </div>
      <ol>
        {scores.map((s, i) => {
          const e = s.entries as unknown as { display_name: string; paid: boolean };
          return (
            <li key={s.entry_id}>
              <Link href={`/entry/${s.entry_id}`} className="flex items-center gap-3 border-b px-4 py-3 last:border-0 hover:bg-neutral-50">
                <span className="w-6 text-center font-bold text-neutral-400">{i + 1}</span>
                <span className="flex-1 font-semibold">
                  {e?.display_name}
                  {!e?.paid && <span className="ml-2 text-xs text-[var(--color-flame)]">unpaid</span>}
                </span>
                <span className="text-right">
                  <span className="block text-lg font-extrabold text-[var(--color-pitch-dark)]">{s.total}</span>
                  <span className="block text-xs text-neutral-400">grp {s.group_stage_total}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
