import { readFileSync, writeFileSync } from "node:fs";
import { TelemetryEvent } from "@nether/contracts";
import { pilotReport } from "./lib/telemetry";
const events = (JSON.parse(readFileSync("artifacts/telemetry/events.json", "utf8")) as unknown[]).map(e => TelemetryEvent.parse(e));
const report = pilotReport(events);
writeFileSync("artifacts/telemetry/pilot-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
