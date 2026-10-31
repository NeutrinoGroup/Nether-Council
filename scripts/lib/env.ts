import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
export function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    if (!existsSync(filename)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(filename, "utf8")))) {
      if (/^[A-Z][A-Z0-9_]*$/.test(key) && process.env[key] === undefined) process.env[key] = value;
    }
  }
}
export function safeCode(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : "upstream_error";
}
