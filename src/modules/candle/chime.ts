// Candle-watch chimes — soft bells marking phase transitions in Trāṭaka.
//
// Like the breath CueEngine, every sound is synthesised with the Web Audio API
// (no hosted files) and speech with the Web Speech API, so the build stays
// static. We reuse the shared cue settings (tones/speech/haptics toggles +
// volumes) from the Settings store, but the gaze/rest practice wants its own
// gentler bell vocabulary rather than the breath rising/falling tones.
//
// iOS reliability: the AudioContext and speechSynthesis must be unlocked inside
// the user's "start" tap — call unlock() from that handler.

import type { CandlePhaseKind } from './rituals';
import type { CueConfig } from '../breath/audio';
import { hasHaptics, hasSpeech } from '../../lib/platform';

const PHRASE: Record<CandlePhaseKind, string> = {
  gaze: 'Open your eyes. Gaze at the flame.',
  rest: 'Close your eyes. Hold the afterimage.',
};

const HAPTIC: Record<CandlePhaseKind, number | number[]> = {
  gaze: 60,
  rest: [40, 60, 40],
};

// Bell pitches (Hz) per transition — a calm, settled vocabulary.
const BELL: Record<CandlePhaseKind, number[]> = {
  gaze: [330], // single low strike — return the gaze outward
  rest: [392, 523], // soft two-tone — turn inward, eyes closed
};
const END_BELL = [523, 392, 261]; // a resolving descent on completion

export class CandleChime {
  private ctx: AudioContext | null = null;
  private cfg: CueConfig;

  constructor(cfg: CueConfig) {
    this.cfg = cfg;
  }

  update(cfg: CueConfig): void {
    this.cfg = cfg;
  }

  /** Call inside the start tap so eyes-closed cues are reliable on iOS. */
  async unlock(): Promise<void> {
    if (this.cfg.tonesEnabled) {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    }
    if (this.cfg.speechEnabled && hasSpeech()) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  }

  /** Fire all enabled cues for a phase transition. */
  cue(kind: CandlePhaseKind): void {
    if (this.cfg.tonesEnabled) this.ring(BELL[kind]);
    if (this.cfg.speechEnabled) this.speak(PHRASE[kind]);
    if (this.cfg.hapticsEnabled && hasHaptics()) navigator.vibrate(HAPTIC[kind]);
  }

  /** Closing cue when the whole ritual completes. */
  complete(): void {
    if (this.cfg.tonesEnabled) this.ring(END_BELL, 0.18);
    if (this.cfg.speechEnabled) this.speak('The watch is complete.');
    if (this.cfg.hapticsEnabled && hasHaptics()) navigator.vibrate([60, 80, 60, 80, 120]);
  }

  /** Strike one or more bell tones in sequence, each a soft decaying sine. */
  private ring(freqs: number[], spacing = 0.14): void {
    if (!this.ctx) return;
    const base = this.ctx.currentTime;
    const dur = 1.2;
    const peak = Math.max(0, Math.min(1, this.cfg.tonesVolume)) * 0.26;
    freqs.forEach((f, i) => {
      const t0 = base + i * spacing;
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t0);

      const gain = this.ctx!.createGain();
      // Bell envelope: near-instant strike, long gentle decay.
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak || 0.0001, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(gain).connect(this.ctx!.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    });
  }

  private speak(text: string): void {
    if (!hasSpeech()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.volume = Math.max(0, Math.min(1, this.cfg.speechVolume));
    u.rate = 0.85;
    u.pitch = 0.9;
    window.speechSynthesis.speak(u);
  }

  silence(): void {
    if (hasSpeech()) window.speechSynthesis.cancel();
  }

  close(): void {
    this.silence();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
