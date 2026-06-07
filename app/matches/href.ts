/** Single home for the calendar's URL state (?date + ?mine) — used by DayNav and
 * MyTeamsFilter so the two controls can never drop each other's param. */
export function matchesHref({ date, mine }: { date: string | null; mine: boolean }): string {
  const q = new URLSearchParams();
  if (date) q.set("date", date);
  if (mine) q.set("mine", "1");
  const qs = q.toString();
  return qs ? `/matches?${qs}` : "/matches";
}
