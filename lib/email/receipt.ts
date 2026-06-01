// Transactional pick-receipt email (UX5).
// Uses Resend if RESEND_API_KEY is set; otherwise logs (so local/dev works without email).
// Magic-link emails are handled by Supabase Auth separately.

interface ReceiptPick {
  tierNo: number;
  teamName: string;
  flag: string;
}

export async function sendPickReceipt(
  to: string,
  displayName: string,
  picks: ReceiptPick[],
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "World Cup Pool <onboarding@resend.dev>";

  const rows = picks
    .sort((a, b) => a.tierNo - b.tierNo)
    .map((p) => `Tier ${p.tierNo}: ${p.flag} ${p.teamName}`)
    .join("\n");
  const text = `Thanks ${displayName}! Your World Cup 2026 pool entry is in.\n\nYour 12 picks:\n${rows}\n\nYou can edit them via your sign-in link until the tournament kicks off. Good luck!`;

  if (!apiKey) {
    console.log(`[receipt] (no RESEND_API_KEY) would email ${to}:\n${text}`);
    return { sent: false, reason: "no_email_provider" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: "Your World Cup 2026 pool picks ⚽️",
        text,
      }),
    });
    if (!res.ok) return { sent: false, reason: `resend_${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "send_failed" };
  }
}
