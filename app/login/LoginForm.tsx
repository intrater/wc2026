"use client";

import { useState } from "react";
import { useActionState } from "react";
import { sendMagicLink, type MagicLinkState } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Magic-link form with two modes: "join" (name + email, the pre-lock signup
 * funnel) and "signin" (email only, for returning entrants). Post-lock the
 * pool is closed to new entries, so only signin renders.
 */
export function LoginForm({
  locked,
  initialMode,
}: {
  locked: boolean;
  initialMode?: "join" | "signin";
}) {
  const [mode, setMode] = useState<"join" | "signin">(
    locked ? "signin" : (initialMode ?? "join"),
  );
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
          We sent a sign-in link to <strong className="text-foreground">{state.email}</strong>.
          {mode === "join" ? " Tap it to make or edit your picks." : " Tap it and you're back in."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pt-6">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-muted-foreground">World Cup 2026</p>
        {mode === "join" ? (
          <>
            <h1 className="mt-2 text-4xl font-extrabold">
              Join the <span className="text-neon text-glow">Pool</span>
            </h1>
            <p className="mt-2 text-muted-foreground">
              Enter your name and email to draft your 12 teams. We&apos;ll email you a link —
              no password.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-4xl font-extrabold">
              Welcome <span className="text-neon text-glow">Back</span>
            </h1>
            <p className="mt-2 text-muted-foreground">
              Enter your email and we&apos;ll send you a sign-in link. No password.
            </p>
          </>
        )}
      </div>

      <form action={formAction} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-xl">
        {mode === "join" && (
          <div className="space-y-1.5">
            <Label htmlFor="display_name">Your name</Label>
            <Input id="display_name" name="display_name" required maxLength={40} placeholder="John Intrater" className="h-11 text-base" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required maxLength={254} placeholder="john.intrater@gmail.com" className="h-11 text-base" />
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

      {!locked && mode === "join" && (
        <p className="text-center text-sm text-muted-foreground">
          Already in the pool?{" "}
          <button type="button" onClick={() => setMode("signin")} className="font-semibold text-neon hover:underline">
            Sign in instead
          </button>
        </p>
      )}
      {!locked && mode === "signin" && (
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <button type="button" onClick={() => setMode("join")} className="font-semibold text-neon hover:underline">
            Join the pool
          </button>
        </p>
      )}
      {locked && (
        <p className="text-center text-sm text-muted-foreground">
          The pool is locked for new entries — sign-in is for existing entrants.
        </p>
      )}
    </div>
  );
}
