/**
 * Procedural WebAudio Car Sound Engine (zero external MP3/WAV files, instant mobile unlock).
 * Synthesizes smooth RPM engine hum, nitro turbine whine, tire drift screech, dual-tone horn,
 * and checkpoint pickup chimes.
 */
export class CarAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private driftNoise: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;
  private nitroOsc: OscillatorNode | null = null;
  private nitroGain: GainNode | null = null;
  private initialized = false;
  public muted = false;

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.42;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Dual-oscillator engine synth
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      filter.Q.value = 1.6;

      const engGain = ctx.createGain();
      engGain.gain.value = 0.06;

      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      oscA.frequency.value = 54;

      const oscB = ctx.createOscillator();
      oscB.type = 'triangle';
      oscB.frequency.value = 108;

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(engGain);
      engGain.connect(master);

      oscA.start();
      oscB.start();

      this.engineOscA = oscA;
      this.engineOscB = oscB;
      this.engineFilter = filter;
      this.engineGain = engGain;

      // Filtered noise for tire drift screech
      const noiseLen = ctx.sampleRate * 1.5;
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) {
        ch[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      const dFilter = ctx.createBiquadFilter();
      dFilter.type = 'bandpass';
      dFilter.frequency.value = 1450;
      dFilter.Q.value = 4.2;

      const dGain = ctx.createGain();
      dGain.gain.value = 0;

      noiseSrc.connect(dFilter);
      dFilter.connect(dGain);
      dGain.connect(master);
      noiseSrc.start();

      this.driftNoise = noiseSrc;
      this.driftFilter = dFilter;
      this.driftGain = dGain;

      // Nitro turbine whine
      const nOsc = ctx.createOscillator();
      nOsc.type = 'sine';
      nOsc.frequency.value = 420;
      const nGain = ctx.createGain();
      nGain.gain.value = 0;
      nOsc.connect(nGain);
      nGain.connect(master);
      nOsc.start();
      this.nitroOsc = nOsc;
      this.nitroGain = nGain;

      this.initialized = true;
    } catch {
      // Audio unavailable
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.04);
    }
  }

  public update(rpmNorm: number, throttle: number, driftAmount: number, nitroActive: boolean): void {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const clampedRpm = Math.max(0, Math.min(1, rpmNorm));

    const baseHz = 48 + clampedRpm * 145 + (nitroActive ? 26 : 0);
    this.engineOscA?.frequency.setTargetAtTime(baseHz, now, 0.05);
    this.engineOscB?.frequency.setTargetAtTime(baseHz * 2.01, now, 0.05);
    this.engineFilter?.frequency.setTargetAtTime(220 + clampedRpm * 920 + throttle * 280, now, 0.05);
    this.engineGain?.gain.setTargetAtTime(0.07 + throttle * 0.09 + clampedRpm * 0.06, now, 0.06);

    const driftVol = Math.max(0, Math.min(1, driftAmount)) * 0.16;
    this.driftGain?.gain.setTargetAtTime(driftVol, now, 0.04);
    this.driftFilter?.frequency.setTargetAtTime(1280 + driftAmount * 640, now, 0.05);

    this.nitroGain?.gain.setTargetAtTime(nitroActive ? 0.065 : 0, now, 0.06);
    this.nitroOsc?.frequency.setTargetAtTime(420 + clampedRpm * 520, now, 0.06);
  }

  public playHorn(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.025);
    gain.gain.setValueAtTime(0.24, now + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    gain.connect(this.masterGain);

    for (const freq of [392, 493.88]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 1600;
      osc.connect(filt);
      filt.connect(gain);
      osc.start(now);
      osc.stop(now + 0.36);
    }
  }

  public playCheckpoint(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      const t = now + idx * 0.065;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  public dispose(): void {
    try {
      this.engineOscA?.stop();
      this.engineOscB?.stop();
      this.driftNoise?.stop();
      this.nitroOsc?.stop();
      this.ctx?.close();
    } catch {
      // Ignore
    }
  }
}
