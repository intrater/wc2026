"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Damped pull distance (px) at which releasing triggers a refresh.
const TRIGGER = 55;
const MAX_PULL = 90;

/**
 * Soft pull-to-refresh: drag down from the top of the page and release to
 * re-fetch server data in place (router.refresh — no full reload, keeps
 * scroll position). Native browser pull-to-refresh is disabled via
 * overscroll-behavior in globals.css so the two gestures don't fight.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [isPending, startTransition] = useTransition();
  const pullRef = useRef(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const setPullBoth = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      if (window.scrollY > 0) {
        setPullBoth(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      setPullBoth(delta > 0 ? Math.min(delta * 0.4, MAX_PULL) : 0);
    };
    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current >= TRIGGER) {
        startTransition(() => router.refresh());
      }
      setPullBoth(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const visible = pull > 0 || isPending;
  if (!visible) return null;

  const progress = Math.min(pull / TRIGGER, 1);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center"
      style={{ opacity: isPending ? 1 : progress }}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-background/70 shadow-2xl backdrop-blur-xl ${
          isPending ? "animate-spin" : ""
        }`}
        style={isPending ? undefined : { transform: `rotate(${pull * 3}deg)` }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 ${progress >= 1 || isPending ? "text-neon" : "text-muted-foreground"}`}
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      </div>
    </div>
  );
}
