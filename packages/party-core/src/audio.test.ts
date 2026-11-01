import { expect, test } from "vitest";
import { PcmResampler, PlaybackQueue, pcm16le } from "./audio";
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

test.each([44100, 48000])("24k playback consumes exactly one second at device rate %i", outputRate => {
  const queue = new PlaybackQueue(outputRate);
  queue.push(new Float32Array(24000).fill(0.5));
  const output = new Float32Array(outputRate);
  queue.render(output);
  expect(output.every(value => value === 0.5)).toBe(true);
  expect(queue.consumed).toBe(24000);
  queue.render(output); expect(output.every(value => value === 0)).toBe(true);
});
test("barge-in clears PCM, interpolation and counters; later audio plays without stale samples", () => {
  const queue = new PlaybackQueue(48000); const out = new Float32Array(128);
  queue.push(new Float32Array(2400).fill(0.75)); queue.render(out); queue.clear();
  queue.render(out); expect(out.every(value => value === 0)).toBe(true); expect(queue.consumed).toBe(0);
  queue.push(new Float32Array(64).fill(-0.25)); queue.render(out);
  expect(out.every(value => value === -0.25)).toBe(true); expect(queue.consumed).toBe(64);
});
test("queue rejects a slow-consumer backlog without overwriting queued audio", () => {
  const queue = new PlaybackQueue(48000, 24000, 1);
  queue.push(new Float32Array(23999).fill(0.5)); expect(() => queue.push(new Float32Array(2))).toThrow("PLAYBACK_BACKLOG");
  const out = new Float32Array(128); queue.render(out); expect(out[0]).toBe(0.5);
});
