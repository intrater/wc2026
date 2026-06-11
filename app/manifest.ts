import type { MetadataRoute } from "next";

/**
 * Web app manifest. display: "browser" is deliberate — iOS 17+ otherwise opens
 * Add-to-Home-Screen icons as a standalone web app with cookie storage ISOLATED
 * from Safari, so entrants appear logged out (and the email magic link can't
 * log the standalone container in, since the link opens in Safari). "browser"
 * makes the icon a plain quick-link into Safari, where the session already lives.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "World Cup 2026 Pool",
    short_name: "WC2026 Pool",
    description: "The annual World Cup fantasy pool — draft your tiers, chase the chaos.",
    start_url: "/",
    display: "browser",
    background_color: "#2d2a72",
  };
}
