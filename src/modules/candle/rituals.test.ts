import { describe, expect, it } from 'vitest';
import {
  CANDLE_RITUALS,
  ritualById,
  ritualPhases,
  ritualDurationSec,
  type CandleRitual,
} from './rituals';

const ritual = (over: Partial<CandleRitual> = {}): CandleRitual => ({
  id: 'r',
  name: 'R',
  description: '',
  gazeSec: 60,
  restSec: 30,
  rounds: 3,
  ...over,
});

describe('candle rituals', () => {
  it('expands each round into a gaze then a rest phase', () => {
    const phases = ritualPhases(ritual());
    expect(phases.map((p) => p.kind)).toEqual([
      'gaze', 'rest', 'gaze', 'rest', 'gaze', 'rest',
    ]);
    expect(phases.map((p) => p.seconds)).toEqual([60, 30, 60, 30, 60, 30]);
  });

  it('omits the rest phase when restSec is 0', () => {
    const phases = ritualPhases(ritual({ restSec: 0, rounds: 2 }));
    expect(phases.map((p) => p.kind)).toEqual(['gaze', 'gaze']);
  });

  it('always yields at least one round', () => {
    expect(ritualPhases(ritual({ rounds: 0 }))).toHaveLength(2);
  });

  it('sums total scheduled duration', () => {
    expect(ritualDurationSec(ritual())).toBe(3 * (60 + 30));
    expect(ritualDurationSec(ritual({ restSec: 0, rounds: 4 }))).toBe(4 * 60);
  });

  it('looks rituals up by id, with unique ids', () => {
    const ids = CANDLE_RITUALS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ritualById('trataka-short')?.name).toBe('Trāṭaka — Short');
    expect(ritualById('nope')).toBeUndefined();
  });
});
