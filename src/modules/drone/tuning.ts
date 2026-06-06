// The Monochord's tuning — pure, deterministic harmonic content.
//
// A drone is built from a single root pitch plus a scaffold of partials
// stacked above and below it. This module decides the *frequencies and
// relative gains* of those partials; the engine (engine.ts) turns them into
// sound and adds the slow detuned beating and movement. Keeping the harmony
// here — like patterns.ts is to the breath session — keeps it unit-testable
// and free of Web Audio.
//
// Robert Fludd's monochordum mundi tuned one string to the cosmos; the root
// here is likewise a *planetary* tone (Hans Cousto's "Cosmic Octave", octave-
// reduced into the audible range), while the chosen tuning system decides how
// the overtones stack on top of it.

import type { Planet } from '../timing/astro';

export type TuningSystem = 'just' | 'pythagorean' | 'equal' | 'planetary';

export const TUNINGS: { id: TuningSystem; name: string; description: string }[] = [
  { id: 'just', name: 'Just', description: 'Pure whole-number ratios — beatless, ringing.' },
  { id: 'pythagorean', name: 'Pythagorean', description: 'Stacked fifths; a bright, archaic third.' },
  { id: 'equal', name: 'Equal', description: 'Even temperament — familiar, slightly tempered.' },
  { id: 'planetary', name: 'Planetary', description: 'Pure ratios locked to the ruling planet of the hour.' },
];

/** Cousto "Cosmic Octave" planetary tones, in Hz, in the audible range. */
export const PLANET_TONE_HZ: Record<Planet, number> = {
  Saturn: 147.85,
  Jupiter: 183.58,
  Mars: 144.72,
  Sun: 136.1, // the Earth-year "OM" tone
  Venus: 221.23,
  Mercury: 141.27,
  Moon: 210.42, // synodic month
};

export function planetaryRootHz(planet: Planet): number {
  return PLANET_TONE_HZ[planet];
}

export interface DroneParams {
  tuning: TuningSystem;
  /** Root frequency in Hz (typically a planetary tone). */
  rootHz: number;
  /** 0..1 — how many partials sound (foundation only → full stack). */
  density: number;
  /** 0..1 — gain of the upper partials (the filter cutoff is the engine's). */
  brightness: number;
}

/** One sustained partial: an absolute frequency and a relative amplitude. */
export interface Partial {
  freq: number; // Hz
  gain: number; // 0..1, relative to the root
}

// The interval ladder, as semitone offsets from the root, lowest → highest.
// `at` is the density threshold above which the rung sounds, so raising
// density only ever *adds* partials (monotonic — relied on by the engine's
// live re-voicing and by the tests).
const LADDER: { semi: number; gain: number; at: number }[] = [
  { semi: -12, gain: 0.7, at: 0 }, // sub-octave — the drone's foundation
  { semi: 0, gain: 1.0, at: 0 }, // root — always
  { semi: 7, gain: 0.5, at: 0.25 }, // perfect fifth
  { semi: 12, gain: 0.4, at: 0.45 }, // octave
  { semi: 4, gain: 0.32, at: 0.65 }, // third (colour of the tuning)
  { semi: 19, gain: 0.22, at: 0.8 }, // octave + fifth
  { semi: 24, gain: 0.16, at: 0.92 }, // two octaves
];

// Pure interval ratios keyed by semitone offset. Equal temperament is computed.
const JUST: Record<number, number> = { [-12]: 1 / 2, 0: 1, 4: 5 / 4, 7: 3 / 2, 12: 2, 19: 3, 24: 4 };
const PYTH: Record<number, number> = { [-12]: 1 / 2, 0: 1, 4: 81 / 64, 7: 3 / 2, 12: 2, 19: 3, 24: 4 };

function ratio(system: TuningSystem, semi: number): number {
  if (system === 'equal') return Math.pow(2, semi / 12);
  // 'planetary' uses pure just intonation; only its root differs.
  const table = system === 'pythagorean' ? PYTH : JUST;
  return table[semi] ?? Math.pow(2, semi / 12);
}

/** Resolve the drone parameters into the concrete set of partials to sound.
 *  Deterministic: same params in → same partials out. */
export function buildVoices(p: DroneParams): Partial[] {
  const density = clamp01(p.density);
  const brightness = clamp01(p.brightness);
  const out: Partial[] = [];
  for (const rung of LADDER) {
    if (density < rung.at) continue;
    let gain = rung.gain;
    // Partials above the root are scaled by brightness so the timbre can open
    // and close (e.g. driven by lunar illumination) without retuning.
    if (rung.semi > 0) gain *= 0.4 + 0.6 * brightness;
    out.push({ freq: p.rootHz * ratio(p.tuning, rung.semi), gain });
  }
  return out;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
