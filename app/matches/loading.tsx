/** Instant chrome while the schedule loads (U5): header + a few day rails with card
 * skeletons, matching the continuous scroll layout. */
export default function MatchesLoading() {
  return (
    <div className="animate-pulse space-y-3">
      <header className="text-center">
        <div className="mx-auto h-10 w-48 rounded-lg bg-card" />
      </header>
      <div className="space-y-5">
        {[0, 1].map((d) => (
          <div key={d} className="flex gap-3">
            <div className="flex w-9 shrink-0 flex-col items-start gap-1">
              <div className="h-3 w-7 rounded bg-card" />
              <div className="h-7 w-6 rounded bg-card" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 rounded-xl border border-border bg-card" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
