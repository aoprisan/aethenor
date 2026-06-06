// Candle-watch (Trāṭaka) ritual definitions — data only, safe to land
// pre-implementation. A ritual is a fixed-gaze meditation expressed as a number
// of rounds, each round a `gaze` phase (eyes open, steady on the flame) followed
// by an optional `rest` phase (eyes closed, holding the afterimage). Phases map
// to chimes: gaze start = single low bell, rest start = soft double bell.

export type CandlePhaseKind = 'gaze' | 'rest';

export interface CandlePhase {
  kind: CandlePhaseKind;
  seconds: number;
}

export interface CandleRitual {
  id: string;
  name: string;
  description: string;
  /** Seconds gazing at the flame per round. */
  gazeSec: number;
  /** Seconds of eyes-closed rest per round; 0 omits the rest phase. */
  restSec: number;
  /** Number of gaze/rest rounds. */
  rounds: number;
}

export const CANDLE_RITUALS: CandleRitual[] = [
  {
    id: 'trataka-short',
    name: 'Trāṭaka — Short',
    description: 'One minute gaze, one minute inner gaze. Five rounds (~10 min).',
    gazeSec: 60,
    restSec: 60,
    rounds: 5,
  },
  {
    id: 'trataka-standard',
    name: 'Trāṭaka — Standard',
    description: 'Two-minute rounds, gaze then afterimage. Five rounds (~20 min).',
    gazeSec: 120,
    restSec: 120,
    rounds: 5,
  },
  {
    id: 'steady-flame',
    name: 'Steady Flame',
    description: 'A single unbroken five-minute gaze, then settle.',
    gazeSec: 300,
    restSec: 60,
    rounds: 1,
  },
  {
    id: 'vigil',
    name: 'Vigil',
    description: 'Long watch — three-minute gaze, two-minute rest. Four rounds (~20 min).',
    gazeSec: 180,
    restSec: 120,
    rounds: 4,
  },
];

export function ritualById(id: string): CandleRitual | undefined {
  return CANDLE_RITUALS.find((r) => r.id === id);
}

/** Expand a ritual into its ordered phase sequence. */
export function ritualPhases(r: CandleRitual): CandlePhase[] {
  const phases: CandlePhase[] = [];
  for (let i = 0; i < Math.max(1, r.rounds); i++) {
    if (r.gazeSec > 0) phases.push({ kind: 'gaze', seconds: r.gazeSec });
    if (r.restSec > 0) phases.push({ kind: 'rest', seconds: r.restSec });
  }
  return phases;
}

/** Total scheduled length of a ritual, in seconds. */
export function ritualDurationSec(r: CandleRitual): number {
  return ritualPhases(r).reduce((sum, p) => sum + p.seconds, 0);
}
