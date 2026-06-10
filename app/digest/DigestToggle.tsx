"use client";

import { useState, useTransition } from "react";
import { setDigestOptIn } from "./actions";

/**
 * Opt-in switch for the ~7am ET digest email. Lightweight inline row (no card)
 * that reads as a question when off and a status when on. Optimistic: flips
 * immediately, reverts with an inline error if the server action fails.
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
    <div className="text-center">
      <div className="inline-flex items-center justify-center gap-2.5 text-xs">
        {on ? (
          <span className="font-semibold text-neon">✓ Signed up for morning emails</span>
        ) : (
          <span className="text-muted-foreground">
            Want these in your inbox every morning (~7am ET)?
          </span>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Sign up for daily digest emails"
          onClick={toggle}
          disabled={pending}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            on ? "bg-neon" : "bg-muted"
          } ${pending ? "opacity-70" : ""}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${
              on ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
