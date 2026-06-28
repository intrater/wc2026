"use client";

import { useState } from "react";
import type { MathData, MathTeam } from "@/lib/math/load";

const TIERS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Drop a trailing "(+N)" from engine labels — the value is shown separately. */
const clean = (s: string) => s.replace(/\s*\(\+?[\d.]+\)\s*$/, "");

export function ManagerGrid({ data }: { data: MathData }) {
  const [selected, setSelected] = useState<number | null>(null);
  const { managers, teams, knockoutStarted } = data;
  const team = selected != null ? teams[selected] : null;

  return (
    <div className="space-y-3">
      {/* Breakdown panel — appears when you tap any team; identical for every owner. */}
      {team && <TeamPanel team={team} knockoutStarted={knockoutStarted} onClose={() => setSelected(null)} />}

      <p className="text-center text-xs text-muted-foreground">
        Tap any team to see exactly how its points are earned. A team is worth the same to everyone who picked it.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-card">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold">Manager</th>
              {TIERS.map((t) => (
                <th key={t} className="px-2 py-2 text-center font-mono text-[11px] text-muted-foreground">
                  {String(t).padStart(2, "0")}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {managers.map((m, i) => (
              <tr key={m.entryId} className={i % 2 ? "bg-card/40" : ""}>
                <td className="sticky left-0 z-10 truncate bg-inherit px-3 py-1.5 font-medium" style={{ maxWidth: 140 }}>
                  <span className="mr-1 text-[11px] text-muted-foreground">{i + 1}.</span>
                  {m.name}
                </td>
                {m.picks.map((p) => {
                  const tm = teams[p.teamId];
                  const isSel = selected === p.teamId;
                  const out = knockoutStarted && tm && !tm.advanced;
                  return (
                    <td key={p.tier} className="px-0.5 py-1 text-center">
                      <button
                        onClick={() => setSelected(isSel ? null : p.teamId)}
                        title={`${tm?.name ?? ""} — ${tm?.total ?? 0} pts`}
                        className={`flex w-full flex-col items-center rounded-md px-1 py-0.5 transition-colors ${
                          isSel ? "bg-neon/20 ring-1 ring-neon" : "hover:bg-muted/40"
                        } ${out ? "opacity-45" : ""}`}
                      >
                        <span className="text-base leading-none">{tm?.flag}</span>
                        <span className="font-mono text-[11px] tabular-nums text-neon">{tm?.total ?? 0}</span>
                      </button>
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-bold tabular-nums text-neon">{m.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Each manager&apos;s <span className="font-semibold">Total</span> is the sum of their 12 teams above — the exact
        number on the leaderboard.
        {!data.reconciles && (
          <span className="block font-semibold text-destructive">
            ⚠️ A row doesn&apos;t reconcile — recomputing.
          </span>
        )}
      </p>
    </div>
  );
}

function TeamPanel({ team, knockoutStarted, onClose }: { team: MathTeam; knockoutStarted: boolean; onClose: () => void }) {
  return (
    <div className="sticky top-2 z-20 rounded-xl border border-neon/40 bg-card p-3 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{team.flag}</span>
          <div>
            <div className="font-bold">{team.name}</div>
            <div className="text-xs text-muted-foreground">
              Tier <span className="font-mono text-neon">{team.tier != null ? String(team.tier).padStart(2, "0") : "—"}</span>
              {knockoutStarted && (
                <>
                  {" · "}
                  {team.advanced ? (
                    <span className="font-semibold text-neon">✅ advanced (in R32)</span>
                  ) : (
                    <span className="font-semibold text-muted-foreground">❌ eliminated</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40">
          ✕
        </button>
      </div>

      <div className="mt-2 border-t border-border pt-2">
        {team.lines.length > 0 ? (
          <ul className="space-y-0.5 text-sm">
            {team.lines.map((l, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{clean(l.label)}</span>
                <span className="font-mono tabular-nums text-neon">+{l.points}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No points yet.</p>
        )}
        <div className="mt-1.5 flex justify-between border-t border-border pt-1.5 font-bold">
          <span>Team total</span>
          <span className="font-mono tabular-nums text-neon">{team.total}</span>
        </div>
      </div>
    </div>
  );
}
