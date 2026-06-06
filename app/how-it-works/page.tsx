import {
  GROUP_POINTS,
  KNOCKOUT_POINTS,
  GOAL_BONUS_PER_GOAL,
  GOAL_BONUS_MIN_TIER,
  UPSET_WIN_PER_TIER,
  UPSET_DRAW_PER_TIER,
} from "@/lib/scoring/constants";

export const metadata = { title: "Scoring · World Cup 2026 Pool" };

function Pts({ v }: { v: number }) {
  return (
    <span className="shrink-0 rounded-full bg-neon/15 px-2.5 py-1 text-sm font-extrabold tabular-nums text-neon">
      +{v}
    </span>
  );
}

function Row({ label, sub, v }: { label: string; sub?: string; v: number }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span>
        <span className="font-semibold">{label}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
      <Pts v={v} />
    </li>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-xl font-bold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      <ul className="mt-2">{children}</ul>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">{children}</p>;
}

export default function ScoringPage() {
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header className="pt-2 text-center">
        <h1 className="text-4xl font-extrabold">
          Scoring <span className="text-neon text-glow">details</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every way to put points on the board. Scoring is <strong className="text-foreground">per team</strong> — each of your
          12 teams earns on its own.
        </p>
      </header>

      <Card title="Group stage">
        <Row label="Win a match" v={GROUP_POINTS.win} />
        <Row label="Draw a match" v={GROUP_POINTS.draw} />
        <Row label="Win your group" sub="finish 1st — instead of the advance bonus, not on top of it" v={GROUP_POINTS.winGroupBonus} />
        <Row label="Advance to the Round of 32" sub="as runner-up or one of the 8 best 3rd-place teams" v={GROUP_POINTS.advanceBonus} />
      </Card>

      <Card title="Knockout rounds" hint="Points go to the team that advances — penalty-shootout wins count.">
        <Row label="Win the Round of 32" v={KNOCKOUT_POINTS.r32} />
        <Row label="Win the Round of 16" v={KNOCKOUT_POINTS.r16} />
        <Row label="Win the Quarterfinal" v={KNOCKOUT_POINTS.qf} />
        <Row label="Win the Semifinal" v={KNOCKOUT_POINTS.sf} />
        <Row label="Win the Final" v={KNOCKOUT_POINTS.final} />
        <Note>The third-place playoff has no round points (goals &amp; upsets there still count).</Note>
      </Card>

      <Card title="Goal bonus" hint={`Only your Tier ${GOAL_BONUS_MIN_TIER}–12 teams.`}>
        <Row
          label="Every goal your team scores"
          sub="open play + penalties, in regulation or extra time — shootout kicks don't count"
          v={GOAL_BONUS_PER_GOAL}
        />
      </Card>

      <Card title="Upset bonus" hint="Stacks on top of everything above.">
        <Row label="Beat a higher-tier team" sub="per tier of the gap" v={UPSET_WIN_PER_TIER} />
        <Row label="Draw a higher-tier team" sub="per tier of the gap" v={UPSET_DRAW_PER_TIER} />
        <Note>
          Example: your <strong>Tier 10</strong> team beats a <strong>Tier 3</strong> in the Round of 16 →
          +{KNOCKOUT_POINTS.r16} for the round and +{7 * UPSET_WIN_PER_TIER} for the upset ={" "}
          <strong>+{KNOCKOUT_POINTS.r16 + 7 * UPSET_WIN_PER_TIER}</strong>.
        </Note>
      </Card>

    </div>
  );
}
