// The Monochord engine — turns a set of partials into a sustained drone.
//
// Everything is synthesised with Web Audio oscillators; NO hosted audio files,
// so the build stays static and tiny (same contract as breath/audio.ts). The
// soul of a drone is slow beating between near-unison voices and unhurried
// timbral drift, so each partial is two sine oscillators detuned a few cents,
// summed through a slowly-modulated lowpass.
//
// iOS reliability (shared with the breath cues):
//  - The AudioContext must be created/resumed inside a user gesture — call
//    `unlock()` from the Start tap.
//  - Web Audio routes through the hardware mute switch on iPhone.
//
// A drone is a long, eyes-closed presence, so the engine holds a Screen Wake
// Lock while sounding (re-acquired on tab return) and suspends the context when
// silent to spare the battery.

import type { Partial } from './tuning';

export interface DroneConfig {
  masterVolume: number; // 0..1
  brightness: number; // 0..1 → lowpass cutoff
  motion: number; // 0..1 → depth of the filter sweep and per-voice drift
}

const FADE_IN = 6; // seconds — drones must never click on
const FADE_OUT = 4;
const XFADE = 1.2; // re-voicing crossfade
const GLIDE = 2.5; // pitch glide when attuning to a new planetary hour
const BEAT_CENTS = 6; // detune between a voice's paired oscillators
const SILENT = 0.0001; // exp-ramp floor (can't ramp to 0)

interface Voice {
  oscs: OscillatorNode[];
  gain: GainNode; // base relative gain (LFO drift sums on top)
  target: number; // intended base gain
  drift?: OscillatorNode;
}

