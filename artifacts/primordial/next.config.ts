import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const basePath = (process.env.BASE_PATH ?? "/").replace(/\/$/, "");

const config: NextConfig = {
  basePath,
  poweredByHeader: false,
  allowedDevOrigins: ["**.replit.dev"],
  // Keep Next's monorepo root deterministic; pnpm installs packages at the root.
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
};

export default config;
