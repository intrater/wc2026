import { getPhase } from "@/lib/state/phase";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const phase = await getPhase();
  return <LoginForm locked={phase.isLocked} />;
}
