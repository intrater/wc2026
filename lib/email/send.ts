// Shared SMTP transport (Resend, smtp.resend.com). Plain-text emails only.
// When SMTP isn't configured (local/dev), logs the would-be email and reports
// { sent: false } so callers can record the outcome without special-casing.
import nodemailer from "nodemailer";

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  attachments?: { filename: string; content: Buffer }[],
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
      requireTLS: true, // refuse to send if STARTTLS can't be negotiated (no plaintext fallback)
      auth: { user, pass },
    });
    await transport.sendMail({ from, to, subject, text, attachments });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "send_failed" };
  }
}
