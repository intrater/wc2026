// Reconcile API-Football team names with our seed names. We match on a normalized key
// and fall back to an alias table for known divergences. Once matched, we store the
// API team id on teams.api_id so future ingests are stable regardless of naming.

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]/g, ""); // strip spaces/punctuation
}

// alias (normalized API name) -> our seed name. Refine on the first live ingest.
export const NAME_ALIASES: Record<string, string> = {
  unitedstates: "USA",
  us: "USA",
  korearepublic: "South Korea",
  southkorea: "South Korea",
  czechrepublic: "Czechia",
  turkiye: "Turkey",
  drcongo: "Congo DR",
  congodr: "Congo DR",
  democraticrepublicofcongo: "Congo DR",
  bosnia: "Bosnia and Herzegovina",
  bosniaherzegovina: "Bosnia and Herzegovina",
  cotedivoire: "Ivory Coast",
  caboverde: "Cape Verde",
  iranislamicrepublic: "Iran",
};

/** Resolve an API team name to our seed name (or null if no confident match). */
export function resolveSeedName(apiName: string, seedNames: Set<string>): string | null {
  const norm = normalizeName(apiName);
  if (NAME_ALIASES[norm]) return NAME_ALIASES[norm];
  // direct normalized match against seed names
  for (const seed of seedNames) {
    if (normalizeName(seed) === norm) return seed;
  }
  return null;
}
