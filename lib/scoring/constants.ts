// Scoring point values — single source of truth (Scoring Spec §5). All tunable.

export const GROUP_POINTS = {
  draw: 1,
  win: 2,
  winGroupBonus: 3, // finishing 1st in your group (in lieu of advance bonus)
  advanceBonus: 1, // runner-up or qualifying best-third
} as const;

// Knockout win points by stage (escalating). Third-place playoff has no ladder slot.
export const KNOCKOUT_POINTS: Record<string, number> = {
  r32: 2,
  r16: 3,
  qf: 5,
  sf: 7,
  final: 10,
};

export const GOAL_BONUS_PER_GOAL = 1; // flat
export const GOAL_BONUS_MIN_TIER = 7; // only tiers 7..12 earn goal bonus

export const UPSET_WIN_PER_TIER = 1; // +1 per tier of gap on a win vs a higher-tier team
export const UPSET_DRAW_PER_TIER = 0.5; // +0.5 per tier of gap on a draw vs a higher-tier team

// 8 best third-placed teams advance from 12 groups (2026 format).
export const BEST_THIRDS_ADVANCING = 8;
