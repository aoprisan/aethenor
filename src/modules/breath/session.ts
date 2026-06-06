// Breath session runner: drives the phase sequence, fires cues, tracks
// elapsed time, and holds a Screen Wake Lock so the display can't sleep and
// suspend audio mid-session (critical for eyes-closed practice).

import type { BreathPattern, BreathPhase } from './patterns';
import type { CueEngine } from './audio';

export interface SessionCallbacks {
  onPhase: (phase: BreathPhase, phaseIndex: number, cycle: number) => void;
  onTick: (remainingSec: number, phase: BreathPhase) => void;
  onState: (state: SessionState) => void;
}

export type SessionState = 'idle' | 'running' | 'paused' | 'stopped';

export class BreathSession {
  private pattern: BreathPattern;
  private cues: CueEngine;
  private cb: SessionCallbacks;

  private state: SessionState = 'idle';
  private phaseIdx = 0;
  private cycle = 0;
  private phaseStart = 0; // performance.now() when current phase began
  private interval: number | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  // Elapsed accounting (excludes paused time).
  private accumulatedMs = 0;
  private segmentStart = 0;

  constructor(pattern: BreathPattern, cues: CueEngine, cb: SessionCallbacks) {
    this.pattern = pattern;
    this.cues = cues;
    this.cb = cb;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get elapsedSec(): number {
    const live = this.state === 'running' ? performance.now() - this.segmentStart : 0;
    return Math.round((this.accumulatedMs + live) / 1000);
  }

  get cycles(): number {
    return this.cycle;
  }

  /** Begin. Must be awaited from the start tap so the CueEngine unlocks audio
   *  within the user gesture. */
  async start(): Promise<void> {
    await this.cues.unlock();
    this.state = 'running';
    this.phaseIdx = 0;
    this.cycle = 0;
    this.accumulatedMs = 0;
    this.segmentStart = performance.now();
    await this.acquireWakeLock();
    this.enterPhase();
    this.loop();
    this.cb.onState(this.state);
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.accumulatedMs += performance.now() - this.segmentStart;
    this.state = 'paused';
    this.cues.silence();
    this.stopLoop();
    this.releaseWakeLock();
    this.cb.onState(this.state);
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused') return;
    await this.cues.unlock();
    this.state = 'running';
    this.segmentStart = performance.now();
    // restart current phase timing so the cue lines up with the visual
    this.phaseStart = performance.now();
    await this.acquireWakeLock();
    this.cb.onPhase(this.phases[this.phaseIdx], this.phaseIdx, this.cycle);
    this.loop();
    this.cb.onState(this.state);
  }

  stop(): void {
    if (this.state === 'stopped' || this.state === 'idle') {
      this.teardown();
      return;
    }
    if (this.state === 'running') this.accumulatedMs += performance.now() - this.segmentStart;
    this.state = 'stopped';
    this.stopLoop();
    this.cues.silence();
    this.releaseWakeLock();
    this.cb.onState(this.state);
    this.teardown();
  }

  private get phases(): BreathPhase[] {
    return this.pattern.phases;
  }

  private enterPhase(): void {
    this.phaseStart = performance.now();
    const phase = this.phases[this.phaseIdx];
    this.cues.cue(phase.kind);
    this.cb.onPhase(phase, this.phaseIdx, this.cycle);
  }

  private loop(): void {
    this.stopLoop();
    this.interval = window.setInterval(() => this.tick(), 100);
    this.tick();
  }

  private stopLoop(): void {
    if (this.interval != null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private tick(): void {
    if (this.state !== 'running') return;
    const phase = this.phases[this.phaseIdx];
    const durMs = phase.seconds * 1000;
    const into = performance.now() - this.phaseStart;
    const remaining = Math.max(0, Math.ceil((durMs - into) / 1000));
    this.cb.onTick(remaining, phase);

    if (into >= durMs) {
      this.phaseIdx++;
      if (this.phaseIdx >= this.phases.length) {
        this.phaseIdx = 0;
        this.cycle++;
      }
      this.enterPhase();
    }
  }

  // --- Wake lock -------------------------------------------------------------

  private async acquireWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch {
      this.wakeLock = null; // denied or not permitted; non-fatal
    }
  }

  private releaseWakeLock(): void {
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  // Re-acquire the lock if the tab was backgrounded and returns while running.
  private onVisibility = (): void => {
    if (this.state === 'running' && document.visibilityState === 'visible' && !this.wakeLock) {
      void this.acquireWakeLock();
    }
  };

  private teardown(): void {
    this.stopLoop();
    this.releaseWakeLock();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
