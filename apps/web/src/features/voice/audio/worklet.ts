import { PcmResampler, PlaybackQueue, pcm16le } from "@nether/party-core/audio";
declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort; }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
class CaptureProcessor extends AudioWorkletProcessor {
  private resampler = new PcmResampler(sampleRate, 16000);
  private pending: number[] = [];
  process(inputs: Float32Array[][]) {
    const channel = inputs[0]?.[0];
    if (channel) {
      this.pending.push(...this.resampler.push(channel));
      while (this.pending.length >= 320) {
        const buffer = pcm16le(Int16Array.from(this.pending.splice(0, 320)));
        this.port.postMessage(buffer, [buffer]);
      }
    }
    return true;
  }
}
class PlaybackProcessor extends AudioWorkletProcessor {
  private queue = new PlaybackQueue(sampleRate);
  private generation = 0;
  private frames = 0;
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data.type === "clear") { this.generation = data.generation; this.queue.clear(); }
      if (data.type === "push" && data.generation === this.generation) {
        try { this.queue.push(new Float32Array(data.samples)); }
        catch { this.queue.clear(); this.port.postMessage({ generation: this.generation, overflow: true }); }
      }
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0]?.[0];
    if (output) {
      this.queue.render(output);
      this.frames += output.length;
      if (this.frames >= sampleRate / 50) {
        this.frames = 0;
        this.port.postMessage({ generation: this.generation, consumed: this.queue.consumed });
      }
    }
    return true;
  }
}
registerProcessor("nether-capture", CaptureProcessor);
registerProcessor("nether-playback", PlaybackProcessor);
