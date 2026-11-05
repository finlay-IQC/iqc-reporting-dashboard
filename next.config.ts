import type { NextConfig } from "next";

// Every page in this dashboard is per-request (behind a login, reading live
// report data), so we use the classic dynamic rendering model rather than
// Cache Components.
const nextConfig: NextConfig = {
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
