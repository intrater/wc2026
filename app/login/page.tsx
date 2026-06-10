import { getPhase } from "@/lib/state/phase";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const [phase, { mode }] = await Promise.all([getPhase(), searchParams]);
  // /login?mode=signin lands returning entrants directly on the sign-in form.
  return <LoginForm locked={phase.isLocked} initialMode={mode === "signin" ? "signin" : undefined} />;
}
