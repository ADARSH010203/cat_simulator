import type { NextConfig } from "next";

// GitHub Pages build (workflow sets DEPLOY_TARGET=pages):
// static export into ./out, served from https://<user>.github.io/cat_simulator/
const isPages = process.env.DEPLOY_TARGET === "pages";

const nextConfig: NextConfig = {
  // standalone for self-hosting, export for GitHub Pages
  output: isPages ? "export" : "standalone",
  ...(isPages && {
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
