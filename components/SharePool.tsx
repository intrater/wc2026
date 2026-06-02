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
      className="w-full rounded-xl border-2 border-dashed border-[var(--color-pitch)]/40 bg-white px-4 py-3 font-bold text-[var(--color-pitch-dark)] transition hover:bg-[var(--color-pitch)]/5"
    >
      {copied ? "✅ Link copied — send it to your friends!" : "📣 Invite friends to the pool"}
    </button>
  );
}
