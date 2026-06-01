// Canonical 12×4 tier seed for World Cup 2026, built from championship odds
// (snapshot 2026-05-31). The admin can re-pull/adjust and then FREEZE before picks open
// (U3). `apiId` is filled in during the first API-Football ingest by matching on name.

export interface SeedTeam {
  name: string;
  flag: string; // emoji
  odds: string; // display only
  tier: number; // 1..12
}

export const SEED_TEAMS: SeedTeam[] = [
  // Tier 1 — the elite
  { name: "Spain", flag: "🇪🇸", odds: "+475", tier: 1 },
  { name: "France", flag: "🇫🇷", odds: "+500", tier: 1 },
  { name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", odds: "+650", tier: 1 },
  { name: "Brazil", flag: "🇧🇷", odds: "+850", tier: 1 },
  // Tier 2 — contenders
  { name: "Argentina", flag: "🇦🇷", odds: "+900", tier: 2 },
  { name: "Portugal", flag: "🇵🇹", odds: "10-1", tier: 2 },
  { name: "Germany", flag: "🇩🇪", odds: "14-1", tier: 2 },
  { name: "Netherlands", flag: "🇳🇱", odds: "22-1", tier: 2 },
  // Tier 3 — dark horses
  { name: "Belgium", flag: "🇧🇪", odds: "35-1", tier: 3 },
  { name: "Norway", flag: "🇳🇴", odds: "35-1", tier: 3 },
  { name: "Colombia", flag: "🇨🇴", odds: "40-1", tier: 3 },
  { name: "Uruguay", flag: "🇺🇾", odds: "50-1", tier: 3 },
  // Tier 4 — solid
  { name: "Morocco", flag: "🇲🇦", odds: "50-1", tier: 4 },
  { name: "USA", flag: "🇺🇸", odds: "60-1", tier: 4 },
  { name: "Switzerland", flag: "🇨🇭", odds: "65-1", tier: 4 },
  { name: "Japan", flag: "🇯🇵", odds: "65-1", tier: 4 },
  // Tier 5 — outsiders
  { name: "Mexico", flag: "🇲🇽", odds: "80-1", tier: 5 },
  { name: "Croatia", flag: "🇭🇷", odds: "80-1", tier: 5 },
  { name: "Ecuador", flag: "🇪🇨", odds: "80-1", tier: 5 },
  { name: "Senegal", flag: "🇸🇳", odds: "90-1", tier: 5 },
  // Tier 6 — longshots
  { name: "Turkey", flag: "🇹🇷", odds: "100-1", tier: 6 },
  { name: "Sweden", flag: "🇸🇪", odds: "100-1", tier: 6 },
  { name: "Austria", flag: "🇦🇹", odds: "150-1", tier: 6 },
  { name: "Canada", flag: "🇨🇦", odds: "200-1", tier: 6 },
  // Tier 7 — deep longshots
  { name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", odds: "200-1", tier: 7 },
  { name: "Ivory Coast", flag: "🇨🇮", odds: "250-1", tier: 7 },
  { name: "Czechia", flag: "🇨🇿", odds: "250-1", tier: 7 },
  { name: "Paraguay", flag: "🇵🇾", odds: "300-1", tier: 7 },
  // Tier 8 — faint hope
  { name: "Egypt", flag: "🇪🇬", odds: "300-1", tier: 8 },
  { name: "Ghana", flag: "🇬🇭", odds: "300-1", tier: 8 },
  { name: "Algeria", flag: "🇩🇿", odds: "350-1", tier: 8 },
  { name: "South Korea", flag: "🇰🇷", odds: "400-1", tier: 8 },
  // Tier 9 — minnows
  { name: "Bosnia and Herzegovina", flag: "🇧🇦", odds: "500-1", tier: 9 },
  { name: "Tunisia", flag: "🇹🇳", odds: "500-1", tier: 9 },
  { name: "Australia", flag: "🇦🇺", odds: "600-1", tier: 9 },
  { name: "Iran", flag: "🇮🇷", odds: "700-1", tier: 9 },
  // Tier 10 — lottery
  { name: "Congo DR", flag: "🇨🇩", odds: "1000-1", tier: 10 },
  { name: "Saudi Arabia", flag: "🇸🇦", odds: "1000-1", tier: 10 },
  { name: "South Africa", flag: "🇿🇦", odds: "1000-1", tier: 10 },
  { name: "Panama", flag: "🇵🇦", odds: "1000-1", tier: 10 },
  // Tier 11 — lottery
  { name: "Cape Verde", flag: "🇨🇻", odds: "1000-1", tier: 11 },
  { name: "Qatar", flag: "🇶🇦", odds: "1500-1", tier: 11 },
  { name: "Uzbekistan", flag: "🇺🇿", odds: "1500-1", tier: 11 },
  { name: "New Zealand", flag: "🇳🇿", odds: "1500-1", tier: 11 },
  // Tier 12 — pure lottery
  { name: "Iraq", flag: "🇮🇶", odds: "1500-1", tier: 12 },
  { name: "Jordan", flag: "🇯🇴", odds: "2500-1", tier: 12 },
  { name: "Curaçao", flag: "🇨🇼", odds: "2500-1", tier: 12 },
  { name: "Haiti", flag: "🇭🇹", odds: "2500-1", tier: 12 },
];

// Sanity invariants enforced wherever the seed is loaded (U3 admin).
export const TIER_COUNT = 12;
export const TEAMS_PER_TIER = 4;
