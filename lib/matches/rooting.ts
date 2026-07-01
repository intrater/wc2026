// "Who's rooting for who" on a match: the backers of each team, plus a personalized
// read for the signed-in manager (what YOU want from this game, given your teams and rank).
// Pure — takes owners + viewer context, returns display-ready data. No DB, no React.

export interface Owner {
  entryId: string;
  name: string;
  rank: number; // current leaderboard position (1 = 1st)
}

export interface Backer {
  name: string;
  rank: number;
  isViewer: boolean;
}

export interface YouRead {
  rootFor: "home" | "away" | null; // which side is good for the viewer (null = wash / covered)
  text: string;
}

export interface MatchRooting {
  home: Backer[]; // sorted by rank (best first)
  away: Backer[];
  homeCount: number;
  awayCount: number;
  you: YouRead | null; // null when the viewer has no entry
}

export function computeRooting(params: {
  homeOwners: Owner[];
  awayOwners: Owner[];
  homeName: string;
  awayName: string;
  viewerEntryId: string | null;
  viewerRank: number | null;
}): MatchRooting {
  const { homeOwners, awayOwners, homeName, awayName, viewerEntryId, viewerRank } = params;
  const toBacker = (o: Owner): Backer => ({ name: o.name, rank: o.rank, isViewer: o.entryId === viewerEntryId });
  const byRank = (a: Backer | Owner, b: Backer | Owner) => a.rank - b.rank;
  const home = [...homeOwners].sort(byRank).map(toBacker);
  const away = [...awayOwners].sort(byRank).map(toBacker);

  let you: YouRead | null = null;
  if (viewerEntryId) {
    const ownsHome = homeOwners.some((o) => o.entryId === viewerEntryId);
    const ownsAway = awayOwners.some((o) => o.entryId === viewerEntryId);

    if (ownsHome && ownsAway) {
      you = { rootFor: null, text: `You own both ${homeName} and ${awayName} — you're covered either way.` };
    } else if (ownsHome || ownsAway) {
      const mine = ownsHome ? homeName : awayName;
      const rootFor = ownsHome ? "home" : "away";
      // Note the strongest rival who shares your team — beating THEM needs a different game.
      const sharers = (ownsHome ? homeOwners : awayOwners)
        .filter((o) => o.entryId !== viewerEntryId && viewerRank != null && o.rank < viewerRank)
        .sort(byRank);
      const nuance = sharers.length > 0 ? ` (neutral vs ${sharers[0].name}, who's on ${mine} too)` : "";
      you = { rootFor, text: `You're on ${mine}. Root for ${mine} to advance${nuance}.` };
    } else if (viewerRank != null) {
      // Own neither: root against the side backed by more managers ahead of you.
      const homeAbove = homeOwners.filter((o) => o.rank < viewerRank);
      const awayAbove = awayOwners.filter((o) => o.rank < viewerRank);
      if (homeAbove.length === 0 && awayAbove.length === 0) {
        you = { rootFor: null, text: `You own neither, and nobody ahead of you does either — a free watch.` };
      } else if (homeAbove.length === awayAbove.length) {
        you = { rootFor: null, text: `You own neither — rivals ahead of you are split across both sides, roughly a wash.` };
      } else {
        const rootForHome = homeAbove.length < awayAbove.length;
        const rivals = (rootForHome ? awayAbove : homeAbove).sort(byRank);
        const rootForName = rootForHome ? homeName : awayName;
        const loseName = rootForHome ? awayName : homeName;
        you = {
          rootFor: rootForHome ? "home" : "away",
          text: `You own neither. ${loseName} is backed by ${rivals.length} ahead of you (incl. ${rivals[0].name}) — root for ${rootForName} to knock them back.`,
        };
      }
    }
  }

  return { home, away, homeCount: home.length, awayCount: away.length, you };
}
