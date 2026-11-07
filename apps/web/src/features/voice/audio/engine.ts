import { encodePcmBase64, decodePcm16Base64ToFloat32 } from "@nether/party-core/audio";
import { preloadAudioWorklet } from "./module";

export class AudioEngine {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private capture?: AudioWorkletNode;
  private playback?: AudioWorkletNode;
  private silent?: GainNode;
  private analyser?: AnalyserNode;
  private inputAnalyser?: AnalyserNode;
  private muted = false;
  private disposed = false;
  private capturing = false;
  private captureGeneration = 0;
  private generation = 0;
  private submitted = 0;
  private consumed = 0;
  private overflow = false;
  private outputReady?: Promise<void>;
  private speechMs = 0;
  private silenceMs = 0;
  private voiceActive = false;
  async prepareOutput() {
    if (this.disposed) return;
    if (!this.outputReady) {
      // Call from a click before awaiting microphone permission.
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.outputReady = (async () => {
        await this.context!.resume();
        await this.context!.audioWorklet.addModule(await preloadAudioWorklet());
        if (this.disposed) return;
        this.analyser = this.context!.createAnalyser(); this.analyser.fftSize = 256;
        this.playback = new AudioWorkletNode(this.context!, "nether-playback", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        this.playback.port.postMessage({ type: "clear", generation: this.generation });
        this.playback.connect(this.analyser).connect(this.context!.destination);
        this.playback.onprocessorerror = () => { this.overflow = true; this.clear(); };
        this.playback.port.onmessage = ({ data }) => {
          if (this.disposed || data.generation !== this.generation) return;
          if (data.overflow) { this.overflow = true; this.clear(); }
          else this.consumed = data.consumed;
        };
      })();
    }
    await this.outputReady;
    if (this.context?.state === "suspended") await this.context.resume();
  }
  async start(onPcm: (audio: string) => void, onSpeech?: () => void) {
    const captureGeneration = ++this.captureGeneration;
    await this.prepareOutput();
    if (this.disposed || captureGeneration !== this.captureGeneration) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (this.disposed || captureGeneration !== this.captureGeneration) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      this.source = this.context!.createMediaStreamSource(stream);
      this.capture = new AudioWorkletNode(this.context!, "nether-capture");
      this.capturing = true;
      this.silent = this.context!.createGain(); this.silent.gain.value = 0;
      this.inputAnalyser = this.context!.createAnalyser();
      this.inputAnalyser.fftSize = 512;
      this.source.connect(this.inputAnalyser);
      this.source.connect(this.capture); this.capture.connect(this.silent).connect(this.context!.destination);
      this.capture.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        if (this.disposed || this.muted || !this.capturing) return;
        if (onSpeech) {
          const view = new DataView(data); let power = 0;
          for (let i = 0; i < data.byteLength; i += 2) power += (view.getInt16(i, true) / 32768) ** 2;
          const voiced = Math.sqrt(power / (data.byteLength / 2)) > 0.038;
          this.speechMs = voiced ? this.speechMs + 20 : 0;
          this.silenceMs = voiced ? 0 : this.silenceMs + 20;
          if (this.silenceMs >= 200) this.voiceActive = false;
          if (!this.voiceActive && this.speechMs >= 40) { this.voiceActive = true; onSpeech(); }
        }
        onPcm(encodePcmBase64(new Uint8Array(data)));
      };
    } catch (error) { this.stopCapture(); throw error; }
  }
  analysers() { return { input: this.capturing && !this.muted ? this.inputAnalyser : undefined, output: this.isPlaying() ? this.analyser : undefined }; }
  isPlaying() { return this.submitted > this.consumed; }
  queuedMs(): number { return Math.max(0, Math.round((this.submitted - this.consumed) / 24000 * 1000)); }
  settings() { return this.stream?.getAudioTracks()[0]?.getSettings(); }
  mute(value: boolean) {
    this.muted = value; this.speechMs = this.silenceMs = 0; this.voiceActive = false;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
  }
  play(base64: string) {
    if (!this.playback || this.disposed) return;
    if (this.overflow) throw new Error("PLAYBACK_BACKLOG");
    const output = decodePcm16Base64ToFloat32(base64);
    if (this.submitted - this.consumed + output.length > 24000 * 12) throw new Error("PLAYBACK_BACKLOG");
    this.submitted += output.length;
    this.playback.port.postMessage({ type: "push", generation: this.generation, samples: output.buffer }, [output.buffer]);
  }
  rms(): number {
    if (!this.analyser || !this.isPlaying()) return 0;
    const samples = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  }
  clear(): number {
    const startedAt = performance.now();
    this.submitted = this.consumed = 0;
    this.playback?.port.postMessage({ type: "clear", generation: ++this.generation });
    // Command dispatch duration; the worklet and physical output stop later.
    return performance.now() - startedAt;
  }
  stopCapture() {
    this.capturing = false; this.captureGeneration++;
    if (this.capture) this.capture.port.onmessage = null;
    this.inputAnalyser?.disconnect(); this.inputAnalyser = undefined;
    this.capture?.disconnect(); this.source?.disconnect(); this.silent?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    this.capture = undefined; this.source = undefined; this.silent = undefined;
  }
  stop(): number {
    const startedAt = performance.now();
    if (this.disposed) return 0; this.disposed = true; this.clear();
    this.stopCapture(); this.analyser?.disconnect(); this.playback?.disconnect();
    if (this.context && this.context.state !== "closed") void this.context.close();
    return performance.now() - startedAt;
  }
}
