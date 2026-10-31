import type { NextConfig } from "next";
const config: NextConfig = { serverExternalPackages: ["ws"], transpilePackages: ["@nether/contracts", "@nether/party-core"], poweredByHeader: false };
export default config;
