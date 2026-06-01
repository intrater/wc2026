"use client";

import { useActionState } from "react";
import { sendMagicLink, type MagicLinkState } from "@/lib/auth/actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<MagicLinkState, FormData>(
    sendMagicLink,
    {},
  );

  if (state.ok) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-5xl">📬</div>
        <h1 className="text-3xl text-[var(--color-pitch-dark)]">Check your email</h1>
        <p className="text-neutral-600">
          We sent a sign-in link to <strong>{state.email}</strong>. Tap it to make or edit
          your picks.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="text-center">
        <div className="text-5xl">🏆</div>
        <h1 className="mt-2 text-3xl text-[var(--color-pitch-dark)]">Join the Pool</h1>
        <p className="mt-1 text-neutral-600">
          Enter your name and email to draft your 12 teams. We&apos;ll email you a link —
          no password.
        </p>
      </div>

      <form action={formAction} className="space-y-4 rounded-2xl bg-white p-6 shadow-lg">
        <label className="block">
          <span className="text-sm font-semibold">Your name</span>
          <input
            name="display_name"
            required
            placeholder="Justin Dross"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-lg"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-lg"
          />
        </label>
        {state.error && <p className="text-sm text-[var(--color-flame)]">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-[var(--color-pitch)] px-4 py-3 text-lg font-bold text-white disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send my sign-in link"}
        </button>
      </form>

      <p className="text-center text-sm text-neutral-500">
        Already entered? Use the same email — the link lets you edit until kickoff.
      </p>
    </div>
  );
}
