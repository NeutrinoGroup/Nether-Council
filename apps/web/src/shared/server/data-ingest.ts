import { createHmac } from "node:crypto";
import type { TelemetryEvent } from "@nether/contracts";

type VerifiedTelemetry = TelemetryEvent & {
  sessionId?: string;
  characterId?: string;
  locale?: "zh" | "en";
  sourceSessionId?: string;
};

export async function forwardTelemetryEvent(event: VerifiedTelemetry): Promise<void> {
  const endpoint = process.env.NETHER_DATA_INGEST_URL;
  const secret = process.env.NETHER_DATA_INGEST_SECRET;
  if (!endpoint || !secret) return;
  if (secret.length < 32) return;
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-nether-timestamp": timestamp, "x-nether-signature": signature },
      body,
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) console.warn(JSON.stringify({ channel: "nether.data", status: response.status }));
  } catch {
    console.warn(JSON.stringify({ channel: "nether.data", status: "unavailable" }));
  }
}
