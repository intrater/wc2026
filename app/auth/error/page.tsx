import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="space-y-4 pt-10 text-center">
      <div className="text-5xl">⚠️</div>
      <h1 className="text-3xl font-extrabold">Link expired or invalid</h1>
      <p className="text-muted-foreground">
        That sign-in link didn&apos;t work — links expire after a while and can only be used
        once.
      </p>
      <Link
        href="/login"
        className="glow-neon inline-block rounded-xl bg-neon px-5 py-3 font-extrabold uppercase tracking-wide text-neon-foreground"
      >
        Get a new link
      </Link>
    </div>
  );
}
