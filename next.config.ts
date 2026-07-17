import type { NextConfig } from "next";

import { securityHeaders } from "./lib/http/security-headers.mjs";

const nextConfig: NextConfig = {
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
