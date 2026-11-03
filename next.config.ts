import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // keep the dev preview clean — the floating Next "N" badge would overlap
  // the kid action bar (never appears in production builds anyway)
  devIndicators: false,
};

export default nextConfig;
