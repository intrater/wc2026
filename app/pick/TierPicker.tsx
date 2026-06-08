"use client";

import { useState, useTransition } from "react";
import { savePick, submitEntry } from "./actions";

export interface PickerTeam {
  id: number;
  name: string;
  flag: string;
  odds: string | null;
}
export interface PickerTier {
  tierNo: number;
  label: string;
  goalBonus: boolean; // tiers 7-12
  teams: PickerTeam[];
}

export function TierPicker({
  tiers,
  initialPicks,
  initialSubmitted,
}: {
  tiers: PickerTier[];
  initialPicks: Record<number, number>;
  initialSubmitted: boolean;
}) {
  const [picks, setPicks] = useState<Record<number, number>>(initialPicks);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  // Default to read-only once an entry is in; the user opts back into editing.
  const [editing, setEditing] = useState(!initialSubmitted);
  const [error, setError] = useState<string | null>(null);
  const [savingTier, setSavingTier] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const count = Object.keys(picks).length;
  const complete = count === tiers.length;
  const teamById = (tier: PickerTier, id?: number) => tier.teams.find((t) => t.id === id);

  function choose(tierNo: number, teamId: number) {
    setError(null);
    const prev = picks[tierNo];
    setPicks((p) => ({ ...p, [tierNo]: teamId })); // optimistic
    setSavingTier(tierNo);
    startTransition(async () => {
      const res = await savePick(tierNo, teamId);
      setSavingTier(null);
      if (res.error) {
        setError(res.error);
        setPicks((p) => (prev ? { ...p, [tierNo]: prev } : Object.fromEntries(Object.entries(p).filter(([k]) => Number(k) !== tierNo))));
      }
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitEntry();
      if (res.error) setError(res.error);
      else {
        setSubmitted(true);
        setEditing(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  // ---------- READ-ONLY VIEW (entry submitted, not editing) ----------
  if (submitted && !editing) {
    return (
      <div className="space-y-5">
        <CompletedCard onEdit={() => setEditing(true)} />
        {tiers.map((tier) => {
          const team = teamById(tier, picks[tier.tierNo]);
          return (
            <section key={tier.tierNo} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="font-mono text-neon">{String(tier.tierNo).padStart(2, "0")}</span> · {tier.label}
                </h2>
                {tier.goalBonus && (
                  <span className="rounded-full bg-neon/15 px-2 py-0.5 text-xs font-semibold text-neon">
                    ⚽ goals score points
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-neon/60 bg-neon/10 px-3 py-3">
                <span className="text-2xl">{team?.flag ?? "❓"}</span>
                <span className="font-semibold">{team?.name ?? "No pick"}</span>
                <span className="ml-auto text-neon">✓</span>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  // ---------- EDIT VIEW ----------
  return (
    <div className="space-y-5 pb-28">
      {submitted && (
        <div className="flex items-center justify-between rounded-xl border border-neon/40 bg-neon/10 p-4 text-foreground">
          <span>✏️ Editing your entry — changes save as you pick.</span>
          <button onClick={() => setEditing(false)} className="text-sm font-semibold text-neon underline">
            Done
          </button>
        </div>
      )}

      {tiers.map((tier) => (
        <section key={tier.tierNo} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              <span className="font-mono text-neon">{String(tier.tierNo).padStart(2, "0")}</span>{" "}
              <span className="font-normal text-muted-foreground">· {tier.label}</span>
            </h2>
            {tier.goalBonus && (
              <span className="rounded-full bg-neon/15 px-2 py-0.5 text-xs font-semibold text-neon">
                ⚽ goals score points
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {tier.teams.map((team) => {
              const selected = picks[tier.tierNo] === team.id;
              return (
                <button
                  key={team.id}
                  onClick={() => choose(tier.tierNo, team.id)}
                  disabled={isPending && savingTier === tier.tierNo}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left transition disabled:opacity-60 ${
                    selected
                      ? "border-neon/60 bg-neon/10 text-foreground"
                      : "border-border bg-background hover:border-neon/40 hover:bg-accent/40"
                  }`}
                >
                  <span className="text-2xl">{team.flag}</span>
                  <span className="flex-1">
                    <span className="block font-semibold leading-tight">{team.name}</span>
                    {team.odds && <span className="text-xs text-muted-foreground">{team.odds}</span>}
                  </span>
                  {selected && <span className="text-neon">✓</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/* Sticky submit bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/85 p-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold">
              {complete ? (
                <span className="text-neon">✅ All 12 picked</span>
              ) : (
                <span className="text-muted-foreground">
                  <span className="font-mono text-foreground">{count}</span> / {tiers.length} tiers picked
                </span>
              )}
            </div>
            {error && <div className="text-xs text-destructive">{error}</div>}
          </div>
          <button
            onClick={submit}
            disabled={!complete || isPending}
            className="rounded-xl bg-neon px-6 py-3 font-extrabold uppercase tracking-wide text-neon-foreground transition-transform active:translate-y-px disabled:opacity-40 disabled:saturate-50 enabled:glow-neon"
          >
            {submitted ? "Save changes" : "Submit entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompletedCard({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-neon/40 bg-neon/10 px-4 py-3">
      <span className="font-semibold text-neon">Your entry is in</span>
      <button
        onClick={onEdit}
        className="text-sm font-semibold text-foreground underline-offset-2 hover:text-neon hover:underline"
      >
        Edit picks
      </button>
    </div>
  );
}
