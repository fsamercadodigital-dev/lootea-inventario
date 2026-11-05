import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const current = config.externals;
      const external = "node:sqlite";
      if (Array.isArray(current)) {
        current.push(external);
      } else {
        config.externals = [current, external].filter(Boolean);
      }
    }
    return config;
  },
};

export default nextConfig;
