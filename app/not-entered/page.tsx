/** Landing for signed-in users without a submitted entry once the pool is live. */
export default function NotEnteredPage() {
  return (
    <div className="space-y-3 pt-16 text-center">
      <div className="text-5xl">🔒</div>
      <h1 className="text-3xl font-extrabold">The pool is locked</h1>
      <p className="mx-auto max-w-sm text-muted-foreground">
        The tournament kicked off and entries are closed for this World Cup. This
        one's for the people who got their picks in — catch us in 2030. ⚽️
      </p>
    </div>
  );
}
