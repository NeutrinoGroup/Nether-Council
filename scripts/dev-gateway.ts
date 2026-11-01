import { spawn } from "node:child_process";
import { loadLocalEnv } from "./lib/env";
// The repository's .env can contain provider labels that aren't valid env names.
// Reuse the existing filtered loader; dotenv parse errors must never print a secret.
loadLocalEnv();
const child = spawn("uv", ["run", "--project", "services/voice", "uvicorn", "nether_voice.app:app", "--host", "127.0.0.1", "--port", "8001"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", code => { process.exitCode = code ?? 1; });
