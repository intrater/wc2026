// Transactional pick-receipt email (UX5). Sends via the shared SMTP transport
// (lib/email/send.ts) when configured; otherwise logs so local/dev still works.
// Magic-link emails are sent by Supabase Auth (also configured to use Resend SMTP).
import { sendEmail } from "./send";

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
  const rows = picks
    .sort((a, b) => a.tierNo - b.tierNo)
    .map((p) => `Tier ${p.tierNo}: ${p.flag} ${p.teamName}`)
    .join("\n");
  const text = `Thanks ${displayName}! Your World Cup 2026 pool entry is in.\n\nYour 12 picks:\n${rows}\n\nYou can edit them via your sign-in link until the tournament kicks off. Good luck! ⚽️`;
  return sendEmail(to, "Your World Cup 2026 pool picks ⚽️", text);
}

/** Notify the pool admin when an entrant submits for the first time. */
export async function sendEntryNotification(displayName: string): Promise<{ sent: boolean; reason?: string }> {
  const admin = process.env.ADMIN_EMAIL ?? "john.intrater@gmail.com";
  const text = `${displayName} just submitted their World Cup 2026 pool picks.`;
  return sendEmail(admin, `New pool entry: ${displayName} ⚽️`, text);
}
