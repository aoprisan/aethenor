import { describe, expect, it } from 'vitest';
import {
  buildVoices,
  planetaryRootHz,
  PLANET_TONE_HZ,
  type DroneParams,
} from './tuning';

function params(over: Partial<DroneParams> = {}): DroneParams {
  return { tuning: 'just', rootHz: 100, density: 1, brightness: 0.5, ...over };
}

describe('buildVoices', () => {
  it('is deterministic for the same params', () => {
    expect(buildVoices(params())).toEqual(buildVoices(params()));
  });

  it('always sounds the root and its sub-octave, even at zero density', () => {
    const voices = buildVoices(params({ density: 0 }));
    const freqs = voices.map((v) => v.freq);
    expect(freqs).toContain(100); // root
    expect(freqs).toContain(50); // sub-octave (1/2)
    expect(voices.length).toBe(2);
  });

  it('adds partials monotonically as density rises', () => {
    let prev = 0;
    for (const density of [0, 0.25, 0.45, 0.65, 0.8, 0.92, 1]) {
      const n = buildVoices(params({ density })).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('stacks pure ratios in just intonation (octave = 2×, fifth = 1.5×)', () => {
    const freqs = buildVoices(params({ tuning: 'just' })).map((v) => v.freq);
    expect(freqs).toContain(200); // octave
    expect(freqs).toContain(150); // perfect fifth
  });

  it('differs from just on the third in Pythagorean tuning', () => {
    const just = buildVoices(params({ tuning: 'just' }));
    const pyth = buildVoices(params({ tuning: 'pythagorean' }));
    const third = (vs: ReturnType<typeof buildVoices>) =>
      vs.find((v) => v.freq > 120 && v.freq < 130)?.freq;
    expect(third(just)).toBeCloseTo(125, 5); // 5/4
    expect(third(pyth)).toBeCloseTo(126.5625, 4); // 81/64
  });

  it('brightness scales the upper partials but never the root', () => {
    const dark = buildVoices(params({ brightness: 0 }));
    const bright = buildVoices(params({ brightness: 1 }));
    const root = (vs: ReturnType<typeof buildVoices>) => vs.find((v) => v.freq === 100)!.gain;
    const octave = (vs: ReturnType<typeof buildVoices>) => vs.find((v) => v.freq === 200)!.gain;
    expect(root(dark)).toBe(root(bright));
    expect(octave(bright)).toBeGreaterThan(octave(dark));
  });

  it('clamps density and brightness out-of-range without throwing', () => {
    expect(() => buildVoices(params({ density: 5, brightness: -3 }))).not.toThrow();
    expect(buildVoices(params({ density: 5 })).length).toBe(buildVoices(params({ density: 1 })).length);
  });
});

describe('planetary tones', () => {
  it('exposes a Cousto tone for every planet', () => {
    for (const hz of Object.values(PLANET_TONE_HZ)) {
      expect(hz).toBeGreaterThan(100);
      expect(hz).toBeLessThan(300);
    }
  });

  it('resolves a root frequency by planet', () => {
    expect(planetaryRootHz('Saturn')).toBe(PLANET_TONE_HZ.Saturn);
  });
});
