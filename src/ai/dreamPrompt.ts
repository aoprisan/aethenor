// Dream-interpretation prompt builder — the AI layer for the Dream Diary.
//
// Like `prompt.ts`, this is a PURE, TESTABLE function. It makes NO network calls
// and holds NO keys. It turns one or more dreams (+ optional astrological
// context) into a single prompt string that the UI hands to the native share
// sheet (Web Share API) or the clipboard. The user picks their own agent
// (e.g. Claude); Athanor never talks to a model itself.

import type { DreamEntry } from '../db/schema';
import type { AstroContext } from './prompt';

/** What the user wants the agent to do with their dreams. */
export type DreamIntent =
  | 'interpret-dream'
  | 'find-patterns-in-dreams'
  | 'continue-the-dream';

/** Input to the pure builder. */
export interface DreamPromptInput {
  intent: DreamIntent;
  /** Pre-selected dreams (the caller resolves these). */
  dreams: DreamEntry[];
  /** Current/relevant astrological context, or undefined. */
  context?: AstroContext;
  /** Drop the free-text body, keeping only title/tags/timing. */
  includeBody?: boolean; // default true
}

/** Output of the builder. `text` is what gets shared/copied. */
export interface BuiltDreamPrompt {
  title: string;
  text: string;
  meta: {
    dreamCount: number;
    charCount: number;
    intent: DreamIntent;
  };
}

const INTENT_LABEL: Record<DreamIntent, string> = {
  'interpret-dream': 'interpret this dream',
  'find-patterns-in-dreams': 'find patterns across my dreams',
  'continue-the-dream': 'continue the dream',
};

const INTENT_INSTRUCTION: Record<DreamIntent, string> = {
  'interpret-dream':
    'Offer a grounded interpretation of the dream(s) below. Surface the central images, emotional tone, and any tensions or unfinished movement. Draw on symbolic, psychological, and somatic readings, but stay specific to what is actually here — avoid generic dream-dictionary clichés.',
  'find-patterns-in-dreams':
    'Examine the dreams below as a set. Identify recurring images, symbols, settings, characters, and emotional arcs, and note how they correlate with date, tags, lucidity, or astrological timing. Name concrete patterns and cite the specific dreams that support each.',
  'continue-the-dream':
    'Treat the dream below as an unfinished story. First reflect briefly on where it seems to be heading, then offer one or two evocative continuations that honour its imagery and logic. Keep it dreamlike rather than tidy.',
};

const INTENT_CLOSING: Record<DreamIntent, string> = {
  'interpret-dream':
    'Keep your reading concrete and personal. Where the dream is ambiguous, say so rather than over-interpreting.',
  'find-patterns-in-dreams':
    'Cite the specific dreams (by date or title) that support each pattern you name.',
  'continue-the-dream':
    'Offer at most two continuations, and keep the voice of the dream.',
};

// Deterministic UTC formatting (no locale, no Date.now) so the builder is fully
// reproducible in tests.
function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function renderContext(ctx: AstroContext): string {
  const lines = [
    'Current context:',
    `- Moon: ${ctx.moonPhaseName} (${Math.round(ctx.moonIllumination * 100)}% illuminated)`,
    `- Planetary hour ruler: ${ctx.planetaryHourRuler}`,
    `- Day ruler: ${ctx.dayRuler}`,
  ];
  if (ctx.location?.label) lines.push(`- Location: ${ctx.location.label}`);
  return lines.join('\n');
}

function renderDream(d: DreamEntry, n: number, includeBody: boolean): string {
  const lines: string[] = [];
  const title = d.title.trim() || 'Untitled dream';
  lines.push(`${n}. ${fmtDate(d.timestamp)} — ${title}${d.lucid ? ' (lucid)' : ''}`);
  if (d.tags.length) lines.push(`   Tags: ${d.tags.join(', ')}`);
  if (d.context?.planetaryHourRuler || d.context?.dayRuler) {
    lines.push(
      `   Timing: day ${d.context.dayRuler ?? '?'}, hour ${d.context.planetaryHourRuler ?? '?'}`,
    );
  }
  if (includeBody && d.body.trim()) {
    lines.push(`   Dream: ${d.body.trim().replace(/\s*\n\s*/g, ' / ')}`);
  }
  return lines.join('\n');
}

/**
 * Pure dream-prompt builder. Deterministic for a given input (no Date.now(), no
 * randomness) so it is fully unit-testable.
 */
export function buildDreamPrompt(input: DreamPromptInput): BuiltDreamPrompt {
  const includeBody = input.includeBody !== false;
  // Most-recent-first for readability.
  const dreams = [...input.dreams].sort((a, b) => b.timestamp - a.timestamp);

  const parts: string[] = [];
  parts.push(
    'You are assisting with a personal dream diary. The dreamer has chosen to share the following dream(s) with you.',
  );
  parts.push(INTENT_INSTRUCTION[input.intent]);
  if (input.context) parts.push(renderContext(input.context));

  if (dreams.length) {
    parts.push(
      'Dreams (most recent first):\n' +
        dreams.map((d, i) => renderDream(d, i + 1, includeBody)).join('\n\n'),
    );
  } else {
    parts.push('(No dreams were selected.)');
  }
  parts.push(INTENT_CLOSING[input.intent]);

  const text = parts.join('\n\n');
  return {
    title: `Athanor — ${INTENT_LABEL[input.intent]}`,
    text,
    meta: { dreamCount: dreams.length, charCount: text.length, intent: input.intent },
  };
}
