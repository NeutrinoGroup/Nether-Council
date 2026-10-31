import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const source = JSON.parse(readFileSync("docs/assets/meng-po.source.json", "utf8"));
for (const [path, expected] of Object.entries(source.files) as [string, { bytes: number; sha256: string }][]) {
  const bytes = readFileSync(path);
  if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`Asset provenance mismatch: ${path}`);
}
const bytes = readFileSync("apps/web/public/models/meng-po.glb");
if (bytes.length > 8 * 1024 * 1024 || bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error("Invalid or oversized GLB");
const jsonLength = bytes.readUInt32LE(12); const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength));
if (gltf.buffers.some((b: { uri?: string }) => b.uri) || gltf.images.some((image: { uri?: string }) => image.uri)) throw new Error("GLB must embed all resources");
const sizes = gltf.images.map((image: { bufferView: number; mimeType: string }) => {
  if (image.mimeType !== "image/webp") throw new Error("Expected optimized WebP textures");
  const view = gltf.bufferViews[image.bufferView]; const offset = 20 + jsonLength + 8 + (view.byteOffset ?? 0); const b = bytes.subarray(offset, offset + view.byteLength);
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (chunk === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L") { const packed = b.readUInt32LE(21); return [(packed & 0x3fff) + 1, ((packed >> 14) & 0x3fff) + 1]; }
  throw new Error("Unsupported WebP texture header");
});
if (sizes.some((size: number[]) => size.some(n => n > 2048 || n < 1))) throw new Error("Texture exceeds 2K budget");
console.log(JSON.stringify({ character: "meng-po", bytes: bytes.length, textureSizes: sizes, provenance: "verified" }));
