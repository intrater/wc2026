// Seed teams + tiers into the database from the canonical tier list.
// Run: node --env-file=.env.local scripts/seed.ts
import { createClient } from "@supabase/supabase-js";
import { SEED_TEAMS, TIER_COUNT, TEAMS_PER_TIER } from "../lib/tiers/seed.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env vars");

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  if (SEED_TEAMS.length !== TIER_COUNT * TEAMS_PER_TIER) {
    throw new Error(`seed has ${SEED_TEAMS.length} teams, expected ${TIER_COUNT * TEAMS_PER_TIER}`);
  }

  const { count } = await supabase.from("teams").select("*", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    console.log(`teams already seeded (${count}); skipping. (Delete tiers+teams to re-seed.)`);
    return;
  }

  // Insert teams, capturing generated ids.
  const { data: teams, error: teamErr } = await supabase
    .from("teams")
    .insert(SEED_TEAMS.map((t) => ({ name: t.name, flag: t.flag })))
    .select("id, name");
  if (teamErr) throw teamErr;

  const idByName = new Map(teams!.map((t) => [t.name, t.id]));

  // Insert tiers.
  const tierRows = SEED_TEAMS.map((t) => ({
    team_id: idByName.get(t.name)!,
    tier_no: t.tier,
    odds: t.odds,
  }));
  const { error: tierErr } = await supabase.from("tiers").insert(tierRows);
  if (tierErr) throw tierErr;

  console.log(`Seeded ${teams!.length} teams across ${TIER_COUNT} tiers.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("seed failed:", e.message ?? e);
  process.exit(1);
});
