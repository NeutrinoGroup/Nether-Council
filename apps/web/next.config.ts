import type { NextConfig } from "next";
const config: NextConfig = { distDir: process.env.NEXT_BUILD_DIR ?? ".next", serverExternalPackages: ["ws"], transpilePackages: ["@nether/contracts", "@nether/party-core"], poweredByHeader: false };
export default config;
