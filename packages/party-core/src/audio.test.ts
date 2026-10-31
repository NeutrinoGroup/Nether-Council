import { expect, test } from "vitest";
import { PcmResampler, pcm16le } from "./audio";
test("44.1kHz fractional samples carry across 128-frame worklet blocks", () => {
  const source = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(i / 20));
  const whole = new PcmResampler(44100).push(source);
  const streaming = new PcmResampler(44100); const actual: number[] = [];
  for (let i = 0; i < source.length; i += 128) actual.push(...streaming.push(source.subarray(i, i + 128)));
  expect(actual).toEqual(Array.from(whole)); expect(actual).toHaveLength(16000);
});
test("PCM saturates at the two signed bounds and serializes little-endian", () => {
  expect(Array.from(new PcmResampler(48000).push(new Float32Array([2, 2, 2, -2, -2, -2])))).toEqual([32767, -32768]);
  expect(Array.from(new Uint8Array(pcm16le(new Int16Array([0x1234, -32768]))))).toEqual([0x34, 0x12, 0, 0x80]);
});
