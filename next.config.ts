import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Country flags are rendered as emoji/inline SVG; no remote images needed yet.
  async redirects() {
    // The recap feed became the digest. Temporary (307) so browsers don't cache
    // a permanent redirect mid-tournament.
    return [{ source: "/recap", destination: "/digest", permanent: false }];
  },
};

export default nextConfig;
