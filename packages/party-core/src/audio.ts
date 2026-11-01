/** Streaming box-filter resampler; carries fractional source sample area across worklet blocks. */
export class PcmResampler {
  private area = 0;
  private filled = 0;
  private readonly ratio: number;
  constructor(sourceRate: number, targetRate = 16000) {
    if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0) throw new Error("Invalid audio rate");
    this.ratio = sourceRate / targetRate;
  }
  push(input: Float32Array): Int16Array {
    const output: number[] = [];
    for (const sample of input) {
      let remaining = 1;
      while (remaining > 1e-8) {
        const take = Math.min(remaining, this.ratio - this.filled);
        this.area += (Number.isFinite(sample) ? sample : 0) * take; this.filled += take; remaining -= take;
        if (this.filled >= this.ratio - 1e-8) {
          const value = Math.max(-1, Math.min(1, this.area / this.ratio));
          output.push(Math.round(value * (value < 0 ? 32768 : 32767))); this.area = 0; this.filled = 0;
        }
      }
    }
    return Int16Array.from(output);
  }
}
export function pcm16le(samples: Int16Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2); const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i], true);
  return buffer;
}

/** Bounded PCM queue rendered on the audio thread, including 24k -> device-rate conversion. */
export class PlaybackQueue {
  private samples: Float32Array;
  private read = 0;
  private write = 0;
  private size = 0;
  private fraction = 0;
  consumed = 0;
  constructor(private outputRate: number, private inputRate = 24000, seconds = 12) {
    this.samples = new Float32Array(inputRate * seconds);
  }
  push(input: Float32Array) {
    if (input.length > this.samples.length - this.size) throw new Error("PLAYBACK_BACKLOG");
    for (const value of input) { this.samples[this.write] = value; this.write = (this.write + 1) % this.samples.length; }
    this.size += input.length;
  }
  render(output: Float32Array) {
    output.fill(0);
    const step = this.inputRate / this.outputRate;
    for (let i = 0; i < output.length && this.size > 0; i++) {
      const a = this.samples[this.read];
      const b = this.size > 1 ? this.samples[(this.read + 1) % this.samples.length] : a;
      output[i] = a + (b - a) * this.fraction;
      this.fraction += step;
      const take = Math.min(this.size, Math.floor(this.fraction));
      this.read = (this.read + take) % this.samples.length; this.size -= take; this.consumed += take; this.fraction -= take;
      if (!this.size) this.fraction = 0;
    }
  }
  clear() { this.read = this.write = this.size = this.fraction = this.consumed = 0; }
}
