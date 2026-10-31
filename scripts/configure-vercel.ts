import { appendFileSync, chmodSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadLocalEnv } from "./lib/env";
loadLocalEnv();
const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
if (project.projectId !== "prj_K3yPg2pxZMVyV1NWPXoLGEBHMHe9" || project.orgId !== "team_mISG7YOUhrsdkFPulvYyYPGu") throw new Error("Unexpected deployment target");
for (const name of ["SESSION_SIGNING_SECRET", "REFERRAL_SIGNING_SECRET", "CAMPAIGN_SIGNING_SECRET", "HOST_ACCESS_SECRET"]) {
  if (!process.env[name]) {
    const value = randomBytes(32).toString("base64url");
    appendFileSync(".env.local", `\n${name}=${value}\n`, { mode: 0o600 });
    process.env[name] = value;
  }
}
chmodSync(".env.local", 0o600);
const defaults: Record<string, string> = {
  QWEN_REALTIME_URL: "wss://maas.qianwenaiapi.com/api-ws/v1/realtime", QWEN_REALTIME_MODEL: "qwen-audio-3.1-realtime-plus",
  QWEN_TEXT_BASE_URL: "https://maas.qianwenaiapi.com/compatible-mode/v1", QWEN_TEXT_MODEL: "qwen3.6-flash",
  HUNYUAN_3D_BASE_URL: "https://api.ai3d.cloud.tencent.com", VOICE_ENABLED: "false", NEXT_PUBLIC_CAMPAIGN_ID: "halloween-2026", NEXT_PUBLIC_SITE_URL: "https://nether-council.vercel.app",
};
const names = ["QWEN_DUPLEX_API_KEY", "QWEN_TEXT_API_KEY", "HUNYUAN_3D_API_KEY", ...Object.keys(defaults), "SESSION_SIGNING_SECRET", "REFERRAL_SIGNING_SECRET", "CAMPAIGN_SIGNING_SECRET", "HOST_ACCESS_SECRET", "NEXT_PUBLIC_SITE_URL"];
const entries = [...new Set(names)].flatMap(key => {
  const value = process.env[key] ?? defaults[key];
  return value ? [{ key, value, type: "encrypted", target: ["preview", "production"] }] : [];
});
const selected = process.argv.slice(2);
for (const entry of entries.filter(e => selected.length === 0 || selected.includes(e.key))) {
  const result = spawnSync("pnpm", ["exec", "vercel", "env", "add", entry.key, "--environment", "preview,production", entry.key.startsWith("NEXT_PUBLIC_") ? "--no-sensitive" : "--sensitive", "--force", "--yes", "--project", "nether-council", "--scope", "oodai", "--non-interactive"], { input: entry.value + "\n", encoding: "utf8", timeout: 45_000 });
  if (result.status !== 0) {
    let diagnostic = result.stderr;
    for (const value of Object.values(process.env)) if (value && value.length > 7) diagnostic = diagnostic.split(value).join("[redacted]");
    console.error(`Configuration failed for ${entry.key}: ${diagnostic.slice(-500)}`);
    process.exit(1);
  }
  console.log(`Configured ${entry.key} in preview and production`);
}
