"use client";

import { useEffect, useState } from "react";

/**
 * Safari suspends compositor-driven CSS animations when a tab backgrounds or
 * the phone locks, and can resume them stuck (discs fade out and never come
 * back). Remounting the subtree on return-to-visible restarts every animation
 * from its declared (negative) delay — mid-cycle, so it reads as continuous.
 * display: contents keeps the wrapper out of the flex layout.
 */
export function FlagFieldRemount({ children }: { children: React.ReactNode }) {
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const restart = () => {
      if (document.visibilityState === "visible") setEpoch((e) => e + 1);
    };
    document.addEventListener("visibilitychange", restart);
    // bfcache restores skip visibilitychange in some Safari versions
    window.addEventListener("pageshow", restart);
    return () => {
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("pageshow", restart);
    };
  }, []);

  return (
    <div key={epoch} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
