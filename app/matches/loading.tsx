/** Instant chrome while a day's matches load (U5) — DayNav + three card skeletons. */
export default function MatchesLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <header className="pt-2 text-center">
        <div className="mx-auto h-9 w-40 rounded-lg bg-card" />
        <div className="mx-auto mt-2 h-4 w-64 rounded bg-card" />
      </header>
      <div className="flex items-center justify-between gap-2">
        <div className="h-9 w-9 rounded-lg border border-border bg-card" />
        <div className="h-6 w-44 rounded bg-card" />
        <div className="h-9 w-9 rounded-lg border border-border bg-card" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
