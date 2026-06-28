import Link from "next/link";
import { redirect } from "next/navigation";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { loadMathData } from "@/lib/math/load";
import { PageTitle } from "@/components/PageTitle";
import { ManagerGrid } from "@/components/ManagerGrid";

export const dynamic = "force-dynamic";

export default async function MathPage() {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  const data = await loadMathData();

  return (
    <div className="space-y-5">
      <div className="text-center">
        <PageTitle sub={<>Every manager, every team, every point — and exactly where each one comes from.</>}>
          Check the Math
        </PageTitle>
      </div>

      {data ? (
        <ManagerGrid data={data} />
      ) : (
        <p className="text-center text-muted-foreground">Nothing to show yet — points appear once games are played.</p>
      )}

      <p className="text-center">
        <Link href="/" className="text-sm font-semibold text-neon hover:underline">
          ← Back to leaderboard
        </Link>
      </p>
    </div>
  );
}
