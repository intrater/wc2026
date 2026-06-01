// Pot + payout math (Scoring Spec §5.6). Pot auto-scales to paid entries.

export interface PayoutSplit {
  champion: number;
  runner_up: number;
  group_leader: number;
}

export interface Payouts {
  potCents: number;
  championCents: number;
  runnerUpCents: number;
  groupLeaderCents: number;
}

export function computePot(paidCount: number, entryFeeCents: number): number {
  return Math.max(0, paidCount) * entryFeeCents;
}

/**
 * Split the pot by percentages, rounding each to whole dollars; any rounding
 * remainder goes to the champion so the parts always sum to the pot.
 */
export function computePayouts(
  paidCount: number,
  entryFeeCents: number,
  split: PayoutSplit,
): Payouts {
  const potCents = computePot(paidCount, entryFeeCents);
  const toWholeDollar = (frac: number) => Math.floor((potCents * frac) / 100) * 100;
  const runnerUpCents = toWholeDollar(split.runner_up);
  const groupLeaderCents = toWholeDollar(split.group_leader);
  const championCents = potCents - runnerUpCents - groupLeaderCents; // remainder → champion
  return { potCents, championCents, runnerUpCents, groupLeaderCents };
}

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
