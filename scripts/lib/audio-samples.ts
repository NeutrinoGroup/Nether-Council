import { existsSync, readFileSync } from "node:fs";

export interface PcmChunk {
  base64: string;
  bytes: number;
}

/**
 * Load a real spoken speech sample from PCM fixtures and slice into 100ms chunks (3200 bytes).
 */
export function getSpokenUtterance(locale: "zh" | "en", turn: number): PcmChunk[] {
  const turnIndex = ((turn - 1) % 3) + 1;
  const fixturePath = `tests/fixtures/audio/${locale}_turn${turnIndex}.pcm`;

  if (existsSync(fixturePath)) {
    const raw = readFileSync(fixturePath);
    const chunkSize = 3200; // 100ms at 16kHz 16-bit mono
    const chunks: PcmChunk[] = [];
    for (let offset = 0; offset < raw.length; offset += chunkSize) {
      const slice = raw.subarray(offset, Math.min(offset + chunkSize, raw.length));
      chunks.push({
        base64: slice.toString("base64"),
        bytes: slice.length,
      });
    }
    return chunks;
  }

  // Fallback if file not on disk: generate synthetic cadence
  return generateSyntheticSpeech(2.0);
}

/**
 * Synthetic fallback speech cadence if fixture is absent.
 */
export function generateSyntheticSpeech(durationSeconds = 2.0): PcmChunk[] {
  const sampleRate = 16000;
  const chunkMs = 100;
  const samplesPerChunk = Math.round((sampleRate * chunkMs) / 1000);
  const totalSamples = Math.round(sampleRate * durationSeconds);
  const numChunks = Math.ceil(totalSamples / samplesPerChunk);
  const chunks: PcmChunk[] = [];

  for (let c = 0; c < numChunks; c++) {
    const buffer = Buffer.alloc(samplesPerChunk * 2);
    for (let i = 0; i < samplesPerChunk; i++) {
      const t = (c * samplesPerChunk + i) / sampleRate;
      const f0 = Math.sin(2 * Math.PI * 160 * t);
      const f1 = 0.5 * Math.sin(2 * Math.PI * 700 * t);
      const val = Math.round((f0 + f1) * 5000);
      buffer.writeInt16LE(Math.max(-32768, Math.min(32767, val)), i * 2);
    }
    chunks.push({
      base64: buffer.toString("base64"),
      bytes: buffer.length,
    });
  }

  return chunks;
}

/**
 * Generate silence chunks (zeros) at 100ms cadence to allow VAD to detect end of speech.
 */
export function generateSilenceChunks(count = 15): PcmChunk[] {
  const samplesPerChunk = 1600; // 100ms at 16kHz
  const buffer = Buffer.alloc(samplesPerChunk * 2, 0);
  const chunk = { base64: buffer.toString("base64"), bytes: buffer.length };
  return Array.from({ length: count }, () => chunk);
}
