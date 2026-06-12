import { verifyDigestSig } from "@/lib/digest/token";
import { Button } from "@/components/ui/button";
import { confirmSubscribe } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Digest email subscribe landing — the mirror of /unsubscribe. Works without
 * login (the link's HMAC is the authorization), so a "get this daily" link in
 * an email is genuinely one tap even for logged-out entrants. A confirm button
 * (POST) does the actual flip so mail scanners that prefetch GET links can't
 * silently subscribe anyone.
 */
export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ uid?: string; sig?: string; done?: string }>;
}) {
  const { uid = "", sig = "", done } = await searchParams;

  if (done === "1") {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-extrabold">You&apos;re in. ☕</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The digest lands in your inbox around 7am ET every morning. Unsubscribe
          anytime — every email has a link.
        </p>
        <a href="/" className="mt-4 inline-block font-semibold text-neon hover:underline">
          Back to the pool →
        </a>
      </Shell>
    );
  }

  const secret = process.env.DIGEST_LINK_SECRET;
  const valid = !!secret && verifyDigestSig(uid, sig, secret);

  if (!valid) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-extrabold">This link isn&apos;t valid.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been truncated by your email app. You can also turn on the
          daily email from the{" "}
          <a href="/digest" className="font-semibold text-neon hover:underline">
            Digest page
          </a>
          .
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-2xl font-extrabold">Morning digest, daily?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        One email around 7am ET: last night&apos;s recap, the movers, and today&apos;s
        slate. Unsubscribe anytime.
      </p>
      <form action={confirmSubscribe} className="mt-4">
        <input type="hidden" name="uid" value={uid} />
        <input type="hidden" name="sig" value={sig} />
        <Button type="submit" className="glow-neon bg-neon font-extrabold text-neon-foreground hover:bg-neon/90">
          Email me the digest daily
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="rounded-2xl border border-border bg-card px-6 py-8 shadow-xl">{children}</div>
    </div>
  );
}
