import { describe, expect, it } from 'vitest';
import { buildPrompt, type AstroContext, type PromptInput } from './prompt';
import type { RecordEntry } from '../db/schema';

function entry(over: Partial<RecordEntry> = {}): RecordEntry {
  return {
    id: 'e1',
    timestamp: Date.UTC(2026, 0, 2, 7, 30), // fixed, so output is deterministic
    technique: 'box-4-4-4-4',
    durationSec: 600,
    retentions: [{ phase: 'antara', seconds: 12 }],
    notes: 'Steady.\nSaw a door.',
    state: { depth: 4, arousal: 2, qualities: ['lucid'] },
    tags: ['dream'],
    context: { dayRuler: 'Sun', planetaryHourRuler: 'Mars' },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const ctx: AstroContext = {
  date: Date.UTC(2026, 0, 2, 8, 0),
  moonPhase: 0.5,
  moonIllumination: 0.98,
  moonPhaseName: 'Full Moon',
  planetaryHourRuler: 'Venus',
  dayRuler: 'Saturn',
};

describe('buildPrompt', () => {
  it('is deterministic for the same input', () => {
    const input: PromptInput = {
      intent: 'interpret-recent-practice',
      entries: [entry()],
      scope: { kind: 'last-n', n: 1 },
      context: ctx,
    };
    expect(buildPrompt(input).text).toEqual(buildPrompt(input).text);
  });

  it('includes context, scope, and entry data', () => {
    const out = buildPrompt({
      intent: 'interpret-recent-practice',
      entries: [entry()],
      scope: { kind: 'last-n', n: 1 },
      context: ctx,
    });
    expect(out.title).toBe('Athanor — interpret recent practice');
    expect(out.text).toContain('Full Moon (98% illuminated)');
    expect(out.text).toContain('Planetary hour ruler: Venus');
    expect(out.text).toContain('last 1 session');
    expect(out.text).toContain('box-4-4-4-4');
    expect(out.text).toContain('depth 4/5; arousal 2/5; lucid');
    expect(out.text).toContain('antara 12s');
    expect(out.meta.entryCount).toBe(1);
  });

  it('redacts notes when includeNotes is false', () => {
    const withNotes = buildPrompt({
      intent: 'interpret-recent-practice',
      entries: [entry()],
      scope: { kind: 'last-n', n: 1 },
      includeNotes: true,
    });
    const without = buildPrompt({
      intent: 'interpret-recent-practice',
      entries: [entry()],
      scope: { kind: 'last-n', n: 1 },
      includeNotes: false,
    });
    expect(withNotes.text).toContain('Saw a door');
    expect(without.text).not.toContain('Saw a door');
  });

  it('sorts entries most-recent-first', () => {
    const older = entry({ id: 'old', timestamp: Date.UTC(2026, 0, 1), technique: 'older-tech' });
    const newer = entry({ id: 'new', timestamp: Date.UTC(2026, 0, 5), technique: 'newer-tech' });
    const out = buildPrompt({
      intent: 'find-patterns-in-dreams',
      entries: [older, newer],
      scope: { kind: 'tags', tags: ['dream'] },
    });
    expect(out.text.indexOf('newer-tech')).toBeLessThan(out.text.indexOf('older-tech'));
  });

  it('handles an empty scope gracefully', () => {
    const out = buildPrompt({
      intent: 'suggest-tomorrows-working',
      entries: [],
      scope: { kind: 'last-n', n: 5 },
    });
    expect(out.text).toContain('No sessions matched');
    expect(out.meta.entryCount).toBe(0);
  });
});
