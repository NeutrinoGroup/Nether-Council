import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadLocalEnv } from "./lib/env";
loadLocalEnv();
const flag = process.argv.indexOf("--url"); const url = new URL(process.argv[flag + 1]);
if (flag < 0 || url.protocol !== "https:" || !url.hostname.startsWith("nether-council-") || !url.hostname.endsWith("-oodai.vercel.app")) throw new Error("Use this project’s preview URL");
const headers: Record<string, string> = { Origin: url.origin, "Content-Type": "application/json" };
if (process.env.VERCEL_OIDC_TOKEN) headers["x-vercel-trusted-oidc-idp-token"] = process.env.VERCEL_OIDC_TOKEN;
const events = [0, 1].map(() => ({ eventId: randomUUID(), name: "entry_viewed", at: Date.now() }));
for (const event of [...events, events[0]]) {
  const response = await fetch(new URL("/api/events", url), { method: "POST", headers, redirect: "error", body: JSON.stringify(event) });
  if (response.status !== 202) throw new Error(`Telemetry returned HTTP ${response.status}`);
}
mkdirSync("artifacts/g0", { recursive: true });
writeFileSync("artifacts/g0/telemetry-probe.json", JSON.stringify({ url: url.origin, eventIds: events.map(e => e.eventId), sent: 3, expectedUnique: 2 }, null, 2));
console.log(JSON.stringify({ accepted: 3, expectedUnique: 2, next: "Collect runtime logs and compare eventIds" }));
