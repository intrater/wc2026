// Transactional pick-receipt email (UX5). Sends via SMTP (Resend, smtp.resend.com) when
// configured; otherwise logs so local/dev still works. Magic-link emails are sent by
// Supabase Auth (also configured to use the same Resend SMTP).
import nodemailer from "nodemailer";

interface ReceiptPick {
  tierNo: number;
  teamName: string;
  flag: string;
}

async function deliver(
  to: string,
  subject: string,
  text: string,
): Promise<{ sent: boolean; reason?: string }> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM ?? user;

  if (!host || !user || !pass) {
    console.log(`[email] (SMTP not configured) would email ${to}: ${subject}\n${text}`);
    return { sent: false, reason: "no_smtp" };
  }

  try {
    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: false, // STARTTLS on 587
      auth: { user, pass },
    });
    await transport.sendMail({ from, to, subject, text });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "send_failed" };
  }
}

export async function sendPickReceipt(
  to: string,
  displayName: string,
  picks: ReceiptPick[],
): Promise<{ sent: boolean; reason?: string }> {
  const rows = picks
    .sort((a, b) => a.tierNo - b.tierNo)
    .map((p) => `Tier ${p.tierNo}: ${p.flag} ${p.teamName}`)
    .join("\n");
  const text = `Thanks ${displayName}! Your World Cup 2026 pool entry is in.\n\nYour 12 picks:\n${rows}\n\nYou can edit them via your sign-in link until the tournament kicks off. Good luck! ⚽️`;
  return deliver(to, "Your World Cup 2026 pool picks ⚽️", text);
}

/** Notify the pool admin when an entrant submits for the first time. */
export async function sendEntryNotification(displayName: string): Promise<{ sent: boolean; reason?: string }> {
  const admin = process.env.ADMIN_EMAIL ?? "john.intrater@gmail.com";
  const text = `${displayName} just submitted their World Cup 2026 pool picks.`;
  return deliver(admin, `New pool entry: ${displayName} ⚽️`, text);
}
