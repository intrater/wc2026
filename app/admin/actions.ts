"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIngest } from "@/lib/api-football/ingest";
import { runRecompute } from "@/lib/scoring/persist";

async function assertAdmin() {
  if (!(await isAdmin())) throw new Error("Not authorized");
}

function revalidateAll() {
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/rosters");
}

export async function togglePaid(formData: FormData) {
  await assertAdmin();
  const entryId = String(formData.get("entry_id"));
  const paid = formData.get("paid") === "true";
  const admin = createAdminClient();
  await admin.from("entries").update({ paid }).eq("id", entryId);
  revalidateAll();
}

export async function setLock(formData: FormData) {
  await assertAdmin();
  const raw = String(formData.get("lock_at") ?? "").trim();
  const lockAt = raw ? new Date(raw).toISOString() : null;
  const admin = createAdminClient();
  await admin.from("settings").update({ lock_at: lockAt }).eq("id", true);
  revalidateAll();
}

export async function setComplete(formData: FormData) {
  await assertAdmin();
  const complete = formData.get("complete") === "true";
  const admin = createAdminClient();
  await admin.from("settings").update({ tournament_complete: complete }).eq("id", true);
  revalidateAll();
}

export async function freezeTiers() {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from("settings").update({ tiers_frozen_at: new Date().toISOString() }).eq("id", true);
  revalidateAll();
}

export async function overrideResult(formData: FormData) {
  await assertAdmin();
  const fixtureId = Number(formData.get("fixture_id"));
  const homeGoals = Number(formData.get("home_goals"));
  const awayGoals = Number(formData.get("away_goals"));
  const winnerRaw = String(formData.get("winner") ?? "none");
  const winner_team_id = winnerRaw === "none" || winnerRaw === "draw" ? null : Number(winnerRaw);

  const admin = createAdminClient();
  await admin
    .from("matches")
    .update({
      home_goals: homeGoals,
      away_goals: awayGoals,
      winner_team_id,
      status: "FT",
      manual_override: true,
      needs_attention: false,
      updated_at: new Date().toISOString(),
    })
    .eq("fixture_id", fixtureId);
  await runRecompute(admin);
  revalidateAll();
}

export async function clearOverride(formData: FormData) {
  await assertAdmin();
  const fixtureId = Number(formData.get("fixture_id"));
  const admin = createAdminClient();
  await admin.from("matches").update({ manual_override: false }).eq("fixture_id", fixtureId);
  revalidateAll();
}

export async function runIngestNow() {
  await assertAdmin();
  const admin = createAdminClient();
  try {
    const summary = await runIngest(admin);
    revalidateAll();
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ingest failed" };
  }
}
