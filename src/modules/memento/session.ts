// Memento mori session runner: loops a breath pattern (like BreathSession) but
// for a *fixed* total length (like CandleSession) — when the time is spent, the
// candle has burned down and the session completes itself. Fires breath cues on
// each phase, ticks elapsed/remaining so the UI can burn the candle down and
// advance the contemplations, and holds a Screen Wake Lock so the display can't
// sleep and suspend audio during the eyes-closed contemplation.

import type { BreathPhase } from '../breath/patterns';
import type { CueEngine } from '../breath/audio';
import type { Meditation } from './meditations';

export interface MementoCallbacks {
  onPhase: (phase: BreathPhase) => void;
  onTick: (elapsedSec: number, remainingSec: number, phase: BreathPhase) => void;
  onState: (state: MementoState) => void;
  /** Fired once when the candle/time is fully spent (not on a manual stop). */
  onComplete: (elapsedSec: number) => void;
}

export type MementoState = 'idle' | 'running' | 'paused' | 'stopped' | 'completed';

export class MementoSession {
  private phases: BreathPhase[];
  private totalMs: number;
  private cues: CueEngine;
  private cb: MementoCallbacks;

  private state: MementoState = 'idle';
  private phaseIdx = 0;
  private phaseStart = 0; // performance.now() when the current phase began
  private interval: number | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  // Elapsed accounting (excludes paused time).
  private accumulatedMs = 0;
  private segmentStart = 0;

  constructor(meditation: Meditation, cues: CueEngine, cb: MementoCallbacks) {
    this.phases = meditation.phases.length ? meditation.phases : [{ kind: 'exhale', seconds: 6 }];
    this.totalMs = Math.max(1000, meditation.totalSec * 1000);
    this.cues = cues;
    this.cb = cb;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get elapsedSec(): number {
    const live = this.state === 'running' ? performance.now() - this.segmentStart : 0;
    return Math.round((this.accumulatedMs + live) / 1000);
  }

  /** Begin. Await from the start tap so the CueEngine unlocks audio in-gesture. */
  async start(): Promise<void> {
    await this.cues.unlock();
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
    // Restart the current phase's timing so its cue lines up with the visual.
    this.phaseStart = performance.now();
    await this.acquireWakeLock();
    this.cb.onPhase(this.phases[this.phaseIdx]);
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
    this.cues.silence();
    this.releaseWakeLock();
    this.cb.onState(this.state);
    this.teardown();
  }

  private enterPhase(): void {
    this.phaseStart = performance.now();
    const phase = this.phases[this.phaseIdx];
    this.cues.cue(phase.kind);
    this.cb.onPhase(phase);
  }

  private complete(): void {
    if (this.state === 'running') this.accumulatedMs += performance.now() - this.segmentStart;
    const elapsed = Math.round(this.accumulatedMs / 1000);
    this.state = 'completed';
    this.stopLoop();
    this.releaseWakeLock();
    this.cues.silence();
    this.cb.onState(this.state);
    this.cb.onComplete(elapsed);
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
    const totalElapsed = this.accumulatedMs + (performance.now() - this.segmentStart);
    const remainingSec = Math.max(0, Math.ceil((this.totalMs - totalElapsed) / 1000));
    this.cb.onTick(Math.round(totalElapsed / 1000), remainingSec, this.phases[this.phaseIdx]);

    if (totalElapsed >= this.totalMs) {
      this.complete();
      return;
    }

    // Advance the breath phase (looping) when the current one is spent.
    const phase = this.phases[this.phaseIdx];
    if (performance.now() - this.phaseStart >= phase.seconds * 1000) {
      this.phaseIdx = (this.phaseIdx + 1) % this.phases.length;
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
