const arg = process.argv.indexOf("--url");
const base = arg >= 0 ? process.argv[arg + 1] : "http://localhost:3000";
if (!base) throw new Error("--url requires an HTTPS deployment URL");
const response = await fetch(new URL("/api/health", base));
const body = await response.json();
if (!response.ok || body.ok !== true || body.protocolVersion !== 1) throw new Error("Health check failed");
const revisionFlag = process.argv.indexOf("--revision");
if (revisionFlag >= 0 && (!process.argv[revisionFlag + 1] || body.revision !== process.argv[revisionFlag + 1].slice(0, 12))) throw new Error("Deployment revision mismatch");
console.log(JSON.stringify({ url: base, health: "passed", revision: body.revision, voiceEnabled: body.voiceEnabled }));
