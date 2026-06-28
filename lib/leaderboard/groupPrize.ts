// Who won the group-stage money. The two group-stage prizes (most points, runner-up)
// lock on group_stage_total once the group stage is complete — and that column is frozen
// thereafter (knockout points land in `total`, not `group_stage_total`), so the winners
// stay correct through the knockouts. Ties break by underdog then upset points (Spec §5.6).

export interface GroupPrizeRow {
  entryId: string;
  groupStageTotal: number;
  underdogTotal: number;
  upsetTotal: number;
}

export interface GroupPrize {
  place: 1 | 2;
  label: string; // "Group stage winner" / "Group-stage runner-up"
  amount: string; // formatted, e.g. "$405"
}

/**
 * Returns entry_id → prize for the top two by group_stage_total. Empty until the group
 * stage is complete (so it never crowns a "winner" mid-stage).
 */
export function computeGroupPrizes(
  rows: GroupPrizeRow[],
  complete: boolean,
  leaderAmount: string,
  runnerUpAmount: string,
): Map<string, GroupPrize> {
  const out = new Map<string, GroupPrize>();
  if (!complete) return out;
  const sorted = [...rows].sort(
    (a, b) =>
      b.groupStageTotal - a.groupStageTotal ||
      b.underdogTotal - a.underdogTotal ||
      b.upsetTotal - a.upsetTotal,
  );
  if (sorted[0]) out.set(sorted[0].entryId, { place: 1, label: "Group stage winner", amount: leaderAmount });
  if (sorted[1]) out.set(sorted[1].entryId, { place: 2, label: "Group-stage runner-up", amount: runnerUpAmount });
  return out;
}
