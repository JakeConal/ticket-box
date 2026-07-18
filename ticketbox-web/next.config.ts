import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const apiBaseUrl = process.env.API_PROXY_BASE_URL?.replace(/\/$/, "");

    if (!apiBaseUrl) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`
      },
      {
        source: "/actuator/:path*",
        destination: `${apiBaseUrl}/actuator/:path*`
      }
    ];
  }
};

export default nextConfig;
