import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPhase } from "@/lib/state/phase";

export const dynamic = "force-dynamic";

export default async function RostersPage() {
  const supabase = await createClient();
  const phase = await getPhase();

  const { data: entries } = await supabase
    .from("entries")
    .select("id, display_name, paid, submitted_at, scores(total)")
    .order("display_name");

  const rows = (entries ?? []).filter((e) => e.submitted_at);

  return (
    <div className="space-y-4">
      <h1 className="pt-2 text-center text-3xl font-extrabold">Rosters</h1>
      {phase.phase === "pre_lock" && (
        <p className="text-center text-sm text-muted-foreground">
          Picks are hidden until kickoff — you can see who&apos;s entered, but not their teams yet. 🔒
        </p>
      )}
      <ul className="space-y-2">
        {rows.map((e) => {
          const total = (e.scores as unknown as { total: number } | null)?.total;
          return (
            <li key={e.id}>
              <Link href={`/entry/${e.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-neon/40 hover:bg-accent/40">
                <span className="flex-1 font-semibold">
                  {e.display_name}
                  {!e.paid && <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">unpaid</span>}
                </span>
                {phase.phase !== "pre_lock" && total != null && (
                  <span className="font-extrabold tabular-nums text-neon">{total}</span>
                )}
                <span className="text-muted-foreground">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
