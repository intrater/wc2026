import Link from "next/link";
import { redirect } from "next/navigation";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { loadRaceData } from "@/lib/race/load";
import { loadFinishRace } from "@/lib/race/loadFinish";
import { PageTitle } from "@/components/PageTitle";
import { RaceCard } from "@/components/RaceCard";
import { RaceToFinishCard } from "@/components/RaceToFinishCard";

export const dynamic = "force-dynamic";

export default async function RacePage() {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  // Knockouts: the finish-line money race. Group stage: the group-money rooting guide.
  const finish = await loadFinishRace();
  const group = finish ? null : await loadRaceData();

  return (
    <div className="space-y-5">
      <div className="text-center">
        <PageTitle
          sub={
            finish ? (
              <>The chase for the last two prizes — champion and runner-up.</>
            ) : (
              <>The group-stage money race — who&apos;s in the hunt, and who to root for or against.</>
            )
          }
        >
          {finish ? <>Race to the Finish</> : <>The Race</>}
        </PageTitle>
      </div>

      {finish ? (
        <RaceToFinishCard data={finish} full />
      ) : group ? (
        <RaceCard data={group} full />
      ) : (
        <p className="text-center text-muted-foreground">
          Nothing to call yet — the race opens up once games are in flight.
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
