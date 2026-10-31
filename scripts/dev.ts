import { spawn } from "node:child_process";
import { loadLocalEnv } from "./lib/env";
loadLocalEnv();
const child = spawn("pnpm", ["--filter", "@nether/web", "dev"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", code => { process.exitCode = code ?? 1; });
