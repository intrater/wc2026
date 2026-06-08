/**
 * The "now" marker in the continuous schedule (U5): a dot + hairline rule, sitting just
 * before the next match that hasn't kicked off. Styled with the card border token so it
 * reads as part of the same surface. Carries id="now" so ScrollToNow can bring it into
 * view on load. Mirrors Google Calendar's current-time line.
 */
export function NowLine() {
  return (
    <div id="now" className="flex items-center py-2" aria-label="Current time">
      <span className="h-3 w-3 shrink-0 rounded-full bg-border" />
      <span className="h-0.5 flex-1 bg-border" />
    </div>
  );
}
