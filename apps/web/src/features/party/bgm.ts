export class BgmController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private active = false;
  private ducked = false;

  private readonly NORMAL_VOLUME = 0.22;
  private readonly DUCKED_VOLUME = 0.04;

  start(): void {
    if (this.active) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.NORMAL_VOLUME, this.ctx.currentTime);

      this.duckGain = this.ctx.createGain();
      this.duckGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

      this.masterGain.connect(this.duckGain);
      this.duckGain.connect(this.ctx.destination);

      // Create ambient drone synthesis (chords: F minor mystical halloween ambience)
      const freqs = [87.31, 103.83, 130.81, 174.61]; // F2, G#2, C3, F3
      freqs.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        osc.type = idx % 2 === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.08 / (idx + 1), this.ctx.currentTime);

        // Slow LFO for subtle breathing movement
        const lfo = this.ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.setValueAtTime(0.15 + idx * 0.05, this.ctx.currentTime);
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(0.03, this.ctx.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(oscGain.gain);

        osc.connect(oscGain);
        oscGain.connect(this.masterGain!);

        osc.start();
        lfo.start();

        this.nodes.push(osc, lfo, oscGain, lfoGain);
      });

      this.active = true;
    } catch {
      // AudioContext unavailable or restricted
    }
  }

  stop(): void {
    if (!this.active) return;
    for (const node of this.nodes) {
      try {
        if ("stop" in node && typeof (node as AudioScheduledSourceNode).stop === "function") {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {}
    }
    this.nodes = [];
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close();
    }
    this.ctx = null;
    this.masterGain = null;
    this.duckGain = null;
    this.active = false;
    this.ducked = false;
  }

  setDucked(duck: boolean): void {
    if (!this.active || !this.duckGain || !this.ctx) return;
    if (this.ducked === duck) return;
    this.ducked = duck;

    const target = duck ? this.DUCKED_VOLUME / this.NORMAL_VOLUME : 1.0;
    const now = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setTargetAtTime(target, now, 0.25);
  }

  isDucked(): boolean {
    return this.ducked;
  }

  isActive(): boolean {
    return this.active;
  }
}
