import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/auth/server";
import { loadTeamMap } from "@/lib/views/data";
import { togglePaid, setLock, setComplete, freezeTiers, overrideResult, clearOverride } from "./actions";
import { IngestButton } from "./IngestButton";

export const dynamic = "force-dynamic";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function AdminPage() {
  const ctx = await getUserAndProfile();
  if (!ctx) redirect("/login");
  if (!ctx.profile?.is_admin) {
    return <div className="text-center text-neutral-500">🔒 Admins only.</div>;
  }

  const supabase = await createClient();
  const teamMap = await loadTeamMap();
  const [{ data: settings }, { data: entries }, { data: matches }] = await Promise.all([
    supabase.from("settings").select("lock_at, tiers_frozen_at, tournament_complete").single(),
    supabase.from("entries").select("id, display_name, paid, submitted_at").order("display_name"),
    supabase.from("matches").select("fixture_id, stage, status, home_goals, away_goals, home_team_id, away_team_id, manual_override, needs_attention").order("kickoff"),
  ]);

  const paidCount = (entries ?? []).filter((e) => e.paid).length;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-[var(--color-pitch-dark)]">Admin</h1>

      {/* Settings */}
      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="font-bold">Pool settings</h2>

        <form action={setLock} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block font-semibold">Picks lock at (kickoff)</span>
            <input type="datetime-local" name="lock_at" defaultValue={toLocalInput(settings?.lock_at ?? null)} className="rounded border px-2 py-1" />
          </label>
          <button className="rounded-lg bg-[var(--color-pitch)] px-3 py-1.5 text-sm font-semibold text-white">Save lock time</button>
        </form>

        <div className="flex flex-wrap gap-3">
          <form action={freezeTiers}>
            <button disabled={!!settings?.tiers_frozen_at} className="rounded-lg bg-[var(--color-gold)] px-3 py-1.5 text-sm font-bold text-[var(--color-night)] disabled:opacity-50">
              {settings?.tiers_frozen_at ? "Tiers frozen ✓" : "Freeze tiers"}
            </button>
          </form>
          <form action={setComplete}>
            <input type="hidden" name="complete" value={(!settings?.tournament_complete).toString()} />
            <button className="rounded-lg border px-3 py-1.5 text-sm font-semibold">
              {settings?.tournament_complete ? "Reopen tournament" : "Mark tournament complete"}
            </button>
          </form>
        </div>

        <div className="border-t pt-3">
          <p className="mb-2 text-sm font-semibold">Results feed</p>
          <IngestButton />
        </div>
      </section>

      {/* Entries / paid tracking */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold">Entries — {paidCount} paid of {(entries ?? []).length}</h2>
        <ul className="space-y-1">
          {(entries ?? []).map((e) => (
            <li key={e.id} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <span className="flex-1">
                {e.display_name}
                {!e.submitted_at && <span className="ml-2 text-xs text-neutral-400">(draft)</span>}
              </span>
              <span className={e.paid ? "text-[var(--color-pitch)]" : "text-[var(--color-flame)]"}>
                {e.paid ? "paid" : "unpaid"}
              </span>
              <form action={togglePaid}>
                <input type="hidden" name="entry_id" value={e.id} />
                <input type="hidden" name="paid" value={(!e.paid).toString()} />
                <button className="rounded border px-2 py-0.5 text-xs">{e.paid ? "mark unpaid" : "mark paid"}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {/* Result override */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-bold">Match results</h2>
        <p className="mb-3 text-xs text-neutral-500">Manual overrides stick — the feed won&apos;t overwrite them until you clear the override.</p>
        {(matches ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500">No matches yet. They appear after the first results sync.</p>
        ) : (
          <ul className="space-y-3">
            {(matches ?? []).map((m) => {
              const home = m.home_team_id ? teamMap.get(m.home_team_id) : undefined;
              const away = m.away_team_id ? teamMap.get(m.away_team_id) : undefined;
              return (
                <li key={m.fixture_id} className="rounded-lg border p-2 text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold">
                      {home?.flag} {home?.name ?? "?"} vs {away?.flag} {away?.name ?? "?"}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {m.stage ?? "—"} {m.needs_attention && "⚠️"} {m.manual_override && "🔒 override"}
                    </span>
                  </div>
                  <form action={overrideResult} className="flex flex-wrap items-center gap-1">
                    <input type="hidden" name="fixture_id" value={m.fixture_id} />
                    <input type="number" name="home_goals" defaultValue={m.home_goals ?? 0} min={0} className="w-14 rounded border px-1 py-0.5" />
                    <span>–</span>
                    <input type="number" name="away_goals" defaultValue={m.away_goals ?? 0} min={0} className="w-14 rounded border px-1 py-0.5" />
                    <select name="winner" className="rounded border px-1 py-0.5">
                      <option value="none">winner…</option>
                      {home && <option value={home.id}>{home.name}</option>}
                      {away && <option value={away.id}>{away.name}</option>}
                      <option value="draw">draw</option>
                    </select>
                    <button className="rounded bg-[var(--color-pitch)] px-2 py-0.5 text-xs font-semibold text-white">save</button>
                  </form>
                  {m.manual_override && (
                    <form action={clearOverride} className="mt-1">
                      <input type="hidden" name="fixture_id" value={m.fixture_id} />
                      <button className="text-xs text-neutral-500 underline">clear override</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Link href="/" className="block text-center text-sm text-[var(--color-pitch)] underline">← Back to pool</Link>
    </div>
  );
}
