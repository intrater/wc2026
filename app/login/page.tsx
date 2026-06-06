"use client";

import { useActionState } from "react";
import { sendMagicLink, type MagicLinkState } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<MagicLinkState, FormData>(
    sendMagicLink,
    {},
  );

  if (state.ok) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
        <div className="text-5xl">📬</div>
        <h1 className="text-3xl font-extrabold">Check your email</h1>
        <p className="text-muted-foreground">
          We sent a sign-in link to <strong className="text-foreground">{state.email}</strong>. Tap it to make or edit
          your picks.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pt-6">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-muted-foreground">World Cup 2026</p>
        <h1 className="mt-2 text-4xl font-extrabold">
          Join the <span className="text-neon text-glow">Pool</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Enter your name and email to draft your 12 teams. We&apos;ll email you a link —
          no password.
        </p>
      </div>

      <form action={formAction} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="space-y-1.5">
          <Label htmlFor="display_name">Your name</Label>
          <Input id="display_name" name="display_name" required placeholder="John Intrater" className="h-11 text-base" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="john.intrater@gmail.com" className="h-11 text-base" />
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="glow-neon w-full rounded-xl bg-neon px-4 py-3 text-base font-extrabold uppercase tracking-wide text-neon-foreground transition-transform active:translate-y-px disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send my sign-in link"}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already entered? Use the same email — the link lets you edit until kickoff.
      </p>
    </div>
  );
}
