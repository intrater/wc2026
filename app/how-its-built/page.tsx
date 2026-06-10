import Link from "next/link";
import { PageTitle, TitleAccent } from "@/components/PageTitle";

export const metadata = { title: "How It's Built · World Cup 2026 Pool" };

/**
 * The colophon: what this app is made of and how it runs. Public on purpose —
 * it contains no pool data, and "how did you build this?" deserves a link.
 */
export default function HowItsBuiltPage() {
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageTitle
        sub={
          <>
            The honest answer: I described what I wanted, and{" "}
            <strong className="text-foreground">Claude Code wrote every line</strong>.
          </>
        }
      >
        How It&apos;s <TitleAccent>Built</TitleAccent>
      </PageTitle>

      <Card title="The short version">
        <p className="text-sm leading-relaxed text-muted-foreground">
          This whole thing is a weekend side project. I sat down with{" "}
          <a
            href="https://claude.com/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-neon hover:underline"
          >
            Claude Code
          </a>{" "}
          (Anthropic&apos;s AI coding agent), explained the pool I wanted to run, and we built it
          together in conversation: I made the calls, it wrote the code. No engineers were
          harmed. Or hired.
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            ["10", "days"],
            ["76", "commits"],
            ["8.2k", "lines"],
            ["107", "tests"],
          ].map(([n, label]) => (
            <div key={label} className="rounded-xl border border-border bg-card px-1 py-2.5">
              <div className="font-mono text-xl font-extrabold text-neon">{n}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {label}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="The stack">
        <ul className="divide-y divide-border text-sm">
          {[
            ["Next.js + React", "The website itself, server-rendered on Vercel"],
            ["Tailwind CSS", "The dark indigo + canary yellow design system"],
            ["Supabase", "Postgres database, magic-link login, row-level security"],
            ["Vercel", "Hosting, deploys on every commit, and the every-3-minutes cron"],
            ["API-Football", "Live scores, fixtures, and standings for every match"],
            ["Resend", "Every email: receipts, the kickoff blast, the Morning Digest"],
            ["Claude API", "Claude Opus writes the digest narrative from verified stats each night"],
          ].map(([name, desc]) => (
            <li key={name} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="w-28 shrink-0 font-bold">{name}</span>
              <span className="text-muted-foreground">{desc}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="How the machine runs">
        <ol className="space-y-2.5 text-sm">
          {[
            "Every 3 minutes, a cron job pulls live scores and match results from API-Football.",
            "A scoring engine recomputes every entry from scratch on each pass. It is pure, unit-tested, and impossible to drift.",
            "When the day's last match ends, the night's stats are computed and Claude writes the Morning Digest in its trash-talking pundit voice. It can only use the verified numbers; it is not allowed to invent anything.",
            "At 7am ET the digest emails everyone who opted in, with the day's docket attached.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-mono text-base font-bold text-neon">{i + 1}</span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Decisions I'd defend">
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "A tier draft instead of a bracket: you own 12 teams for the whole tournament, so every match day matters.",
            "Magic links instead of passwords. It's a friends-and-family pool, not a bank.",
            "The daily email is strictly opt-in. Nobody gets spammed into following the World Cup.",
            "Live scores are display-only and never feed the scoring engine. Points only come from final results.",
            "Everything ships straight to production. The tournament is the test environment.",
          ].map((d, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="text-neon">✓</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="pb-4 text-center text-xs text-muted-foreground">
        Yes, Claude also wrote this page. We are both aware of the recursion.{" "}
        <Link href="/" className="font-semibold text-neon hover:underline">
          Back to the pool
        </Link>
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-xl">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
