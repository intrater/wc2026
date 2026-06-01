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
  const [error, setError] = useState<string | null>(null);
  const [savingTier, setSavingTier] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const count = Object.keys(picks).length;
  const complete = count === tiers.length;

  function choose(tierNo: number, teamId: number) {
    if (submitted && picks[tierNo] === teamId) return;
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
      else setSubmitted(true);
    });
  }

  return (
    <div className="space-y-5 pb-28">
      {submitted && (
        <div className="rounded-xl bg-[var(--color-pitch)]/10 p-4 text-center text-[var(--color-pitch-dark)]">
          ✅ Your entry is in! You can keep editing until kickoff. We emailed you a receipt.
        </div>
      )}

      {tiers.map((tier) => (
        <section key={tier.tierNo} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              Tier {tier.tierNo} <span className="font-normal text-neutral-500">· {tier.label}</span>
            </h2>
            {tier.goalBonus && (
              <span className="rounded-full bg-[var(--color-flame)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-flame)]">
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
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-left transition ${
                    selected
                      ? "border-[var(--color-pitch)] bg-[var(--color-pitch)]/10"
                      : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <span className="text-2xl">{team.flag}</span>
                  <span className="flex-1">
                    <span className="block font-semibold leading-tight">{team.name}</span>
                    {team.odds && <span className="text-xs text-neutral-400">{team.odds}</span>}
                  </span>
                  {selected && <span className="text-[var(--color-pitch)]">✓</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/* Sticky submit bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold">{count} / {tiers.length} tiers picked</div>
            {error && <div className="text-xs text-[var(--color-flame)]">{error}</div>}
          </div>
          <button
            onClick={submit}
            disabled={!complete || isPending}
            className="rounded-lg bg-[var(--color-gold)] px-6 py-3 font-bold text-[var(--color-night)] disabled:opacity-50"
          >
            {submitted ? "Update entry" : "Submit entry"}
          </button>
        </div>
      </div>
    </div>
  );
}
