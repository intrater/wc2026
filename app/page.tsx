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

  const [{ data: entries }, mine] = await Promise.all([
    supabase.from("entries").select("id, display_name, paid, submitted_at").order("display_name"),
    user
      ? supabase.from("entries").select("submitted_at").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const all = entries ?? [];
  const submitted = all.filter((e) => e.submitted_at);
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
          {hasSubmitted && lockAt && (
            <span className="mt-0.5 block text-sm font-semibold text-[var(--color-night)]/70">
              <LockCountdown lockAt={lockAt} />
            </span>
          )}
        </Link>
      )}

      {phase.phase === "pre_lock" ? (
        <PreLock entries={submitted} />
      ) : (
        <Leaderboard supabase={supabase} />
      )}

      <SharePool />
    </div>
  );
}

function Rules() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="mb-2 font-bold">How it works</h2>
      <ul className="space-y-1.5 text-sm text-neutral-700">
        <li>🎯 Draft <strong>one team from each of 12 tiers</strong> — favorites up top, longshots down low.</li>
        <li>📈 Score points when your teams <strong>win, draw, and advance</strong> — escalating through the knockouts.</li>
        <li>⚽ Your <strong>tier 7–12</strong> teams also score <strong>+1 per goal</strong>.</li>
        <li>🔥 Beating a higher-tier team is an <strong>upset bonus</strong> — chaos pays.</li>
      </ul>
      <Link href="/how-it-works" className="mt-2 inline-block text-sm text-[var(--color-pitch)] underline">
        Full scoring details →
      </Link>
    </div>
  );
}

function PreLock({ entries }: { entries: { id: string; display_name: string; paid: boolean }[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
        <div className="text-4xl font-extrabold text-[var(--color-pitch)]">{entries.length}</div>
        <p className="text-neutral-600">entered so far — picks reveal at kickoff 🔒</p>
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
