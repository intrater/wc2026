"use client";

import { useState } from "react";

/**
 * "Invite friends" CTA. Uses the native share sheet on mobile, falls back to
 * copy-to-clipboard. Shares the pool's public URL (the current origin).
 */
export function SharePool() {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.origin;
    const text = "Join our World Cup 2026 pool — draft 12 teams, one from each tier. 🏆⚽️";
    if (navigator.share) {
      try {
        await navigator.share({ title: "World Cup 2026 Pool", text, url });
        return;
      } catch {
        // user dismissed the share sheet — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      onClick={share}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-4 text-base font-bold text-foreground transition-colors hover:border-neon/50 hover:text-neon"
    >
      {copied ? (
        <span className="text-neon">Link copied — send it to your friends!</span>
      ) : (
        <>
          <ShareIcon />
          Invite friends to the pool
        </>
      )}
    </button>
  );
}

/** iOS-style share glyph: an arrow rising out of a tray. */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
