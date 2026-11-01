import config from "./playwright.config";
const immersiveConfig = { ...config, outputDir: "artifacts/immersive-test-results", use: { ...config.use, baseURL: "http://localhost:3200" }, webServer: { ...config.webServer, command: "pnpm --filter @nether/web audio:build && pnpm --filter @nether/web exec next dev --port 3200", url: "http://localhost:3200", reuseExistingServer: true } };

export default immersiveConfig;
