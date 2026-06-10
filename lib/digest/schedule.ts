// Morning-digest send window. The 3-minute poll calls shouldSendDigest each tick;
// the first tick at/after 7:00am ET with an un-emailed recap for EXACTLY yesterday
// sends. The exact-yesterday gate is load-bearing: older un-emailed recaps stay
// un-emailed forever (no backfill blast when the feature ships mid-tournament),
// and a recap generated late (even after 7am) still sends on the next tick.
import { yesterdayBusinessDay } from "@/lib/matches/day";

export const SEND_AFTER_ET_MINUTES = 7 * 60; // 7:00am ET

const ET_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Minutes since ET midnight for an epoch-ms instant (DST-correct via Intl). */
export function etMinutesOfDay(now: number): number {
  const parts = ET_CLOCK.formatToParts(new Date(now));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export type DigestSendDecision =
  | { send: true }
  | { send: false; reason: "before_window" | "no_recap" | "already_emailed" | "stale_day" };

export function shouldSendDigest(
  now: number,
  recap: { business_day: string; emailed_at: string | null } | null,
): DigestSendDecision {
  if (etMinutesOfDay(now) < SEND_AFTER_ET_MINUTES) return { send: false, reason: "before_window" };
  if (!recap) return { send: false, reason: "no_recap" };
  if (recap.emailed_at) return { send: false, reason: "already_emailed" };
  if (recap.business_day !== yesterdayBusinessDay(now)) return { send: false, reason: "stale_day" };
  return { send: true };
}
