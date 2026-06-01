import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="space-y-4 text-center">
      <div className="text-5xl">⚠️</div>
      <h1 className="text-3xl text-[var(--color-pitch-dark)]">Link expired or invalid</h1>
      <p className="text-neutral-600">
        That sign-in link didn&apos;t work — links expire after a while and can only be used
        once.
      </p>
      <Link
        href="/login"
        className="inline-block rounded-lg bg-[var(--color-pitch)] px-5 py-3 font-bold text-white"
      >
        Get a new link
      </Link>
    </div>
  );
}
