import { verifyDigestSig } from "@/lib/digest/token";
import { Button } from "@/components/ui/button";
import { confirmUnsubscribe } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Digest email unsubscribe landing — works without login (the link's HMAC is the
 * authorization). A confirm button (POST) does the actual flip so mail scanners
 * that prefetch GET links can't silently unsubscribe anyone. Never reveals
 * whether an account exists; never shows the email.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ uid?: string; sig?: string; done?: string }>;
}) {
  const { uid = "", sig = "", done } = await searchParams;

  if (done === "1") {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-extrabold">You&apos;re unsubscribed. 👋</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No more morning digest emails. You can re-subscribe anytime on the{" "}
          <a href="/digest" className="font-semibold text-neon hover:underline">
            Digest page
          </a>
          .
        </p>
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
          It may have been truncated by your email app. You can also manage the digest
          email from the{" "}
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
      <h1 className="font-display text-2xl font-extrabold">Stop the morning digest email?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You&apos;ll stop getting the ~7am ET email. The digest stays available on the site.
      </p>
      <form action={confirmUnsubscribe} className="mt-4">
        <input type="hidden" name="uid" value={uid} />
        <input type="hidden" name="sig" value={sig} />
        <Button type="submit" variant="destructive">
          Unsubscribe me
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
