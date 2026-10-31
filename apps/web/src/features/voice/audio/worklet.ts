import { PcmResampler, pcm16le } from "@nether/party-core/audio";
declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort; }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
class CaptureProcessor extends AudioWorkletProcessor {
  private resampler = new PcmResampler(sampleRate);
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
registerProcessor("nether-capture", CaptureProcessor);
