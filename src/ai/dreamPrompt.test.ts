import { describe, expect, it } from 'vitest';
import { buildDreamPrompt, type DreamPromptInput } from './dreamPrompt';
import type { AstroContext } from './prompt';
import type { DreamEntry } from '../db/schema';

function dream(over: Partial<DreamEntry> = {}): DreamEntry {
  return {
    id: 'd1',
    timestamp: Date.UTC(2026, 0, 2, 7, 30), // fixed, so output is deterministic
    title: 'The drowned library',
    body: 'Walked through stacks under water.\nA door opened.',
    tags: ['water', 'recurring'],
    lucid: true,
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

describe('buildDreamPrompt', () => {
  it('is deterministic for the same input', () => {
    const input: DreamPromptInput = {
      intent: 'interpret-dream',
      dreams: [dream()],
      context: ctx,
    };
    expect(buildDreamPrompt(input).text).toEqual(buildDreamPrompt(input).text);
  });

  it('includes context, dream data, tags and lucidity', () => {
    const out = buildDreamPrompt({ intent: 'interpret-dream', dreams: [dream()], context: ctx });
    expect(out.title).toBe('Athanor — interpret this dream');
    expect(out.text).toContain('Full Moon (98% illuminated)');
    expect(out.text).toContain('Planetary hour ruler: Venus');
    expect(out.text).toContain('The drowned library (lucid)');
    expect(out.text).toContain('Tags: water, recurring');
    expect(out.text).toContain('Walked through stacks under water');
    expect(out.meta.dreamCount).toBe(1);
  });

  it('redacts the body when includeBody is false', () => {
    const withBody = buildDreamPrompt({ intent: 'interpret-dream', dreams: [dream()], includeBody: true });
    const without = buildDreamPrompt({ intent: 'interpret-dream', dreams: [dream()], includeBody: false });
    expect(withBody.text).toContain('drowned');
    expect(without.text).toContain('The drowned library'); // title kept
    expect(without.text).not.toContain('Walked through stacks');
  });

  it('sorts dreams most-recent-first', () => {
    const older = dream({ id: 'old', timestamp: Date.UTC(2026, 0, 1), title: 'older-dream' });
    const newer = dream({ id: 'new', timestamp: Date.UTC(2026, 0, 5), title: 'newer-dream' });
    const out = buildDreamPrompt({ intent: 'find-patterns-in-dreams', dreams: [older, newer] });
    expect(out.text.indexOf('newer-dream')).toBeLessThan(out.text.indexOf('older-dream'));
  });

  it('handles an empty selection gracefully', () => {
    const out = buildDreamPrompt({ intent: 'continue-the-dream', dreams: [] });
    expect(out.text).toContain('No dreams were selected');
    expect(out.meta.dreamCount).toBe(0);
  });

  it('falls back to "Untitled dream" for a blank title', () => {
    const out = buildDreamPrompt({ intent: 'interpret-dream', dreams: [dream({ title: '   ' })] });
    expect(out.text).toContain('Untitled dream');
  });
});
