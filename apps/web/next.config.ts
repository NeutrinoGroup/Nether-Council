import type { NextConfig } from "next";
const config: NextConfig = { transpilePackages: ["@nether/contracts", "@nether/party-core"], poweredByHeader: false };
export default config;
