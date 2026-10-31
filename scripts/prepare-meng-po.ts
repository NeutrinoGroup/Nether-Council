import { mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const at = process.argv.indexOf("--input"); const input = process.argv[at + 1];
if (at < 0 || !input) throw new Error("Provide --input <original Meng Po GLB>");
const source = JSON.parse(readFileSync("docs/assets/meng-po.source.json", "utf8"));
if (createHash("sha256").update(readFileSync(input)).digest("hex") !== source.original.sha256) throw new Error("Original differs from documented generation; update source provenance explicitly first");
mkdirSync("artifacts/g2-model", { recursive: true });
for (const args of [
  ["resize", input, "artifacts/g2-model/rebuilt-2k.glb", "--width", "2048", "--height", "2048"],
  ["webp", "artifacts/g2-model/rebuilt-2k.glb", "apps/web/public/models/meng-po.glb", "--quality", "90"],
  ["validate", "apps/web/public/models/meng-po.glb"],
]) {
  const result = spawnSync("pnpm", ["exec", "gltf-transform", ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Prepared model. Run pnpm assets:verify; review any changed hash before updating provenance.");
