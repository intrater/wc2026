// Pot + payout math (Scoring Spec §5.6). Pot auto-scales to paid entries.

export interface PayoutSplit {
  champion: number;
  runner_up: number;
  group_leader: number;
  group_runner_up: number;
}

export interface Payouts {
  potCents: number;
  championCents: number;
  runnerUpCents: number;
  groupLeaderCents: number;
  groupRunnerUpCents: number;
}

export function computePot(entrantCount: number, entryFeeCents: number): number {
  return Math.max(0, entrantCount) * entryFeeCents;
}

/**
 * Split the pot by percentages, rounding each to whole dollars; any rounding
 * remainder goes to the champion so the parts always sum to the pot.
 */
export function computePayouts(
  entrantCount: number,
  entryFeeCents: number,
  split: PayoutSplit,
): Payouts {
  const potCents = computePot(entrantCount, entryFeeCents);
  const toWholeDollar = (frac: number) => Math.floor((potCents * frac) / 100) * 100;
  const runnerUpCents = toWholeDollar(split.runner_up);
  const groupLeaderCents = toWholeDollar(split.group_leader);
  const groupRunnerUpCents = toWholeDollar(split.group_runner_up);
  // remainder → champion, so the parts always sum to the pot
  const championCents = potCents - runnerUpCents - groupLeaderCents - groupRunnerUpCents;
  return { potCents, championCents, runnerUpCents, groupLeaderCents, groupRunnerUpCents };
}

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
