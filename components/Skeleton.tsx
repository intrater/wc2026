/** Shimmer placeholders shaped like the app's cards, shown while server data loads. */

export function SkeletonCard({ rows = 3, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      {header && (
        <div className="border-b border-border px-4 py-3">
          <div className="h-3 w-28 rounded bg-accent/60" />
        </div>
      )}
      <div className="space-y-3 px-4 py-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 flex-1 rounded bg-accent/50" />
            <div className="h-4 w-10 rounded bg-accent/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonHeader() {
  return (
    <div className="flex animate-pulse flex-col items-center gap-3 pt-4">
      <div className="h-10 w-52 rounded-lg bg-accent/60" />
      <div className="h-3 w-32 rounded bg-accent/50" />
    </div>
  );
}
