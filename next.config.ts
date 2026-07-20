import type { NextConfig } from "next";

import { securityHeaders } from "./lib/http/security-headers.mjs";

const nextConfig: NextConfig = {
  distDir: process.env.GYEOP_NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders()],
      },
    ];
  },
};

export default nextConfig;
