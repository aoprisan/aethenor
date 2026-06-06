// Audio / speech / haptic cues for breath phases.
//
// Cues are generated entirely with the Web Audio API (oscillators) and the Web
// Speech API — NO hosted audio files, so the build stays static and tiny.
// Convention: ascending tone = inhale, steady = hold, descending = exhale.
// These are functional, meditative cues, not an ambient drone bed (deferred).
//
// iOS reliability notes baked in here:
//  - The AudioContext must be created/resumed inside the "start" tap gesture
//    (autoplay policy) — call `unlock()` from that handler.
//  - speechSynthesis must also be primed by a user gesture; unlock() warms it.

import type { BreathPhaseKind } from './patterns';
import { hasHaptics, hasSpeech } from '../../lib/platform';

export interface CueConfig {
  tonesEnabled: boolean;
  tonesVolume: number; // 0..1
  speechEnabled: boolean;
  speechVolume: number; // 0..1
  hapticsEnabled: boolean;
}

const PHRASE: Record<BreathPhaseKind, string> = {
  inhale: 'breathe in',
  'hold-in': 'hold',
  exhale: 'breathe out',
  'hold-out': 'hold',
};

const HAPTIC: Record<BreathPhaseKind, number | number[]> = {
  inhale: 80,
  'hold-in': [30, 40, 30],
  exhale: 80,
  'hold-out': 30,
};

// freq glide [start, end] per phase — rising/steady/falling.
const TONE: Record<BreathPhaseKind, [number, number]> = {
  inhale: [392, 587], // G4 → D5, rising
  'hold-in': [587, 587], // steady high
  exhale: [587, 330], // D5 → E4, falling
  'hold-out': [294, 294], // steady low
};

export class CueEngine {
  private ctx: AudioContext | null = null;
  private cfg: CueConfig;

  constructor(cfg: CueConfig) {
    this.cfg = cfg;
  }

  update(cfg: CueConfig): void {
    this.cfg = cfg;
  }

  /** Call inside the start tap. Creates/resumes the AudioContext and primes
   *  speech so eyes-closed cues are reliable on iOS. */
  async unlock(): Promise<void> {
    if (this.cfg.tonesEnabled) {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    }
    if (this.cfg.speechEnabled && hasSpeech()) {
      // A near-silent priming utterance unlocks speech within the gesture.
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  }

  /** Fire all enabled cues for a phase transition. */
  cue(kind: BreathPhaseKind): void {
    if (this.cfg.tonesEnabled) this.playTone(kind);
    if (this.cfg.speechEnabled) this.speak(PHRASE[kind]);
    if (this.cfg.hapticsEnabled && hasHaptics()) navigator.vibrate(HAPTIC[kind]);
  }

  private playTone(kind: BreathPhaseKind): void {
    if (!this.ctx) return;
    const [f0, f1] = TONE[kind];
    const t0 = this.ctx.currentTime;
    const dur = 0.6;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.85);

    const gain = this.ctx.createGain();
    const peak = Math.max(0, Math.min(1, this.cfg.tonesVolume)) * 0.28;
    // Soft bell envelope: quick attack, gentle exponential decay.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak || 0.0001, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private speak(text: string): void {
    if (!hasSpeech()) return;
    window.speechSynthesis.cancel(); // don't queue/overlap across phases
    const u = new SpeechSynthesisUtterance(text);
    u.volume = Math.max(0, Math.min(1, this.cfg.speechVolume));
    u.rate = 0.9;
    u.pitch = 0.9;
    window.speechSynthesis.speak(u);
  }

  /** Stop any in-flight speech (on pause/stop). */
  silence(): void {
    if (hasSpeech()) window.speechSynthesis.cancel();
  }

  close(): void {
    this.silence();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
