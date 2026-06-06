import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { getPhase } from "@/lib/state/phase";
import { LockCountdown } from "@/components/LockCountdown";
import { SharePool } from "@/components/SharePool";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const phase = await getPhase();
  const user = await getUser();

  const mine = user
    ? await supabase.from("entries").select("submitted_at").eq("user_id", user.id).maybeSingle()
    : { data: null };

  const hasSubmitted = !!mine?.data?.submitted_at;
  const lockAt = phase.lockAt ? phase.lockAt.toISOString() : null;

  return (
    <div className="space-y-6">
      <header className="text-center">
        <div className="text-5xl">🏆⚽️</div>
        <h1 className="mt-1 text-3xl text-[var(--color-pitch-dark)]">World Cup 2026 Pool</h1>
        {!phase.isLocked && lockAt && (
          <p className="mt-1 text-sm font-semibold text-[var(--color-flame)]">
            <LockCountdown lockAt={lockAt} />
          </p>
        )}
      </header>

      <Rules />

      {!phase.isLocked && (
        <Link
          href="/pick"
          className="block rounded-2xl bg-[var(--color-gold)] px-6 py-4 text-center text-lg font-extrabold text-[var(--color-night)] shadow-sm"
        >
          {hasSubmitted ? "✏️ Edit your picks" : "⚽ Make your picks"}
        </Link>
      )}

      {phase.phase !== "pre_lock" && <Leaderboard supabase={supabase} />}

      <SharePool />
    </div>
  );
}

function Rules() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="mb-2 font-bold">TL;DR</h2>
      <ul className="space-y-3 text-sm text-neutral-700">
        <li>
          <p className="font-bold text-neutral-900">🎯 Pick teams</p>
          <p>One per tier (12), favorites to longshots.</p>
        </li>
        <li>
          <p className="font-bold text-neutral-900">📈 Score points</p>
          <p>Wins, draws, advancing — more in knockouts.</p>
        </li>
        <li>
          <p className="font-bold text-neutral-900">🔥 Bonus</p>
          <p>Upsets, plus goals for tiers 7–12.</p>
        </li>
      </ul>
      <p className="mt-3 border-t border-neutral-100 pt-3 text-sm text-neutral-700">
        💵 <strong>$100 entry</strong> — via{" "}
        <a
          href="https://venmo.com/u/john-intrater"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[var(--color-pitch)] underline"
        >
          Venmo
        </a>
      </p>
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
