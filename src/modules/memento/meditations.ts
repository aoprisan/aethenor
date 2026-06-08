// Memento mori meditation definitions — data only, safe to land
// pre-implementation. A meditation is a slow breath rhythm (reusing the breath
// module's phase vocabulary) held for a fixed total length, over which a single
// candle visibly burns down — the meditation ends when the wax (and the time)
// is spent. Phases map to the same gentle breath cues: rising tone = inhale,
// falling = exhale.

import type { BreathPhase } from '../breath/patterns';

export interface Meditation {
  id: string;
  name: string;
  description: string;
  /** Total length of the contemplation, in seconds — the candle's whole life. */
  totalSec: number;
  /** The breath cycle, looped for the duration. */
  phases: BreathPhase[];
}

/** A slow, even breath — the contemplative default. */
function evenBreath(seconds: number): BreathPhase[] {
  return [
    { kind: 'inhale', seconds },
    { kind: 'exhale', seconds },
  ];
}

export const MEDITATIONS: Meditation[] = [
  {
    id: 'vespers',
    name: 'Vespers',
    description: 'A short evening sit. Five minutes, an even slow breath.',
    totalSec: 5 * 60,
    phases: evenBreath(5.5),
  },
  {
    id: 'the-hours',
    name: 'The Hours',
    description: 'Eleven minutes — long enough to feel the candle shorten.',
    totalSec: 11 * 60,
    phases: evenBreath(6),
  },
  {
    id: 'long-watch',
    name: 'Long Watch',
    description: 'Twenty minutes of slow breath, with held stillness after the exhale.',
    totalSec: 20 * 60,
    phases: [
      { kind: 'inhale', seconds: 4 },
      { kind: 'hold-in', seconds: 4 },
      { kind: 'exhale', seconds: 6 },
      { kind: 'hold-out', seconds: 4 },
    ],
  },
];

export function meditationById(id: string): Meditation | undefined {
  return MEDITATIONS.find((m) => m.id === id);
}

/** Build a custom meditation from stored settings (total minutes + breath). */
export function customMeditation(custom: {
  minutes: number;
  inhale: number;
  exhale: number;
}): Meditation {
  const phases = [
    { kind: 'inhale' as const, seconds: custom.inhale },
    { kind: 'exhale' as const, seconds: custom.exhale },
  ].filter((p) => p.seconds > 0);
  return {
    id: 'custom',
    name: 'Custom',
    description: 'Your length and breath.',
    totalSec: Math.max(1, Math.round(custom.minutes * 60)),
    phases,
  };
}
