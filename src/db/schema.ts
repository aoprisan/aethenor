// IndexedDB schema for The Magical Record.
//
// All practice data lives here, client-side only. The user owns it; nothing is
// ever sent anywhere except via the explicit AI-egress (share/copy) flow. The
// `idb` wrapper gives us a typed, promise-based handle.
//
// SCHEMA PROPOSAL (v1) — see README for rationale. Implementation of the CRUD
// helpers below their signatures is deferred until this shape is confirmed.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/** Subjective state captured per entry (1–5 self-report scale). */
export interface SubjectiveState {
  /** Overall felt intensity / depth of the session, 1–5. */
  depth?: number;
  /** Calm ↔ activated, 1–5. */
  arousal?: number;
  /** Free adjectives the practitioner chooses, e.g. ["lucid", "heavy"]. */
  qualities?: string[];
}

/** A single breath-retention (kumbhaka) measurement within a session. */
export interface RetentionCount {
  /** Phase the hold belongs to: after inhale or after exhale. */
  phase: 'antara' | 'bahya';
  /** Seconds held. */
  seconds: number;
}

/** Tags are open, but these three are first-class for the AI scope picker. */
export type RecordTag = 'dream' | 'omen' | 'divination' | (string & {});

/** One entry in the Magical Record. */
export interface RecordEntry {
  /** uuid (crypto.randomUUID). */
  id: string;
  /** Epoch ms — when the practice occurred. Primary sort + range key. */
  timestamp: number;
  /** Technique / pattern name, e.g. "box-4-4-4-4", "nadi-shodhana", "free". */
  technique: string;
  /** Total session length in seconds. */
  durationSec: number;
  /** Retention counts recorded during the session. */
  retentions: RetentionCount[];
  /** Free-text journal. */
  notes: string;
  /** Subjective self-report. */
  state: SubjectiveState;
  /** Tags; `dream` / `omen` / `divination` drive AI scoping. */
  tags: RecordTag[];
  /** Optional astrological context snapshot at time of entry (denormalised
   *  so historical readings stay accurate even if libs change). */
  context?: {
    moonPhase?: number; // 0..1
    moonIllumination?: number; // 0..1
    planetaryHourRuler?: string; // e.g. "Mars"
    dayRuler?: string; // e.g. "Sun"
  };
  /** Audit. */
  createdAt: number;
  updatedAt: number;
}

/** One night's dream in the Dream Diary. Kept separate from RecordEntry: a
 *  dream is a narrative (title + body) anchored to a date, not a timed session.
 *  Astrological `context` is denormalised on, like RecordEntry, so old dreams
 *  keep their sky even if the timing libs change. */
export interface DreamEntry {
  /** uuid (crypto.randomUUID). */
  id: string;
  /** Epoch ms — the night/morning of the dream. Primary sort + range key. */
  timestamp: number;
  /** Short title / one-line summary. */
  title: string;
  /** The dream narrative (free text). */
  body: string;
  /** Open tag set (e.g. "flying", "water", "recurring"). */
  tags: string[];
  /** Whether the dream was lucid. */
  lucid?: boolean;
  /** Optional astrological context snapshot at the dream's date. */
  context?: {
    moonPhase?: number; // 0..1
    moonIllumination?: number; // 0..1
    planetaryHourRuler?: string;
    dayRuler?: string;
  };
  /** Audit. */
  createdAt: number;
  updatedAt: number;
}

/** App-wide preferences (single-row store). */
export interface Settings {
  id: 'app';
  /** Manual coordinates when geolocation is denied/unavailable. */
  location?: { lat: number; lon: number; label?: string };
  /** Audio cue + speech + haptics toggles and volumes. */
  cues?: {
    tonesEnabled: boolean;
    tonesVolume: number; // 0..1
    speechEnabled: boolean;
    speechVolume: number; // 0..1
    hapticsEnabled: boolean;
  };
  /** One-time hints the user has dismissed (iOS silent switch, iOS share, …). */
  dismissedHints?: string[];
  /** Breath module preferences. */
  breath?: {
    lastPatternId?: string;
    /** Custom pattern durations (seconds); 0 = phase omitted. */
    custom?: { inhale: number; holdIn: number; exhale: number; holdOut: number };
  };
  /** Monochord (drone) preferences. Typed loosely to keep `db` free of any
   *  dependency on the timing / drone modules (cf. `context.*` above). */
  drone?: {
    tuning?: string; // TuningSystem
    rootPlanet?: string; // Planet
    /** Follow the live planetary-hour ruler instead of the fixed root. */
    attuneToHour?: boolean;
    /** Drive brightness from lunar illumination (new = dark, full = bright). */
    moonBrightness?: boolean;
    volume?: number; // 0..1
    density?: number; // 0..1
    brightness?: number; // 0..1
    motion?: number; // 0..1
  };
  /** Candle (Trāṭaka) module preferences. */
  candle?: {
    lastRitualId?: string;
    /** Custom watch: gaze/rest seconds + round count. */
    custom?: { gazeSec: number; restSec: number; rounds: number };
  };
}

export interface AthanorDB extends DBSchema {
  entries: {
    key: string; // RecordEntry.id
    value: RecordEntry;
    indexes: {
      'by-timestamp': number;
      'by-technique': string;
      // multiEntry index over tags, for fast tag filtering / AI scope picker.
      'by-tag': string;
    };
  };
  dreams: {
    key: string; // DreamEntry.id
    value: DreamEntry;
    indexes: {
      'by-timestamp': number;
      // multiEntry index over tags, for fast tag filtering.
      'by-tag': string;
    };
  };
  settings: {
    key: string; // 'app'
    value: Settings;
  };
}

const DB_NAME = 'athanor';
const DB_VERSION = 2;

let dbp: Promise<IDBPDatabase<AthanorDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<AthanorDB>> {
  if (!dbp) {
    dbp = openDB<AthanorDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const entries = db.createObjectStore('entries', { keyPath: 'id' });
          entries.createIndex('by-timestamp', 'timestamp');
          entries.createIndex('by-technique', 'technique');
          entries.createIndex('by-tag', 'tags', { multiEntry: true });
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          const dreams = db.createObjectStore('dreams', { keyPath: 'id' });
          dreams.createIndex('by-timestamp', 'timestamp');
          dreams.createIndex('by-tag', 'tags', { multiEntry: true });
        }
      },
    });
  }
  return dbp;
}

// --- CRUD surface (signatures only; bodies implemented post-confirmation) ---

export type EntryQuery = {
  from?: number; // epoch ms inclusive
  to?: number; // epoch ms inclusive
  tags?: RecordTag[]; // match any
  technique?: string;
  text?: string; // notes substring (in-memory filter)
  limit?: number;
  order?: 'asc' | 'desc';
};

/** Filter for the Dream Diary. Range from the index; tags/text in memory. */
export type DreamQuery = {
  from?: number; // epoch ms inclusive
  to?: number; // epoch ms inclusive
  tags?: string[]; // match any
  text?: string; // title/body/tag substring (in-memory filter)
  lucid?: boolean; // only lucid dreams when true
  limit?: number;
  order?: 'asc' | 'desc';
};

export interface RecordExport {
  app: 'athanor';
  version: number;
  exportedAt: number;
  entries: RecordEntry[];
  /** Dream Diary entries (added in export v2; optional for backward compat). */
  dreams?: DreamEntry[];
}
