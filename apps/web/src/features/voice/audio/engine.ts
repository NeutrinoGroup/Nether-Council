export class AudioEngine {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private capture?: AudioWorkletNode;
  private silent?: GainNode;
  private analyser?: AnalyserNode;
  private playing = new Set<AudioBufferSourceNode>();
  private nextAt = 0;
  private muted = false;
  private disposed = false;
  private capturing = false;
  async start(onPcm: (audio: string) => void) {
    // Invoke from a real click: resume the output before awaiting permission.
    this.context = new AudioContext({ latencyHint: "interactive" });
    await this.context.resume();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (this.disposed) { this.stream.getTracks().forEach(t => t.stop()); return; }
      await this.context.audioWorklet.addModule("/worklets/capture.js");
      this.source = this.context.createMediaStreamSource(this.stream);
      this.capture = new AudioWorkletNode(this.context, "nether-capture");
      this.capturing = true;
      this.silent = this.context.createGain(); this.silent.gain.value = 0;
      this.source.connect(this.capture); this.capture.connect(this.silent).connect(this.context.destination);
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256; this.analyser.connect(this.context.destination);
      this.capture.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        if (this.disposed || this.muted || !this.capturing) return;
        const bytes = new Uint8Array(data);
        let text = ""; for (const byte of bytes) text += String.fromCharCode(byte);
        onPcm(btoa(text));
      };
    } catch (error) { this.stop(); throw error; }
  }
  isPlaying() { return this.playing.size > 0; }
  settings() { return this.stream?.getAudioTracks()[0]?.getSettings(); }
  mute(value: boolean) {
    this.muted = value;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
  }
  play(base64: string) {
    const context = this.context;
    if (!context || !this.analyser || this.disposed) return;
    if (this.nextAt - context.currentTime > 12) throw new Error("Audio playback queue is full");
    const binary = atob(base64);
    if (binary.length % 2 !== 0) throw new Error("Invalid PCM16");
    const raw = Uint8Array.from(binary, c => c.charCodeAt(0)); const view = new DataView(raw.buffer);
    const buffer = context.createBuffer(1, raw.length / 2, 24000); const output = buffer.getChannelData(0);
    for (let i = 0; i < output.length; i++) output[i] = view.getInt16(i * 2, true) / 32768;
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(this.analyser);
    const start = Math.max(context.currentTime + 0.015, this.nextAt); this.nextAt = start + buffer.duration;
    this.playing.add(source); source.onended = () => { source.disconnect(); this.playing.delete(source); }; source.start(start);
  }
  rms(): number {
    if (!this.analyser || !this.playing.size) return 0;
    const samples = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  }
  clear() {
    for (const node of this.playing) { node.onended = null; try { node.stop(); } catch { /* Already ended. */ } node.disconnect(); }
    this.playing.clear(); this.nextAt = 0;
  }
  stopCapture() {
    this.capturing = false;
    if (this.capture) this.capture.port.onmessage = null;
    this.capture?.disconnect(); this.source?.disconnect(); this.silent?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    this.capture = undefined; this.source = undefined; this.silent = undefined;
  }
  stop() {
    if (this.disposed) return; this.disposed = true; this.clear();
    this.stopCapture(); this.analyser?.disconnect();
    if (this.context && this.context.state !== "closed") void this.context.close();
  }
}
