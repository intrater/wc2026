"use client";

import { useEffect } from "react";

/**
 * On load, bring the schedule's "now" line into the middle of the viewport so the
 * continuous scroll opens on what's happening (U5). Falls back to the schedule's end
 * (latest matches) when there's no upcoming match to anchor on — e.g. tournament over.
 * Runs once, without smooth animation, so there's no visible jump.
 */
export function ScrollToNow() {
  useEffect(() => {
    const target = document.getElementById("now") ?? document.getElementById("schedule-end");
    target?.scrollIntoView({ block: "center" });
  }, []);
  return null;
}
