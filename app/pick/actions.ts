"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/auth/server";
import { sendPickReceipt } from "@/lib/email/receipt";
import { isComplete, missingTiers, type PickMap } from "@/lib/entries/validate";

async function locked(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("lock_at").single();
  const lockAt = data?.lock_at ? new Date(data.lock_at) : null;
  return !!lockAt && lockAt.getTime() <= Date.now();
}

/** Find this user's entry, creating one (draft) if none exists. Returns entry id. */
async function getOrCreateEntryId(): Promise<{ entryId?: string; error?: string }> {
  const ctx = await getUserAndProfile();
  if (!ctx) return { error: "Not signed in." };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("entries")
    .select("id")
    .eq("user_id", ctx.user.id)
    .limit(1)
    .maybeSingle();
  if (existing) return { entryId: existing.id };

  const displayName =
    ctx.profile?.display_name ||
    (ctx.user.user_metadata?.display_name as string | undefined) ||
    ctx.user.email ||
    "Anonymous";

  const { data: created, error } = await supabase
    .from("entries")
    .insert({ user_id: ctx.user.id, display_name: displayName })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { entryId: created.id };
}

export async function savePick(
  tierNo: number,
  teamId: number,
): Promise<{ ok?: boolean; error?: string }> {
  if (await locked()) return { error: "Picks are locked." };

  const supabase = await createClient();

  // Verify the team genuinely belongs to that tier (anti-tamper).
  const { data: tier } = await supabase
    .from("tiers")
    .select("tier_no")
    .eq("team_id", teamId)
    .single();
  if (!tier || tier.tier_no !== tierNo) return { error: "Invalid team for this tier." };

  const { entryId, error } = await getOrCreateEntryId();
  if (error || !entryId) return { error: error ?? "Could not create entry." };

  const { error: upErr } = await supabase
    .from("picks")
    .upsert({ entry_id: entryId, tier_no: tierNo, team_id: teamId }, { onConflict: "entry_id,tier_no" });
  if (upErr) return { error: upErr.message };

  return { ok: true };
}

export async function submitEntry(): Promise<{ ok?: boolean; error?: string }> {
  if (await locked()) return { error: "Picks are locked." };

  const ctx = await getUserAndProfile();
  if (!ctx) return { error: "Not signed in." };
  const supabase = await createClient();

  const { entryId, error: entryErr } = await getOrCreateEntryId();
  if (entryErr || !entryId) return { error: entryErr ?? "No entry." };

  const { data: picks } = await supabase
    .from("picks")
    .select("tier_no, team_id, teams(name, flag)")
    .eq("entry_id", entryId);

  const map: PickMap = {};
  for (const p of picks ?? []) map[p.tier_no] = p.team_id;
  if (!isComplete(map)) {
    return { error: `Pick a team in every tier — still missing tier ${missingTiers(map).join(", ")}.` };
  }

  const { error: subErr } = await supabase
    .from("entries")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", entryId);
  if (subErr) return { error: subErr.message };

  // Fire-and-forget receipt (UX5).
  const email = ctx.profile?.email ?? ctx.user.email;
  if (email) {
    const receiptPicks = (picks ?? []).map((p) => ({
      tierNo: p.tier_no,
      teamName: (p.teams as unknown as { name: string }).name,
      flag: (p.teams as unknown as { flag: string }).flag,
    }));
    await sendPickReceipt(email, ctx.profile?.display_name ?? "there", receiptPicks);
  }

  return { ok: true };
}
