// Breath pattern definitions (data only — safe to land pre-implementation).
// A pattern is an ordered list of phases with durations in seconds. Phases map
// to audio cues: inhale = ascending tone, hold = steady, exhale = descending.

export type BreathPhaseKind = 'inhale' | 'hold-in' | 'exhale' | 'hold-out';

export interface BreathPhase {
  kind: BreathPhaseKind;
  seconds: number;
}

export interface BreathPattern {
  id: string;
  name: string;
  description: string;
  phases: BreathPhase[];
  /** If true, alternate-nostril guidance applies (UI nuance only). */
  alternateNostril?: boolean;
}

export const PATTERNS: BreathPattern[] = [
  {
    id: 'box-4-4-4-4',
    name: 'Box',
    description: 'Equal four-count square. Steadying, neutral.',
    phases: [
      { kind: 'inhale', seconds: 4 },
      { kind: 'hold-in', seconds: 4 },
      { kind: 'exhale', seconds: 4 },
      { kind: 'hold-out', seconds: 4 },
    ],
  },
  {
    id: '4-7-8',
    name: '4-7-8',
    description: 'Long retention, longer exhale. Settling toward sleep.',
    phases: [
      { kind: 'inhale', seconds: 4 },
      { kind: 'hold-in', seconds: 7 },
      { kind: 'exhale', seconds: 8 },
    ],
  },
  {
    id: 'coherent-5.5',
    name: 'Coherent',
    description: '~5.5 breaths/min. Balanced resonance.',
    phases: [
      { kind: 'inhale', seconds: 5.5 },
      { kind: 'exhale', seconds: 5.5 },
    ],
  },
  {
    id: 'nadi-shodhana',
    name: 'Nadi Shodhana',
    description: 'Alternate-nostril cleansing breath.',
    alternateNostril: true,
    phases: [
      { kind: 'inhale', seconds: 4 },
      { kind: 'hold-in', seconds: 4 },
      { kind: 'exhale', seconds: 4 },
      { kind: 'hold-out', seconds: 2 },
    ],
  },
];

export function patternById(id: string): BreathPattern | undefined {
  return PATTERNS.find((p) => p.id === id);
}
