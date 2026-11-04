'use client';

// Procedural cat sounds — everything synthesised with Web Audio, no asset files.

import { useSettings } from '@/store/settingsStore';

export type MeowVariant = 'normal' | 'short' | 'long' | 'sad' | 'annoyed' | 'kitten';

class CatAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private purrLevel: GainNode | null = null;
  private purrLfo: OscillatorNode | null = null;
  private purrLfoDepth: GainNode | null = null;
  private purrNodes: AudioNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private purring = false;

  ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(2);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** output node for external sources (echo playback) */
  get input(): GainNode | null {
    return this.master;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private volume(): number {
    const s = useSettings.getState();
    return s.sound ? s.masterVolume : 0;
  }

  /** effective master volume 0..1 (sound off = 0) — echo playback respects it */
  effectiveVolume(): number {
    return this.volume();
  }

  updateVolumes(): void {
    if (this.master) this.master.gain.value = this.volume();
  }

  // ---------------------------------------------------------------- purr
  startPurr(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.purring) return;
    this.purring = true;

    // filtered noise, amplitude modulated at ~25 Hz
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 110;
    bp.Q.value = 0.7;

    const amGain = ctx.createGain();
    amGain.gain.value = 0.0;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 25;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.42;
    lfo.connect(lfoDepth).connect(amGain.gain);

    const offset = ctx.createConstantSource();
    offset.offset.value = 0.55;
    offset.connect(amGain.gain);

    // soft 50 Hz body rumble
    const sine = ctx.createOscillator();
    sine.frequency.value = 50;
    const sineG = ctx.createGain();
    sineG.gain.value = 0.25;

    const level = ctx.createGain();
    level.gain.value = 0;

    noise.connect(bp).connect(amGain).connect(level);
    sine.connect(sineG).connect(level);
    level.connect(this.master);

    noise.start();
    lfo.start();
    offset.start();
    sine.start();

    this.purrLevel = level;
    this.purrLfo = lfo;
    this.purrLfoDepth = lfoDepth;
    this.purrNodes = [noise, lfo, offset, sine];
  }

  setPurrLevel(v: number, rate = 25): void {
    if (!this.purrLevel || !this.ctx) return;
    const s = useSettings.getState();
    const g = Math.max(0, Math.min(1, v)) * s.purrVolume * 0.9;
    const t = this.ctx.currentTime;
    this.purrLevel.gain.cancelScheduledValues(t);
    this.purrLevel.gain.setTargetAtTime(g, t, 0.12);
    if (this.purrLfo) this.purrLfo.frequency.setTargetAtTime(22 + rate * 10, t, 0.2);
  }

  stopPurr(): void {
    if (!this.purrLevel || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.purrLevel.gain.setTargetAtTime(0, t, 0.25);
    const nodes = this.purrNodes;
    const lfo = this.purrLfo;
    window.setTimeout(() => {
      nodes.forEach((n) => {
        const src = n as AudioScheduledSourceNode;
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      });
      lfo?.disconnect();
      void lfo;
    }, 900);
    this.purring = false;
    this.purrNodes = [];
  }

  // ---------------------------------------------------------------- meow
  meow(variant: MeowVariant = 'normal', vol = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + 0.01;

    const cfg: Record<MeowVariant, { dur: number; f: number[]; type: OscillatorType; q: number; vib: number }> = {
      normal: { dur: 0.55, f: [560, 820, 880, 780, 520], type: 'sawtooth', q: 3.2, vib: 14 },
      short: { dur: 0.28, f: [700, 860, 820, 640], type: 'sawtooth', q: 3, vib: 10 },
      long: { dur: 1.0, f: [520, 760, 880, 840, 640, 460], type: 'sawtooth', q: 3.4, vib: 16 },
      sad: { dur: 0.85, f: [500, 560, 520, 420, 360], type: 'sawtooth', q: 2.4, vib: 8 },
      annoyed: { dur: 0.5, f: [300, 330, 300, 260], type: 'square', q: 1.6, vib: 5 },
      kitten: { dur: 0.35, f: [880, 1080, 980, 760], type: 'triangle', q: 3.6, vib: 18 },
    };
    const c = cfg[variant];

    const osc = ctx.createOscillator();
    osc.type = c.type;
    const freqCurve = new Float32Array(c.f);
    osc.frequency.setValueAtTime(c.f[0], t0);
    osc.frequency.setValueCurveAtTime(freqCurve, t0, c.dur * 0.92);

    // vibrato
    const vib = ctx.createOscillator();
    vib.frequency.value = 6.2;
    const vibG = ctx.createGain();
    vibG.gain.value = c.vib;
    vib.connect(vibG).connect(osc.frequency);

    // formant filters
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 780;
    f1.Q.value = c.q;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1300;
    f2.Q.value = c.q * 0.8;
    const f3 = ctx.createBiquadFilter();
    f3.type = 'bandpass';
    f3.frequency.value = 2500;
    f3.Q.value = c.q * 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.32 * vol, t0 + 0.07);
    g.gain.setValueAtTime(0.32 * vol, t0 + c.dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + c.dur);

    osc.connect(f1).connect(f2).connect(f3).connect(lp).connect(g).connect(this.master);
    osc.start(t0);
    vib.start(t0);
    osc.stop(t0 + c.dur + 0.05);
    vib.stop(t0 + c.dur + 0.05);
    osc.onended = () => {
      osc.disconnect();
      vib.disconnect();
      g.disconnect();
    };
  }

  // ---------------------------------------------------------------- small sfx
  chirp(vol = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(760, t0);
    osc.frequency.exponentialRampToValueAtTime(1500, t0 + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.2 * vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.16);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  trill(vol = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 950;
    const mod = ctx.createOscillator();
    mod.frequency.value = 28;
    const modG = ctx.createGain();
    modG.gain.value = 190;
    mod.connect(modG).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16 * vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    mod.start(t0);
    osc.stop(t0 + 0.24);
    mod.stop(t0 + 0.24);
    osc.onended = () => {
      osc.disconnect();
      mod.disconnect();
      g.disconnect();
    };
  }

  squeak(vol = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1700, t0);
    osc.frequency.exponentialRampToValueAtTime(2300, t0 + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.14 * vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.12);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** tiny "prrt" for ear taps */
  prrt(vol = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + 0.01;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 420 + i * 60;
      const g = ctx.createGain();
      const ts = t0 + i * 0.055;
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.exponentialRampToValueAtTime(0.12 * vol, ts + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.045);
      osc.connect(g).connect(this.master);
      osc.start(ts);
      osc.stop(ts + 0.06);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
    }
  }

  /** mild hiss for belly taps when trust is low */
  hiss(vol = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t0 = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06 * vol, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.32);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  sneeze(vol = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t0 = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, t0);
    bp.frequency.exponentialRampToValueAtTime(3200, t0 + 0.12);
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12 * vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.17);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  /** collar bell — two metallic strikes */
  bell(vol = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const master = this.master;
    const t0 = ctx.currentTime + 0.01;
    const partials = [5200, 6300, 8200];
    for (let strike = 0; strike < 2; strike++) {
      const ts = t0 + strike * 0.09;
      partials.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f * (1 + (strike === 1 ? 0.06 : 0));
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ts);
        g.gain.exponentialRampToValueAtTime(0.05 * vol * (1 - i * 0.3), ts + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.35 - i * 0.08);
        osc.connect(g);
        g.connect(master);
        osc.start(ts);
        osc.stop(ts + 0.4);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
        };
      });
    }
  }
}

export const catAudio = new CatAudioEngine();

// QA hook: e2e tests can inspect/force the audio context from the console.
if (typeof window !== 'undefined') {
  (window as unknown as { __catAudio?: CatAudioEngine }).__catAudio = catAudio;
}
