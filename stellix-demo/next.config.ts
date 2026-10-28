import type { NextConfig } from "next";

// Static export only: no server, route handlers, proxy, ISR, server actions or image
// optimization. Headers (CSP and the rest) ship in public/_headers for Cloudflare Pages.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
