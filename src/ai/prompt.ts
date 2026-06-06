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

/**
 * Pure prompt builder. Deterministic for a given input (no Date.now(), no
 * randomness) so it is fully unit-testable.
 *
 * Implementation deferred until shape is confirmed.
 */
export function buildPrompt(_input: PromptInput): BuiltPrompt {
  throw new Error('buildPrompt: not yet implemented (pending design confirmation)');
}
