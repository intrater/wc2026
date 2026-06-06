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
      <header className="pt-4 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-muted-foreground">
          World Cup 2026
        </p>
        <h1 className="mt-2 text-5xl font-extrabold leading-[0.95] sm:text-6xl">
          THE <span className="text-neon text-glow">POOL</span>
        </h1>
        {!phase.isLocked && lockAt && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold text-neon">
            <LockCountdown lockAt={lockAt} />
          </p>
        )}
      </header>

      <Rules />

      {!phase.isLocked && (
        <Link
          href="/pick"
          className="glow-neon group flex items-center justify-center gap-2 rounded-2xl bg-neon px-6 py-4 text-center text-lg font-extrabold uppercase tracking-wide text-neon-foreground transition-transform active:translate-y-px"
        >
          {hasSubmitted ? "Edit your picks" : "Make your picks"}
          <span className="transition-transform group-hover:translate-x-1">▸</span>
        </Link>
      )}

      {phase.phase !== "pre_lock" && <Leaderboard supabase={supabase} />}

      <SharePool />
    </div>
  );
}

function Rules() {
  const rows = [
    { n: "01", title: "Pick teams", desc: "One per tier (12), favorites to longshots." },
    { n: "02", title: "Score points", desc: "Wins, draws, advancing — more in knockouts." },
    { n: "03", title: "Bonus", desc: "Upsets, plus goals for tiers 7–12." },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          How it works
        </h2>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.n} className="flex items-center gap-4 border-b border-border px-5 py-4">
            <span className="font-mono text-lg font-bold text-neon">{r.n}</span>
            <div>
              <p className="font-bold">{r.title}</p>
              <p className="text-sm text-muted-foreground">{r.desc}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-sm text-muted-foreground">
          <span className="text-lg font-extrabold text-foreground">$100</span> entry
        </span>
        <a
          href="https://venmo.com/u/john-intrater"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#3d95ce] px-3 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          Pay via Venmo ▸
        </a>
      </div>
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
    return <p className="text-center text-muted-foreground">No scores yet — check back after the first matches.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Leaderboard</h2>
        <Link href="/rosters" className="text-sm font-semibold text-neon hover:underline">All rosters</Link>
      </div>
      <ol>
        {scores.map((s, i) => {
          const e = s.entries as unknown as { display_name: string; paid: boolean };
          const top = i === 0;
          return (
            <li key={s.entry_id}>
              <Link href={`/entry/${s.entry_id}`} className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent/40">
                <span className={`w-7 text-center font-mono font-bold ${top ? "text-neon" : "text-muted-foreground"}`}>{i + 1}</span>
                <span className="flex-1 font-semibold">
                  {e?.display_name}
                  {!e?.paid && <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">unpaid</span>}
                </span>
                <span className="text-right">
                  <span className="block text-lg font-extrabold tabular-nums text-foreground">{s.total}</span>
                  <span className="block text-xs text-muted-foreground">grp {s.group_stage_total}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
