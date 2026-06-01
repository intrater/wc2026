import Link from "next/link";

export const metadata = { title: "How it works · World Cup 2026 Pool" };

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-center text-3xl text-[var(--color-pitch-dark)]">How it works</h1>

      <section className="space-y-2 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">🗂️ Draft 12 teams</h2>
        <p className="text-neutral-700">
          All 48 teams are split into <strong>12 tiers</strong> by their odds — Tier 1 is the
          favorites, Tier 12 is the longshots. You pick <strong>one team from each tier</strong>,
          so everyone ends up with a mix of favorites and underdogs.
        </p>
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">⚽ Earn points all tournament</h2>
        <ul className="list-disc space-y-1 pl-5 text-neutral-700">
          <li><strong>Group stage:</strong> 1 pt a draw, 2 pts a win, +3 for winning your group, +1 for advancing.</li>
          <li><strong>Knockouts:</strong> wins are worth more each round — 2 (Round of 32) up to 10 (final).</li>
          <li><strong>Goal bonus:</strong> your <strong>Tier 7–12</strong> teams earn +1 for every goal they score — so root for the underdogs.</li>
          <li><strong>Upset bonus:</strong> when one of your teams beats a higher-tier team, you get bonus points for the size of the upset.</li>
        </ul>
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">🏆 Win the pool</h2>
        <p className="text-neutral-700">
          Most points overall takes the top prize, with prizes for runner-up and the best
          group-stage run. Picks lock at kickoff and everyone&apos;s teams go public. $100 entry,
          Venmo @john-intrater.
        </p>
      </section>

      <div className="text-center">
        <Link href="/pick" className="inline-block rounded-lg bg-[var(--color-pitch)] px-6 py-3 font-bold text-white">
          Make my picks
        </Link>
      </div>
    </div>
  );
}
