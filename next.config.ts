import type { NextConfig } from "next";

// Build targets:
//   DEPLOY_TARGET=pages    -> static export for GitHub Pages (basePath /cat_simulator)
//   DEPLOY_TARGET=selfhost -> standalone server output for self-hosting
//   default (Vercel/cloud) -> no output override
const target = process.env.DEPLOY_TARGET;

const nextConfig: NextConfig = {
  ...(target === "selfhost" && { output: "standalone" as const }),
  ...(target === "pages" && {
    output: "export" as const,
    basePath: "/cat_simulator",
    images: { unoptimized: true },
    trailingSlash: true,
  }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // keep the dev preview clean — the floating Next "N" badge would overlap
  // the kid action bar (never appears in production builds anyway)
  devIndicators: false,
};

export default nextConfig;
