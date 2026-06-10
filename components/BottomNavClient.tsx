"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface BottomNavItem {
  href: string;
  label: string;
  icon: "home" | "matches" | "digest" | "team" | "dev";
  /** Path prefixes that mark this tab active ("/" must match exactly). */
  active: string[];
}

/**
 * App-Store-style floating glass tab bar. Fixed to the bottom, blurred and
 * translucent, with the active tab in neon. Pure presentation — which tabs
 * exist (and their gating) is decided server-side in BottomNav.
 */
export function BottomNavClient({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname();
  const isActive = (prefixes: string[]) =>
    prefixes.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="mx-auto flex max-w-md items-stretch justify-around rounded-[26px] border border-white/10 bg-background/60 px-2 py-1.5 shadow-2xl backdrop-blur-2xl">
        {items.map((item) => {
          const active = isActive(item.active);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                active ? "text-neon" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <TabIcon name={item.icon} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function TabIcon({ name }: { name: BottomNavItem["icon"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-6 w-6",
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="m3 9.5 9-7 9 7V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M9 22v-8h6v8" />
        </svg>
      );
    case "matches":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "digest":
      return (
        <svg {...common}>
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2" />
          <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "dev":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
  }
}
