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
    const output = new Int16Array(Math.ceil((input.length + this.filled) / this.ratio) + 1);
    let length = 0;
    for (const sample of input) {
      let remaining = 1;
      while (remaining > 1e-8) {
        const take = Math.min(remaining, this.ratio - this.filled);
        this.area += (Number.isFinite(sample) ? sample : 0) * take; this.filled += take; remaining -= take;
        if (this.filled >= this.ratio - 1e-8) {
          const value = Math.max(-1, Math.min(1, this.area / this.ratio));
          output[length++] = Math.round(value * (value < 0 ? 32768 : 32767)); this.area = 0; this.filled = 0;
        }
      }
    }
    return output.subarray(0, length);
  }
}
export function pcm16le(samples: Int16Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2); const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i], true);
  return buffer;
}

/** Reusable capture ring. Only complete, transferable little-endian frames allocate. */
export class PcmFrameBuffer {
  private samples: Int16Array;
  private read = 0;
  private size = 0;
  constructor(capacity = 2048) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new Error("Invalid PCM capacity");
    this.samples = new Int16Array(capacity);
  }
  push(input: Int16Array) {
    if (this.size + input.length > this.samples.length) {
      const grown = new Int16Array(Math.max(this.samples.length * 2, this.size + input.length));
      const first = Math.min(this.size, this.samples.length - this.read);
      grown.set(this.samples.subarray(this.read, this.read + first));
      grown.set(this.samples.subarray(0, this.size - first), first);
      this.samples = grown;
      this.read = 0;
    }
    const write = (this.read + this.size) % this.samples.length;
    const first = Math.min(input.length, this.samples.length - write);
    this.samples.set(input.subarray(0, first), write);
    this.samples.set(input.subarray(first), 0);
    this.size += input.length;
  }
  readFrame(frameSize = 320): ArrayBuffer | null {
    if (!Number.isSafeInteger(frameSize) || frameSize <= 0) throw new Error("Invalid PCM frame size");
    if (this.size < frameSize) return null;
    const frame = new ArrayBuffer(frameSize * 2);
    const view = new DataView(frame);
    for (let i = 0; i < frameSize; i++) view.setInt16(i * 2, this.samples[(this.read + i) % this.samples.length], true);
    this.read = (this.read + frameSize) % this.samples.length;
    this.size -= frameSize;
    return frame;
  }
}

export function encodePcmBase64(bytes: Uint8Array): string {
  if (typeof btoa === "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 4096) binary += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return btoa(binary);
}

export function decodePcm16Base64ToFloat32(base64: string): Float32Array {
  const binary = typeof atob === "undefined" ? Buffer.from(base64, "base64").toString("latin1") : atob(base64);
  if (binary.length % 2 !== 0) throw new Error("Invalid PCM16");
  const output = new Float32Array(binary.length / 2);
  for (let i = 0; i < output.length; i++) {
    const unsigned = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
    output[i] = (unsigned >= 32768 ? unsigned - 65536 : unsigned) / 32768;
  }
  return output;
}

export type PlaybackQueueOptions = {
  prebufferSamples?: number;
  adaptiveRate?: boolean;
};

/** Bounded PCM queue rendered on the audio thread, including 24k -> device-rate conversion and adaptive jitter buffering. */
export class PlaybackQueue {
  private samples: Float32Array;
  private read = 0;
  private write = 0;
  private size = 0;
  private fraction = 0;
  private buffering = false;
  private readonly prebuffer: number;
  private readonly adaptive: boolean;
  consumed = 0;
  constructor(
    private outputRate: number,
    private inputRate = 24000,
    seconds = 12,
    options: PlaybackQueueOptions = {}
  ) {
    this.samples = new Float32Array(inputRate * seconds);
    this.prebuffer = Math.max(0, options.prebufferSamples ?? 0);
    this.adaptive = options.adaptiveRate ?? false;
    this.buffering = this.prebuffer > 0;
  }
  push(input: Float32Array) {
    if (input.length > this.samples.length - this.size) throw new Error("PLAYBACK_BACKLOG");
    for (const value of input) { this.samples[this.write] = value; this.write = (this.write + 1) % this.samples.length; }
    this.size += input.length;
    if (this.buffering && this.size >= this.prebuffer) {
      this.buffering = false;
    }
  }
  render(output: Float32Array) {
    output.fill(0);
    if (this.buffering || this.size === 0) {
      if (this.prebuffer > 0) this.buffering = true;
      return;
    }
    let rate = 1.0;
    if (this.adaptive) {
      const bufferMs = (this.size / this.inputRate) * 1000;
      if (bufferMs < 60) {
        rate = 0.95; // Gently stretch playback to let incoming network packets catch up
      } else if (bufferMs > 300) {
        rate = 1.05; // Gently compress playback to prevent queue bloat and reduce latency
      }
    }
    const step = (this.inputRate / this.outputRate) * rate;
    for (let i = 0; i < output.length && this.size > 0; i++) {
      const a = this.samples[this.read];
      const b = this.size > 1 ? this.samples[(this.read + 1) % this.samples.length] : a;
      output[i] = a + (b - a) * this.fraction;
      this.fraction += step;
      const take = Math.min(this.size, Math.floor(this.fraction));
      this.read = (this.read + take) % this.samples.length; this.size -= take; this.consumed += take; this.fraction -= take;
      if (!this.size) {
        this.fraction = 0;
        if (this.prebuffer > 0) this.buffering = true;
      }
    }
  }
  clear() {
    this.read = this.write = this.size = this.fraction = this.consumed = 0;
    this.buffering = this.prebuffer > 0;
  }
}
