"use client";

import { useState, useTransition } from "react";
import { setDigestOptIn } from "./actions";

/**
 * Opt-in switch for the ~7am ET digest email. Optimistic: flips immediately,
 * reverts with an inline error if the server action fails.
 */
export function DigestToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    startTransition(async () => {
      const result = await setDigestOptIn(next);
      if (result.error) {
        setOn(!next);
        setError(result.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-3 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="text-sm font-semibold">Email me the digest every morning</span>
          <span className="block text-xs text-muted-foreground">
            Lands around 7am ET on match days. Unsubscribe anytime.
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Email me the digest every morning"
          onClick={toggle}
          disabled={pending}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            on ? "bg-neon" : "bg-muted"
          } ${pending ? "opacity-70" : ""}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background transition-transform ${
              on ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}
