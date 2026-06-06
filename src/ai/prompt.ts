// "Ask the Hierophant" — the AI layer.
//
// This module is a PURE, TESTABLE prompt-builder. It makes NO network calls and
// holds NO keys. It takes selected Record data + current astrological context
// and produces a single prompt string, which the UI then hands to the native
// share sheet (Web Share API) or the clipboard. Egress is the user's choice of
// agent; Athanor never talks to a model itself.
//
// PROMPT-BUILDER I/O PROPOSAL (v1). The builder is exported as a pure function
// so it can be unit-tested in isolation. Implementation body is deferred until
// this shape is confirmed.

import type { RecordEntry } from '../db/schema';

/** What the user wants the agent to do — drives the instruction preamble. */
export type IntentTemplate =
  | 'interpret-recent-practice'
  | 'find-patterns-in-dreams'
  | 'suggest-tomorrows-working';

/** Astrological "now" snapshot, supplied by the timing module. */
export interface AstroContext {
  date: number; // epoch ms the prompt is built for
  moonPhase: number; // 0..1 (0/1 = new, 0.5 = full)
  moonIllumination: number; // 0..1
  moonPhaseName: string; // e.g. "Waxing Gibbous"
  planetaryHourRuler: string; // e.g. "Mars"
  dayRuler: string; // e.g. "Sun"
  location?: { lat: number; lon: number; label?: string };
}

/** Input to the pure builder. */
export interface PromptInput {
  intent: IntentTemplate;
  /** Pre-selected, pre-filtered entries (the scope picker resolves these). */
  entries: RecordEntry[];
  /** Current context, or undefined if timing is unavailable/declined. */
  context?: AstroContext;
  /** How the scope was chosen — included verbatim in the prompt for the agent's
   *  situational awareness, and useful for snapshot tests. */
  scope: PromptScope;
  /** Redaction: drop free-text notes, keeping only structured fields. */
  includeNotes?: boolean; // default true
}

/** Describes how `entries` were selected (mirrors the scope-picker UI). */
export type PromptScope =
  | { kind: 'last-n'; n: number }
  | { kind: 'date-range'; from: number; to: number }
  | { kind: 'tags'; tags: string[] };

/** Output of the builder. `text` is what gets shared/copied. */
export interface BuiltPrompt {
  title: string; // share-sheet title, e.g. "Athanor — interpret recent practice"
  text: string; // the full prompt
  /** Counts for the UI ("Sharing 12 sessions, ~1.8k chars"). */
  meta: {
    entryCount: number;
    charCount: number;
    intent: IntentTemplate;
  };
}

const INTENT_LABEL: Record<IntentTemplate, string> = {
  'interpret-recent-practice': 'interpret recent practice',
  'find-patterns-in-dreams': 'find patterns in my dreams',
  'suggest-tomorrows-working': "suggest tomorrow's working",
};

const INTENT_INSTRUCTION: Record<IntentTemplate, string> = {
  'interpret-recent-practice':
    'Read the practice log below and offer a grounded interpretation of what is unfolding — recurring themes, shifts in subjective state, and anything worth attending to. Be specific and avoid generic wellness advice.',
  'find-patterns-in-dreams':
    'Examine the dream, omen, and divination notes below. Identify recurring images, symbols, and motifs, and how they correlate with technique, timing, or subjective state. Name concrete patterns rather than vague themes.',
  'suggest-tomorrows-working':
    "Based on the recent practice below and the current astrological context, suggest a focused working for tomorrow — a technique, a duration, and an intention. Justify it from the data, not from generic recommendations.",
};

const INTENT_CLOSING: Record<IntentTemplate, string> = {
  'interpret-recent-practice':
    'Keep your reading concise and concrete. Where the data is thin, say so rather than inventing.',
  'find-patterns-in-dreams':
    'Cite the specific entries that support each pattern you name.',
  'suggest-tomorrows-working':
    'Give one primary suggestion and at most one alternative.',
};

// Deterministic UTC formatting (no locale, no Date.now) so the builder is
// fully reproducible in tests. Prompts read UTC unambiguously.
function fmtDateTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m${s ? ` ${s}s` : ''}` : `${s}s`;
}

function describeScope(scope: PromptScope): string {
  switch (scope.kind) {
    case 'last-n':
      return `last ${scope.n} session${scope.n === 1 ? '' : 's'}`;
    case 'date-range':
      return `${fmtDate(scope.from)} to ${fmtDate(scope.to)}`;
    case 'tags':
      return scope.tags.length ? `tagged ${scope.tags.join(', ')}` : 'all entries';
  }
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

function renderEntry(e: RecordEntry, n: number, includeNotes: boolean): string {
  const lines: string[] = [];
  lines.push(`${n}. ${fmtDateTime(e.timestamp)} · ${e.technique} · ${fmtDuration(e.durationSec)}`);

  const state: string[] = [];
  if (e.state.depth != null) state.push(`depth ${e.state.depth}/5`);
  if (e.state.arousal != null) state.push(`arousal ${e.state.arousal}/5`);
  if (e.state.qualities?.length) state.push(e.state.qualities.join(', '));
  if (state.length) lines.push(`   State: ${state.join('; ')}`);

  if (e.retentions.length) {
    const r = e.retentions.map((x) => `${x.phase} ${x.seconds}s`).join(', ');
    lines.push(`   Retentions: ${r}`);
  }
  if (e.tags.length) lines.push(`   Tags: ${e.tags.join(', ')}`);
  if (e.context?.planetaryHourRuler || e.context?.dayRuler) {
    lines.push(
      `   Timing: day ${e.context.dayRuler ?? '?'}, hour ${e.context.planetaryHourRuler ?? '?'}`,
    );
  }
  if (includeNotes && e.notes.trim()) {
    lines.push(`   Notes: ${e.notes.trim().replace(/\s*\n\s*/g, ' / ')}`);
  }
  return lines.join('\n');
}

/**
 * Pure prompt builder. Deterministic for a given input (no Date.now(), no
 * randomness) so it is fully unit-testable.
 */
export function buildPrompt(input: PromptInput): BuiltPrompt {
  const includeNotes = input.includeNotes !== false;
  // Most-recent-first for readability.
  const entries = [...input.entries].sort((a, b) => b.timestamp - a.timestamp);

  const parts: string[] = [];
  parts.push(
    'You are assisting with a personal hermetic breathwork and contemplative practice journal known as "The Magical Record". The practitioner has chosen to share the following data with you.',
  );
  parts.push(INTENT_INSTRUCTION[input.intent]);
  if (input.context) parts.push(renderContext(input.context));
  parts.push(`Scope: ${describeScope(input.scope)} — ${entries.length} session(s).`);

  if (entries.length) {
    parts.push(
      'Sessions (most recent first):\n' +
        entries.map((e, i) => renderEntry(e, i + 1, includeNotes)).join('\n\n'),
    );
  } else {
    parts.push('(No sessions matched the selected scope.)');
  }
  parts.push(INTENT_CLOSING[input.intent]);

  const text = parts.join('\n\n');
  return {
    title: `Athanor — ${INTENT_LABEL[input.intent]}`,
    text,
    meta: { entryCount: entries.length, charCount: text.length, intent: input.intent },
  };
}
