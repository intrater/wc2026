// Decorative backdrop for the home page: staggered rows of frosted-glass discs
// scattered across the space between the top of the page and the leaderboard
// card. Discs don't travel — each position stacks GLYPHS complete discs
// (glass ring + flag as ONE element) that take turns popping in, holding, and
// dissolving, so the position returns wearing a different flag. One animation
// per element: a bubble can never appear without its flag, even when iOS
// Safari throttles animations. A mask keeps an open pocket around "THE POOL"
// headline and dissolves the field before the leaderboard. Styles live in
// globals.css under "Flag field".
import { SEED_TEAMS } from "@/lib/tiers/seed";
import { FlagFieldRemount } from "./FlagFieldRemount";

const FLAGS = SEED_TEAMS.map((t) => t.flag);
const ROWS = 3;
const PER_ROW = 16;
// Flags shown per position before the rotation repeats. Each glyph's cycle is
// GLYPHS × the disc's pop cycle, switching at pop boundaries (disc hidden).
const GLYPHS = 3;

export function FlagField() {
  return (
    <div aria-hidden className="flag-field">
      <FlagFieldRemount>
      {Array.from({ length: ROWS }).map((_, r) => (
        <div key={r} className="flag-row">
          {Array.from({ length: PER_ROW }).map((_, i) => {
            // Deterministic pseudo-random cycle per disc (no Math.random —
            // server-rendered markup must be stable across renders). The
            // duration/offset pair is unique for all 48 positions, so no two
            // discs ever leave in lockstep.
            const n = r * PER_ROW + i;
            const duration = 7 + ((n * 13) % 6); // 7–12s pop cycles
            const delay = -((n * 47) % 13); // negative: mid-cycle on load
            // Organic scatter: per-disc size and position jitter (CSS vars so
            // the mobile media query can still rescale the base size).
            const sizeMult = [0.78, 1, 1.18][(n * 5) % 3];
            const jitterY = ((n * 29) % 19) - 9; // -9..9px
            const jitterX = ((n * 11) % 17) - 4; // -4..12px
            // Slow drift while visible (consumed by the glyph keyframes).
            const driftX = ((n * 23) % 21) - 10; // -10..10px
            const driftY = ((n * 31) % 17) - 8; // -8..8px
            return (
              <span
                key={i}
                className="flag-chip"
                style={
                  {
                    "--size-mult": sizeMult,
                    "--jy": `${jitterY}px`,
                    "--jx": `${jitterX}px`,
                    "--dx": `${driftX}px`,
                    "--dy": `${driftY}px`,
                  } as React.CSSProperties
                }
              >
                {Array.from({ length: GLYPHS }).map((_, g) => (
                  <span
                    key={g}
                    className="flag-glyph"
                    style={{
                      animationDuration: `${duration * GLYPHS}s`,
                      animationDelay: `${delay}s`,
                    }}
                  >
                    {/* 7 and 17 are coprime with 48: ×7 scatters tiers across
                        positions, +17 per rotation keeps every flag on screen
                        exactly once per glyph slot. */}
                    {FLAGS[(n * 7 + g * 17) % FLAGS.length]}
                  </span>
                ))}
              </span>
            );
          })}
        </div>
      ))}
      </FlagFieldRemount>
    </div>
  );
}
