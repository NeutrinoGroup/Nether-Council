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
