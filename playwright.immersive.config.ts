import config from "./playwright.config";
const immersiveConfig = { ...config, outputDir: "artifacts/immersive-test-results" };

export default immersiveConfig;
