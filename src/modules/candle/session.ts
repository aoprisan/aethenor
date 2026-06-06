// Candle-watch session runner: drives a finite gaze/rest phase sequence, fires
// chimes, tracks elapsed time, and holds a Screen Wake Lock so the display can't
// sleep mid-watch (critical — the flame must stay lit, and rest phases are
// eyes-closed). Unlike BreathSession this is finite: it completes itself when
// the last phase ends.

import type { CandleRitual, CandlePhase } from './rituals';
import { ritualPhases } from './rituals';
import type { CandleChime } from './chime';

export interface CandleCallbacks {
  onPhase: (phase: CandlePhase, phaseIndex: number, round: number) => void;
  onTick: (remainingSec: number, phase: CandlePhase) => void;
  onState: (state: CandleState) => void;
  /** Fired once when the full ritual finishes (not on a manual stop). */
  onComplete: (elapsedSec: number, rounds: number) => void;
}

export type CandleState = 'idle' | 'running' | 'paused' | 'stopped' | 'completed';

export class CandleSession {
  private phases: CandlePhase[];
  private chime: CandleChime;
  private cb: CandleCallbacks;

  private state: CandleState = 'idle';
  private phaseIdx = 0;
  private phaseStart = 0; // performance.now() when the current phase began
  private interval: number | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  // Elapsed accounting (excludes paused time).
  private accumulatedMs = 0;
  private segmentStart = 0;

  constructor(ritual: CandleRitual, chime: CandleChime, cb: CandleCallbacks) {
    this.phases = ritualPhases(ritual);
    this.chime = chime;
    this.cb = cb;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get elapsedSec(): number {
    const live = this.state === 'running' ? performance.now() - this.segmentStart : 0;
    return Math.round((this.accumulatedMs + live) / 1000);
  }

  /** Completed gaze/rest rounds so far (two phases per round when rest > 0). */
  get rounds(): number {
    const perRound = this.phases.some((p) => p.kind === 'rest') ? 2 : 1;
    return Math.floor(this.phaseIdx / perRound);
  }

  /** Begin. Await from the start tap so the chime unlocks audio in-gesture. */
  async start(): Promise<void> {
    if (this.phases.length === 0) return;
    await this.chime.unlock();
    this.state = 'running';
    this.phaseIdx = 0;
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
    this.chime.silence();
    this.stopLoop();
    this.releaseWakeLock();
    this.cb.onState(this.state);
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused') return;
    await this.chime.unlock();
    this.state = 'running';
    this.segmentStart = performance.now();
    // Restart the current phase's timing so its remaining count resumes cleanly.
    this.phaseStart = performance.now();
    await this.acquireWakeLock();
    this.cb.onPhase(this.phases[this.phaseIdx], this.phaseIdx, this.rounds);
    this.loop();
    this.cb.onState(this.state);
  }

  /** Manual stop (early). Distinct from natural completion. */
  stop(): void {
    if (this.state === 'stopped' || this.state === 'idle' || this.state === 'completed') {
      this.teardown();
      return;
    }
    if (this.state === 'running') this.accumulatedMs += performance.now() - this.segmentStart;
    this.state = 'stopped';
    this.stopLoop();
    this.chime.silence();
    this.releaseWakeLock();
    this.cb.onState(this.state);
    this.teardown();
  }

  private enterPhase(): void {
    this.phaseStart = performance.now();
    const phase = this.phases[this.phaseIdx];
    this.chime.cue(phase.kind);
    this.cb.onPhase(phase, this.phaseIdx, this.rounds);
  }

  private complete(): void {
    if (this.state === 'running') this.accumulatedMs += performance.now() - this.segmentStart;
    const elapsed = Math.round(this.accumulatedMs / 1000);
    const totalRounds = this.phases.some((p) => p.kind === 'rest')
      ? this.phases.length / 2
      : this.phases.length;
    this.state = 'completed';
    this.stopLoop();
    this.releaseWakeLock();
    this.chime.complete();
    this.cb.onState(this.state);
    this.cb.onComplete(elapsed, totalRounds);
    this.teardown();
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
        this.complete();
        return;
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
