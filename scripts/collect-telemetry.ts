import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { TelemetryEvent } from "@nether/contracts";
import { deduplicate } from "./lib/telemetry";
const flag = process.argv.indexOf("--since");
const since = flag >= 0 ? process.argv[flag + 1] : "30m";
if (!since) throw new Error("--since requires a duration");
const result = spawnSync("pnpm", ["exec", "vercel", "logs", "--json", "--project", "nether-council", "--since", since, "--limit", "1000"], { encoding: "utf8", timeout: 45000 });
if (result.status !== 0) {
  console.error(result.stderr);
  throw new Error("Vercel runtime log query failed");
}
const events: TelemetryEvent[] = [];
function visit(value: unknown) {
  if (typeof value === "string" && value.includes('"nether.telemetry"')) {
    const start = value.indexOf('{"channel":"nether.telemetry"');
    if (start < 0) return;
    try { const event = JSON.parse(value.slice(start)); delete event.channel; delete event.version; events.push(TelemetryEvent.parse(event)); } catch { /* Ignore truncated or non-event log lines. */ }
  } else if (Array.isArray(value)) value.forEach(visit);
  else if (value && typeof value === "object") for (const field of Object.values(value)) visit(field);
}
for (const line of result.stdout.split("\n")) { try { visit(JSON.parse(line)); } catch { /* CLI progress is not telemetry. */ } }
mkdirSync("artifacts/telemetry", { recursive: true });
writeFileSync("artifacts/telemetry/events.json", JSON.stringify(deduplicate(events), null, 2));
console.log(JSON.stringify({ captured: events.length, unique: deduplicate(events).length, blindSpots: "Vercel retention, log truncation, pagination boundaries, the last 1000 records, delayed ingestion and any period without collection. No durable database." }));
