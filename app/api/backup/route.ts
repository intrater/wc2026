import { type NextRequest, NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly database snapshot (Vercel Cron, daily at 06:00 UTC / 2am ET), authenticated
 * by CRON_SECRET. The free Supabase tier has no backups and no PITR, so this is the
 * pool's disaster-recovery story: dump every public table plus auth users, gzip the
 * JSON, and email it to ADMIN_EMAIL. ~850KB raw / ~100KB gzipped at current size, so
 * an inbox is a perfectly good off-site archive for a 27-entry pool.
 *
 * The table list is discovered from PostgREST's OpenAPI root on every run, so tables
 * added by future migrations are included automatically rather than silently missed.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ ok: false, error: "ADMIN_EMAIL not set" }, { status: 500 });
  }

  // 1) discover every exposed table (exclude RPC entries)
  const specRes = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!specRes.ok) {
    return NextResponse.json({ ok: false, error: `spec fetch failed: ${specRes.status}` }, { status: 500 });
  }
  const spec = (await specRes.json()) as { paths?: Record<string, unknown> };
  const tables = Object.keys(spec.paths ?? {})
    .map((p) => p.replace(/^\//, ""))
    .filter((p) => p && !p.startsWith("rpc/") && !p.includes("{"))
    .sort();

  // 2) dump each table (paginated past PostgREST's 1000-row cap)
  const admin = createAdminClient();
  const dump: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(t).select("*").range(from, from + 999);
      if (error) {
        return NextResponse.json({ ok: false, error: `dump ${t}: ${error.message}` }, { status: 500 });
      }
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    dump[t] = rows;
    counts[t] = rows.length;
  }

  // 3) auth users (logins/emails live in auth schema, not in the public tables)
  const { data: usersPage, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersErr) {
    return NextResponse.json({ ok: false, error: `auth users: ${usersErr.message}` }, { status: 500 });
  }
  counts.auth_users = usersPage.users.length;

  // 4) gzip + email
  const totalRows = Object.values(counts).reduce((s, n) => s + n, 0);
  const exportedAt = new Date().toISOString();
  const day = exportedAt.slice(0, 10);
  const payload = JSON.stringify({ exported_at: exportedAt, tables: dump, auth_users: usersPage.users });
  const gz = gzipSync(Buffer.from(payload));

  const summary = Object.entries(counts)
    .map(([t, n]) => `${t}: ${n}`)
    .join("\n");
  const result = await sendEmail(
    adminEmail,
    `WC2026 DB backup ${day} (${totalRows} rows, ${Math.round(gz.length / 1024)}KB)`,
    `Nightly snapshot of every table + auth users, attached as gzipped JSON.\n\n${summary}\n\nRestore: gunzip the attachment; each table is a JSON array keyed by name.`,
    [{ filename: `wc2026-backup-${day}.json.gz`, content: gz }],
  );

  return NextResponse.json({ ok: result.sent, tables: counts, totalRows, gzipKB: Math.round(gz.length / 1024), email: result });
}