export class DroneEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private filterLfo: OscillatorNode | null = null;
  private filterLfoGain: GainNode | null = null;
  private voices: Voice[] = [];
  private cfg: DroneConfig;
  private playing = false;
  private wakeLock: WakeLockSentinel | null = null;

  constructor(cfg: DroneConfig) {
    this.cfg = cfg;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Create/resume the AudioContext inside the Start tap (iOS autoplay). */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  /** Begin sounding the given partials with a long fade-in. */
  async start(voices: Partial[]): Promise<void> {
    await this.unlock();
    const ctx = this.ctx!;
    this.playing = true;

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(SILENT, ctx.currentTime);
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.7;
    this.filter.connect(this.master);

    // Slow sine sweep of the cutoff — the drone's "breathing" timbre.
    this.filterLfo = ctx.createOscillator();
    this.filterLfo.frequency.value = 0.05; // ~20s period
    this.filterLfoGain = ctx.createGain();
    this.filterLfo.connect(this.filterLfoGain).connect(this.filter.frequency);
    this.filterLfo.start();
    this.applyFilter();

    for (const p of voices) this.voices.push(this.makeVoice(p, p.gain));

    // Fade in.
    this.master.gain.linearRampToValueAtTime(
      Math.max(SILENT, this.cfg.masterVolume),
      ctx.currentTime + FADE_IN,
    );

    await this.acquireWakeLock();
  }

  /** Live tweak of volume / brightness / motion (no re-voicing). */
  update(cfg: DroneConfig): void {
    this.cfg = cfg;
    if (!this.ctx || !this.playing) return;
    const t = this.ctx.currentTime;
    this.master?.gain.cancelScheduledValues(t);
    this.master?.gain.setValueAtTime(this.master.gain.value, t);
    this.master?.gain.linearRampToValueAtTime(Math.max(SILENT, cfg.masterVolume), t + 0.3);
    this.applyFilter();
  }

  /** Swap in a new set of partials while sounding. `glide` ramps the pitches
   *  of the existing voices (used when attuning to a new planetary hour);
   *  otherwise the voice bank is crossfaded (density / tuning changes). */
  setVoices(voices: Partial[], glide = false): void {
    if (!this.ctx || !this.playing) return;
    const t = this.ctx.currentTime;

    if (glide && voices.length === this.voices.length) {
      voices.forEach((p, i) => {
        const v = this.voices[i];
        v.oscs.forEach((o, k) => {
          const detune = k === 0 ? -BEAT_CENTS : BEAT_CENTS;
          o.frequency.cancelScheduledValues(t);
          o.frequency.setValueAtTime(o.frequency.value, t);
          o.frequency.linearRampToValueAtTime(p.freq * centsToRatio(detune), t + GLIDE);
        });
        rampBase(v, p.gain, t, GLIDE);
      });
      return;
    }

    // Crossfade: fade the old bank out and stop it, fade a fresh bank in.
    const old = this.voices;
    this.voices = voices.map((p) => this.makeVoice(p, 0));
    this.voices.forEach((v) => rampBase(v, v.target, t, XFADE));
    for (const v of old) {
      rampBase(v, 0, t, XFADE);
      this.stopVoice(v, t + XFADE + 0.1);
    }
  }

  /** Fade out and tear the graph down. */
  async stop(): Promise<void> {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.master?.gain.cancelScheduledValues(t);
    this.master?.gain.setValueAtTime(this.master.gain.value, t);
    this.master?.gain.linearRampToValueAtTime(SILENT, t + FADE_OUT);

    const stopAt = t + FADE_OUT + 0.1;
    for (const v of this.voices) this.stopVoice(v, stopAt);
    this.voices = [];
    try {
      this.filterLfo?.stop(stopAt);
    } catch {
      /* already stopped */
    }
    this.releaseWakeLock();

    // Suspend once silent to spare the battery; keep the context for reuse.
    // Guard against a Sound tap during the fade-out — if we've restarted,
    // leave the freshly-built graph untouched.
    await new Promise((r) => setTimeout(r, (FADE_OUT + 0.2) * 1000));
    if (this.playing) return;
    await ctx.suspend().catch(() => {});
    this.master = this.filter = this.filterLfo = this.filterLfoGain = null;
  }

  close(): void {
    this.releaseWakeLock();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.playing = false;
  }

  // --- graph helpers ---------------------------------------------------------

  private makeVoice(p: Partial, startGain: number): Voice {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(startGain, ctx.currentTime);
    gain.connect(this.filter!);

    const oscs: OscillatorNode[] = [-BEAT_CENTS, BEAT_CENTS].map((detune) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = p.freq;
      o.detune.value = detune;
      o.connect(gain);
      o.start();
      return o;
    });

    // Upper partials get a slow amplitude drift so nothing sits perfectly
    // still (à la Radigue). Depth follows the motion control.
    let drift: OscillatorNode | undefined;
    if (p.gain < 0.6) {
      drift = ctx.createOscillator();
      drift.frequency.value = 0.03 + Math.random() * 0.05;
      const driftGain = ctx.createGain();
      driftGain.gain.value = p.gain * 0.35 * this.cfg.motion;
      drift.connect(driftGain).connect(gain.gain);
      drift.start();
    }

    return { oscs, gain, target: p.gain, drift };
  }

  private stopVoice(v: Voice, at: number): void {
    for (const o of v.oscs) {
      try {
        o.stop(at);
      } catch {
        /* already stopped */
      }
    }
    if (v.drift) {
      try {
        v.drift.stop(at);
      } catch {
        /* already stopped */
      }
    }
  }

  private applyFilter(): void {
    if (!this.ctx || !this.filter || !this.filterLfoGain) return;
    const cutoff = 280 + this.cfg.brightness * 3200; // Hz
    const t = this.ctx.currentTime;
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value || cutoff, t);
    this.filter.frequency.linearRampToValueAtTime(cutoff, t + 0.5);
    this.filterLfoGain.gain.setTargetAtTime(cutoff * 0.4 * this.cfg.motion, t, 0.5);
  }

  // --- wake lock -------------------------------------------------------------

  private async acquireWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch {
      this.wakeLock = null; // denied / not permitted; non-fatal
    }
  }

  private releaseWakeLock(): void {
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  private onVisibility = (): void => {
    if (this.playing && document.visibilityState === 'visible' && !this.wakeLock) {
      void this.acquireWakeLock();
    }
  };
}

function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

/** Ramp a voice's base gain, preserving any LFO drift summed on top. */
function rampBase(v: Voice, to: number, t: number, dur: number): void {
  v.target = to;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(v.gain.gain.value, t);
  v.gain.gain.linearRampToValueAtTime(to, t + dur);
}
