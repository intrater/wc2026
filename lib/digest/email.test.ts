import { describe, it, expect } from "vitest";
import type { RecapStats } from "@/lib/db/types";
import { buildDigestText, digestSubject, hookFor, ordinal } from "./email";
import type { DocketItem } from "./docket";

function stats(over: Partial<RecapStats> = {}): RecapStats {
  return {
    dayNumber: 3,
    results: [
      {
        fixtureId: 100,
        stage: "group",
        groupLabel: "A",
        home: { name: "Mexico", flag: "🇲🇽", goals: 2 },
        away: { name: "South Africa", flag: "🇿🇦", goals: 0 },
        decidedBy: "regulation",
      },
    ],
    entries: [
      { entryId: "a", displayName: "Alice", total: 16, pointsToday: 12, rank: 1, rankDelta: 4 },
      { entryId: "b", displayName: "Bob", total: 14, pointsToday: 2, rank: 2, rankDelta: 0 },
      { entryId: "c", displayName: "Carol", total: 10, pointsToday: null, rank: 3, rankDelta: null },
    ],
    topGainer: "Alice",
    biggestFaller: null,
    upsets: [],
    goalBonusStandouts: [],
    topThree: ["Alice", "Bob", "Carol"],
    ...over,
  };
}

const docketItem: DocketItem = {
  fixtureId: 200,
  kickoffET: "12:00 PM",
  contextLabel: "Group D",
  home: { name: "USA", flag: "🇺🇸" },
  away: { name: "Wales", flag: "🏴" },
  live: null,
};

function textInput(over: Partial<Parameters<typeof buildDigestText>[0]> = {}) {
  return buildDigestText({
    stats: stats(),
    narrative: "What a day in the pool.",
    dayLabel: "Friday, June 12",
    todayLabel: "Saturday, June 13",
    docket: [docketItem],
    siteUrl: "https://wc2026.example.com",
    unsubscribeUrl: "https://wc2026.example.com/unsubscribe?uid=u&sig=s",
    ...over,
  });
}

describe("ordinal", () => {
  it("handles standard and teen suffixes", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st",
    ]);
  });
});

describe("hookFor / digestSubject", () => {
  it("prefers the biggest upset, then the top gainer, then the leader", () => {
    expect(hookFor(stats({ upsets: [{ teamName: "Morocco", label: "Upset win (+4)", points: 4 }] })))
      .toBe("Morocco shocker (+4)");
    expect(hookFor(stats())).toBe("Alice had a day");
    expect(hookFor(stats({ topGainer: null }))).toBe("Alice leads the pool");
    expect(hookFor(stats({ topGainer: null, topThree: [] }))).toBe("Full results inside");
  });

  it("builds the subject from the day number and hook", () => {
    expect(digestSubject(stats())).toBe("Day 3 digest: Alice had a day ⚽️");
  });
});

describe("buildDigestText", () => {
  it("includes narrative, results, movers with rank story, top three, docket, links", () => {
    const text = textInput();
    expect(text).toContain("Day 3 digest — Friday, June 12");
    expect(text).toContain("What a day in the pool.");
    expect(text).toContain("🇲🇽 Mexico 2–0 South Africa 🇿🇦");
    expect(text).toContain("Alice +12 (5th → 1st)"); // prevRank = rank + rankDelta
    expect(text).toContain("Bob +2"); // rankDelta 0 → no parens
    expect(text).not.toContain("Bob +2 ("); // explicitly no rank story
    expect(text).toContain("1. Alice  ·  2. Bob  ·  3. Carol");
    expect(text).toContain("TODAY'S DOCKET — Saturday, June 13");
    expect(text).toContain("12:00 PM ET — 🇺🇸 USA vs Wales 🏴 (Group D)");
    expect(text).toContain("Full digest: https://wc2026.example.com/digest");
    expect(text).toContain("Unsubscribe: https://wc2026.example.com/unsubscribe?uid=u&sig=s");
  });

  it("falls back to the box-score intro when the narrative is null", () => {
    const text = textInput({ narrative: null });
    expect(text).toContain("The robot pundit was speechless last night");
    expect(text).toContain("THE NUMBERS");
  });

  it("renders the rest-day docket", () => {
    const text = textInput({ docket: [] });
    expect(text).toContain("No matches today — rest day.");
  });

  it("marks penalties and postponed results", () => {
    const text = textInput({
      stats: stats({
        results: [
          {
            fixtureId: 1,
            stage: "r16",
            groupLabel: null,
            home: { name: "Brazil", flag: "🇧🇷", goals: 1 },
            away: { name: "Morocco", flag: "🇲🇦", goals: 1 },
            decidedBy: "penalties",
          },
          {
            fixtureId: 2,
            stage: "group",
            groupLabel: "B",
            home: { name: "USA", flag: "🇺🇸", goals: 0 },
            away: { name: "Wales", flag: "🏴", goals: 0 },
            decidedBy: null,
            postponed: true,
          },
        ],
      }),
    });
    expect(text).toContain("🇧🇷 Brazil 1–1 Morocco 🇲🇦 (pens)");
    expect(text).toContain("🇺🇸 USA vs Wales 🏴 — postponed");
  });

  it("lists upsets by label (points already embedded)", () => {
    const text = textInput({
      stats: stats({ upsets: [{ teamName: "Morocco", label: "Upset win (+4)", points: 4 }] }),
    });
    expect(text).toContain("Morocco — Upset win (+4)");
  });
});
