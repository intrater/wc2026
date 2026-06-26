import Link from "next/link";
import { redirect } from "next/navigation";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { loadRaceData } from "@/lib/race/load";
import { PageTitle } from "@/components/PageTitle";
import { RaceCard } from "@/components/RaceCard";

export const dynamic = "force-dynamic";

export default async function RacePage() {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  const data = await loadRaceData();

  return (
    <div className="space-y-5">
      <div className="text-center">
        <PageTitle sub={<>Who needs what over the run-in — who to root for, who to root against.</>}>
          The Race
        </PageTitle>
      </div>

      {data ? (
        <RaceCard data={data} full />
      ) : (
        <p className="text-center text-muted-foreground">
          Nothing to call yet — the race opens up once group games are in flight.
        </p>
      )}

      <p className="text-center">
        <Link href="/" className="text-sm font-semibold text-neon hover:underline">
          ← Back to leaderboard
        </Link>
      </p>
    </div>
  );
}
