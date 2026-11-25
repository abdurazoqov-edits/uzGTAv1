/**
 * Real-World Hybrid WebAudio Engine:
 * - Plays authentic recorded audio loops bundled in ./assets/audio/:
 *     • engine_real.ogg (real 5-cylinder car engine dynamically pitch-shifted by RPM)
 *     • river_real.ogg  (real flowing river water attenuated spatially near Stevens Creek & Bay View)
 *     • nature_birds.ogg (real outdoor birds & wind ambience)
 * - Seamlessly falls back to rich procedural WebAudio if a browser/WebView codec cannot decode OGG.
 * - Layers city traffic murmur, passing-car rush, nitro afterburner flames, tire drift screech,
 *   dual-tone horn, and visceral GTA melee combat impacts + human vocal reactions!
 */
export interface WorldAudioState {
  inCar: boolean;
  rpmNorm: number;
  throttle: number;
  driftAmount: number;
  nitroActive: boolean;
  waterProximity: number;   // 0..1 (1 = right next to river/lake)
  trafficProximity: number; // 0..1 (1 = right next to passing AI car)
}

export class CarAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Real recorded audio loops (loaded asynchronously after unlock)
  private realEngineSrc: AudioBufferSourceNode | null = null;
  private realEngineFilter: BiquadFilterNode | null = null;
  private realEngineGain: GainNode | null = null;
  private hasRealEngine = false;

  private riverSrc: AudioBufferSourceNode | null = null;
  private riverGain: GainNode | null = null;
  private hasRealRiver = false;

  private natureSrc: AudioBufferSourceNode | null = null;
  private natureGain: GainNode | null = null;

  // Fallback & accent layers (procedural engine sub, city bed, traffic rush, drift, nitro)
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private driftNoise: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;

  private nitroOsc: OscillatorNode | null = null;
  private nitroNoise: AudioBufferSourceNode | null = null;
  private nitroGain: GainNode | null = null;

  private cityNoise: AudioBufferSourceNode | null = null;
  private cityFilter: BiquadFilterNode | null = null;
  private cityGain: GainNode | null = null;

  private riverFallbackNoise: AudioBufferSourceNode | null = null;
  private riverFallbackGain: GainNode | null = null;

  private initialized = false;
  private realSamplesRequested = false;
  public muted = false;

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (!this.realSamplesRequested) {
        this.loadRealAudioSamples();
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
      master.gain.value = this.muted ? 0 : 0.48;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Shared white/pinkish noise buffer (2s)
      const noiseLen = Math.floor(ctx.sampleRate * 2.0);
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      let b0 = 0;
      for (let i = 0; i < noiseLen; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.92 * b0 + w * 0.25;
        ch[i] = Math.max(-1, Math.min(1, w * 0.65 + b0 * 0.35));
      }
      this.noiseBuffer = noiseBuf;

      // 1. Procedural Engine Sub / Fallback (blends seamlessly beneath or replaces real engine)
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      filter.Q.value = 1.8;

      const engGain = ctx.createGain();
      engGain.gain.value = 0.04;

      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      oscA.frequency.value = 50;

      const oscB = ctx.createOscillator();
      oscB.type = 'triangle';
      oscB.frequency.value = 100;

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

      // 2. Tire Drift Screech
      const driftSrc = ctx.createBufferSource();
      driftSrc.buffer = noiseBuf;
      driftSrc.loop = true;
      const dFilter = ctx.createBiquadFilter();
      dFilter.type = 'bandpass';
      dFilter.frequency.value = 1480;
      dFilter.Q.value = 4.6;
      const dGain = ctx.createGain();
      dGain.gain.value = 0;
      driftSrc.connect(dFilter);
      dFilter.connect(dGain);
      dGain.connect(master);
      driftSrc.start();
      this.driftNoise = driftSrc;
      this.driftFilter = dFilter;
      this.driftGain = dGain;

      // 3. Nitro Afterburner Roar + Turbo Spool
      const nGain = ctx.createGain();
      nGain.gain.value = 0;
      nGain.connect(master);

      const nOsc = ctx.createOscillator();
      nOsc.type = 'sine';
      nOsc.frequency.value = 460;
      const nOscGain = ctx.createGain();
      nOscGain.gain.value = 0.25;
      nOsc.connect(nOscGain);
      nOscGain.connect(nGain);
      nOsc.start();

      const nNoise = ctx.createBufferSource();
      nNoise.buffer = noiseBuf;
      nNoise.loop = true;
      const nFilt = ctx.createBiquadFilter();
      nFilt.type = 'bandpass';
      nFilt.frequency.value = 520;
      nFilt.Q.value = 0.8;
      nNoise.connect(nFilt);
      nFilt.connect(nGain);
      nNoise.start();

      this.nitroOsc = nOsc;
      this.nitroNoise = nNoise;
      this.nitroGain = nGain;

      // 4. City Street Ambience + Passing Traffic Rush
      const cSrc = ctx.createBufferSource();
      cSrc.buffer = noiseBuf;
      cSrc.loop = true;
      const cFilt = ctx.createBiquadFilter();
      cFilt.type = 'lowpass';
      cFilt.frequency.value = 260;
      cFilt.Q.value = 0.7;
      const cGain = ctx.createGain();
      cGain.gain.value = 0.04;
      cSrc.connect(cFilt);
      cFilt.connect(cGain);
      cGain.connect(master);
      cSrc.start();
      this.cityNoise = cSrc;
      this.cityFilter = cFilt;
      this.cityGain = cGain;

      // 5. Flowing River Fallback (muted automatically once real river_real.ogg loads)
      const rSrc = ctx.createBufferSource();
      rSrc.buffer = noiseBuf;
      rSrc.loop = true;
      const rFilt = ctx.createBiquadFilter();
      rFilt.type = 'bandpass';
      rFilt.frequency.value = 680;
      rFilt.Q.value = 0.6;
      const rGain = ctx.createGain();
      rGain.gain.value = 0;
      rSrc.connect(rFilt);
      rFilt.connect(rGain);
      rGain.connect(master);
      rSrc.start();
      this.riverFallbackNoise = rSrc;
      this.riverFallbackGain = rGain;

      this.initialized = true;
      this.loadRealAudioSamples();
    } catch {
      // Audio unavailable
    }
  }

  private async decodeUrl(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(arr);
    } catch {
      return null;
    }
  }

  private async loadRealAudioSamples(): Promise<void> {
    if (this.realSamplesRequested || !this.ctx || !this.masterGain) return;
    this.realSamplesRequested = true;

    const [engineBuf, riverBuf, natureBuf] = await Promise.all([
      this.decodeUrl('./assets/audio/engine_real.ogg'),
      this.decodeUrl('./assets/audio/river_real.ogg'),
      this.decodeUrl('./assets/audio/nature_birds.ogg'),
    ]);

    if (!this.ctx || !this.masterGain) return;

    // Real Recorded Car Engine Loop
    if (engineBuf) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = engineBuf;
        src.loop = true;
        // Skip first 0.35s silence/fade and loop steady rumble core
        if (engineBuf.duration > 3.2) {
          src.loopStart = 0.45;
          src.loopEnd = Math.min(engineBuf.duration - 0.35, 8.5);
        }
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 950;
        const g = this.ctx.createGain();
        g.gain.value = 0.14;
        src.connect(filt);
        filt.connect(g);
        g.connect(this.masterGain);
        src.start(0, src.loopStart || 0);
        this.realEngineSrc = src;
        this.realEngineFilter = filt;
        this.realEngineGain = g;
        this.hasRealEngine = true;
      } catch {
        this.hasRealEngine = false;
      }
    }

    // Real Recorded River Water Loop
    if (riverBuf) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = riverBuf;
        src.loop = true;
        const g = this.ctx.createGain();
        g.gain.value = 0.0;
        src.connect(g);
        g.connect(this.masterGain);
        src.start();
        this.riverSrc = src;
        this.riverGain = g;
        this.hasRealRiver = true;
        if (this.riverFallbackGain) {
          this.riverFallbackGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        }
      } catch {
        this.hasRealRiver = false;
      }
    }

    // Real Recorded Nature & Birds Loop
    if (natureBuf) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = natureBuf;
        src.loop = true;
        const g = this.ctx.createGain();
        g.gain.value = 0.16;
        src.connect(g);
        g.connect(this.masterGain);
        src.start();
        this.natureSrc = src;
        this.natureGain = g;
      } catch {
        // Ignore
      }
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.48, this.ctx.currentTime, 0.04);
    }
  }

  public updateWorld(state: WorldAudioState): void {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const rpm = Math.max(0, Math.min(1, state.rpmNorm));
    const thr = Math.max(0, Math.min(1, state.throttle));
    const waterProx = Math.max(0, Math.min(1, state.waterProximity));
    const trafficProx = Math.max(0, Math.min(1, state.trafficProximity));

    // 1. Car Engine (Real Recorded Engine Loop + Sub Harmonic Support)
    if (state.inCar) {
      if (this.hasRealEngine && this.realEngineSrc && this.realEngineGain && this.realEngineFilter) {
        const rate = 0.62 + rpm * 1.42 + (state.nitroActive ? 0.28 : 0);
        this.realEngineSrc.playbackRate.setTargetAtTime(rate, now, 0.055);
        this.realEngineFilter.frequency.setTargetAtTime(
          650 + rpm * 2400 + thr * 950 + (state.nitroActive ? 900 : 0),
          now,
          0.06
        );
        this.realEngineGain.gain.setTargetAtTime(
          0.18 + thr * 0.22 + rpm * 0.14 + (state.nitroActive ? 0.1 : 0),
          now,
          0.06
        );
        // Keep subtle low-end synth rumble underneath for punchy bass
        const subHz = 44 + rpm * 115;
        this.engineOscA?.frequency.setTargetAtTime(subHz, now, 0.05);
        this.engineOscB?.frequency.setTargetAtTime(subHz * 2.0, now, 0.05);
        this.engineFilter?.frequency.setTargetAtTime(160 + rpm * 280, now, 0.06);
        this.engineGain?.gain.setTargetAtTime(0.03 + thr * 0.035, now, 0.06);
      } else {
        const baseHz = 48 + rpm * 145 + (state.nitroActive ? 28 : 0);
        this.engineOscA?.frequency.setTargetAtTime(baseHz, now, 0.05);
        this.engineOscB?.frequency.setTargetAtTime(baseHz * 2.01, now, 0.05);
        this.engineFilter?.frequency.setTargetAtTime(220 + rpm * 960 + thr * 320, now, 0.05);
        this.engineGain?.gain.setTargetAtTime(0.08 + thr * 0.1 + rpm * 0.07, now, 0.06);
      }
    } else {
      // Quiet parked engine when walking on foot
      this.realEngineGain?.gain.setTargetAtTime(0.0, now, 0.12);
      this.engineGain?.gain.setTargetAtTime(0.0, now, 0.12);
    }

    // 2. Tire Drift & Nitro Afterburner
    const driftVol = state.inCar ? Math.max(0, Math.min(1, state.driftAmount)) * 0.18 : 0;
    this.driftGain?.gain.setTargetAtTime(driftVol, now, 0.04);
    this.driftFilter?.frequency.setTargetAtTime(1280 + state.driftAmount * 680, now, 0.05);

    this.nitroGain?.gain.setTargetAtTime(state.inCar && state.nitroActive ? 0.22 : 0, now, 0.06);
    this.nitroOsc?.frequency.setTargetAtTime(480 + rpm * 560, now, 0.06);

    // 3. Spatial Flowing River Water Sound (Real Recording!)
    const riverVol = waterProx * (state.inCar ? 0.24 : 0.44);
    if (this.hasRealRiver && this.riverGain) {
      this.riverGain.gain.setTargetAtTime(riverVol, now, 0.12);
    } else if (this.riverFallbackGain) {
      this.riverFallbackGain.gain.setTargetAtTime(riverVol * 0.35, now, 0.12);
    }

    // 4. Outdoor Nature & Birds Ambience (louder on foot, softer inside cabin)
    if (this.natureGain) {
      this.natureGain.gain.setTargetAtTime(state.inCar ? 0.09 : 0.24, now, 0.2);
    }

    // 5. City Street Ambience + Passing Traffic Car Whoosh
    const cityBase = state.inCar ? 0.032 : 0.055;
    const trafficBoost = trafficProx * 0.14;
    this.cityGain?.gain.setTargetAtTime(cityBase + trafficBoost, now, 0.08);
    this.cityFilter?.frequency.setTargetAtTime(220 + trafficProx * 560, now, 0.08);
  }

  public playHorn(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.025);
    gain.gain.setValueAtTime(0.25, now + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    gain.connect(this.masterGain);

    for (const freq of [392, 493.88]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 1650;
      osc.connect(filt);
      filt.connect(gain);
      osc.start(now);
      osc.stop(now + 0.37);
    }
  }

  /** Fast air whoosh when swinging a punch */
  public playPunchSwing(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(420, now);
    filt.frequency.exponentialRampToValueAtTime(1400, now + 0.07);
    filt.frequency.exponentialRampToValueAtTime(280, now + 0.16);
    filt.Q.value = 1.6;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.18);
  }

  /** Realistic visceral punch impact (sub-bass body thud + crisp skin slap crack) */
  public playPunchHit(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    // 1. Deep punch body thud
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.13);
    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(0.75, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(thudGain);
    thudGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);

    // 2. Crisp impact slap burst
    if (this.noiseBuffer) {
      const slap = this.ctx.createBufferSource();
      slap.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1250, now);
      bp.Q.value = 0.9;
      const sGain = this.ctx.createGain();
      sGain.gain.setValueAtTime(0.55, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      slap.connect(bp);
      bp.connect(sGain);
      sGain.connect(this.masterGain);
      slap.start(now);
      slap.stop(now + 0.095);
    }
  }

  /** Realistic formant-filtered human vocal reaction grunt/groan ("UGH! / AY!") */
  public playHumanGrunt(pitchScale = 1.0): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime + 0.03;

    const src = this.ctx.createOscillator();
    src.type = 'sawtooth';
    const baseF0 = (128 + Math.random() * 34) * pitchScale;
    src.frequency.setValueAtTime(baseF0 * 1.18, now);
    src.frequency.exponentialRampToValueAtTime(baseF0 * 0.72, now + 0.24);

    // Dual vocal tract formants (F1 ~ 620Hz, F2 ~ 1180Hz -> realistic "UGH/AH")
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(640 * Math.sqrt(pitchScale), now);
    f1.Q.value = 4.5;

    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(1220 * Math.sqrt(pitchScale), now);
    f2.Q.value = 5.5;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(0.42, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    src.connect(f1);
    src.connect(f2);
    f1.connect(env);
    f2.connect(env);
    env.connect(this.masterGain);

    src.start(now);
    src.stop(now + 0.28);
  }

  public dispose(): void {
    try {
      this.realEngineSrc?.stop();
      this.riverSrc?.stop();
      this.natureSrc?.stop();
      this.engineOscA?.stop();
      this.engineOscB?.stop();
      this.driftNoise?.stop();
      this.nitroOsc?.stop();
      this.nitroNoise?.stop();
      this.cityNoise?.stop();
      this.riverFallbackNoise?.stop();
      this.ctx?.close();
    } catch {
      // Ignore
    }
  }
}
