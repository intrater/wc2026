import { describe, it, expect } from "vitest";
import { etMinutesOfDay, shouldSendDigest } from "./schedule";

// June 2026 is EDT (UTC-4): 11:00Z = 7:00am ET.
const AT_7AM = Date.parse("2026-06-13T11:00:00Z");
const BEFORE_7AM = Date.parse("2026-06-13T10:59:00Z");
const YESTERDAY = "2026-06-12";

const recap = (over: Partial<{ business_day: string; emailed_at: string | null }> = {}) => ({
  business_day: YESTERDAY,
  emailed_at: null,
  ...over,
});

describe("etMinutesOfDay", () => {
  it("converts UTC instants to ET clock minutes (EDT in June)", () => {
    expect(etMinutesOfDay(AT_7AM)).toBe(7 * 60);
    expect(etMinutesOfDay(BEFORE_7AM)).toBe(6 * 60 + 59);
    expect(etMinutesOfDay(Date.parse("2026-06-13T04:00:00Z"))).toBe(0); // ET midnight
  });
});

describe("shouldSendDigest", () => {
  it("holds before 7:00am ET", () => {
    expect(shouldSendDigest(BEFORE_7AM, recap())).toEqual({ send: false, reason: "before_window" });
  });

  it("sends at the first tick at/after 7:00am ET", () => {
    expect(shouldSendDigest(AT_7AM, recap())).toEqual({ send: true });
    expect(shouldSendDigest(AT_7AM + 3 * 60 * 1000, recap())).toEqual({ send: true });
  });

  it("does nothing on a morning with no recap (rest day yesterday)", () => {
    expect(shouldSendDigest(AT_7AM, null)).toEqual({ send: false, reason: "no_recap" });
  });

  it("never double-sends", () => {
    expect(shouldSendDigest(AT_7AM, recap({ emailed_at: "2026-06-13T11:00:05Z" }))).toEqual({
      send: false,
      reason: "already_emailed",
    });
  });

  it("ignores recaps for any day but exactly yesterday (no backfill blast)", () => {
    expect(shouldSendDigest(AT_7AM, recap({ business_day: "2026-06-10" }))).toEqual({
      send: false,
      reason: "stale_day",
    });
    // A recap dated today shouldn't exist at 7am, but guard anyway.
    expect(shouldSendDigest(AT_7AM, recap({ business_day: "2026-06-13" }))).toEqual({
      send: false,
      reason: "stale_day",
    });
  });

  it("still sends later in the day if the recap appeared after 7am", () => {
    const noonET = Date.parse("2026-06-13T16:00:00Z");
    expect(shouldSendDigest(noonET, recap())).toEqual({ send: true });
  });
});
