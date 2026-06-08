// Repository: all reads/writes for The Magical Record + settings.
// Thin async helpers over the typed idb handle. No UI, no astro logic here.

import { getDB } from './schema';
import type {
  DreamEntry,
  DreamQuery,
  EntryQuery,
  RecordEntry,
  RecordExport,
  Settings,
} from './schema';

const RECORD_VERSION = 2;

// --- Entries -----------------------------------------------------------------

export async function putEntry(entry: RecordEntry): Promise<void> {
  const db = await getDB();
  await db.put('entries', entry);
}

export async function getEntry(id: string): Promise<RecordEntry | undefined> {
  const db = await getDB();
  return db.get('entries', id);
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('entries', id);
}

/** All entries, sorted by timestamp. */
export async function allEntries(order: 'asc' | 'desc' = 'desc'): Promise<RecordEntry[]> {
  const db = await getDB();
  const list = await db.getAllFromIndex('entries', 'by-timestamp');
  return order === 'desc' ? list.reverse() : list;
}

/** Filtered query. Range comes from the index; tags/technique/text filtered
 *  in memory (the dataset is personal-scale, so this stays cheap). */
export async function queryEntries(q: EntryQuery = {}): Promise<RecordEntry[]> {
  const db = await getDB();
  const range =
    q.from != null || q.to != null
      ? IDBKeyRange.bound(q.from ?? -Infinity, q.to ?? Infinity)
      : undefined;
  let list = await db.getAllFromIndex('entries', 'by-timestamp', range);

  if (q.technique) list = list.filter((e) => e.technique === q.technique);
  if (q.tags && q.tags.length) {
    const want = new Set(q.tags);
    list = list.filter((e) => e.tags.some((t) => want.has(t)));
  }
  if (q.text) {
    const needle = q.text.toLowerCase();
    list = list.filter(
      (e) =>
        e.notes.toLowerCase().includes(needle) ||
        e.technique.toLowerCase().includes(needle) ||
        e.tags.some((t) => t.toLowerCase().includes(needle)),
    );
  }

  list = q.order === 'asc' ? list : list.reverse();
  if (q.limit != null) list = list.slice(0, q.limit);
  return list;
}

// --- Dreams ------------------------------------------------------------------

export async function putDream(dream: DreamEntry): Promise<void> {
  const db = await getDB();
  await db.put('dreams', dream);
}

export async function getDream(id: string): Promise<DreamEntry | undefined> {
  const db = await getDB();
  return db.get('dreams', id);
}

export async function deleteDream(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('dreams', id);
}

/** All dreams, sorted by timestamp. */
export async function allDreams(order: 'asc' | 'desc' = 'desc'): Promise<DreamEntry[]> {
  const db = await getDB();
  const list = await db.getAllFromIndex('dreams', 'by-timestamp');
  return order === 'desc' ? list.reverse() : list;
}

/** Filtered query. Range from the index; tags/text/lucid filtered in memory
 *  (the dataset is personal-scale, so this stays cheap). */
export async function queryDreams(q: DreamQuery = {}): Promise<DreamEntry[]> {
  const db = await getDB();
  const range =
    q.from != null || q.to != null
      ? IDBKeyRange.bound(q.from ?? -Infinity, q.to ?? Infinity)
      : undefined;
  let list = await db.getAllFromIndex('dreams', 'by-timestamp', range);

  if (q.lucid) list = list.filter((d) => d.lucid);
  if (q.tags && q.tags.length) {
    const want = new Set(q.tags);
    list = list.filter((d) => d.tags.some((t) => want.has(t)));
  }
  if (q.text) {
    const needle = q.text.toLowerCase();
    list = list.filter(
      (d) =>
        d.title.toLowerCase().includes(needle) ||
        d.body.toLowerCase().includes(needle) ||
        d.tags.some((t) => t.toLowerCase().includes(needle)),
    );
  }

  list = q.order === 'asc' ? list : list.reverse();
  if (q.limit != null) list = list.slice(0, q.limit);
  return list;
}

// --- Settings ----------------------------------------------------------------

const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  cues: {
    tonesEnabled: true,
    tonesVolume: 0.5,
    speechEnabled: false,
    speechVolume: 1,
    hapticsEnabled: true,
  },
  dismissedHints: [],
  drone: {
    tuning: 'just',
    rootPlanet: 'Saturn',
    attuneToHour: false,
    moonBrightness: false,
    volume: 0.45,
    density: 0.5,
    brightness: 0.45,
    motion: 0.4,
  },
};

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const stored = await db.get('settings', 'app');
  return { ...DEFAULT_SETTINGS, ...stored, id: 'app' };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    id: 'app',
    cues: patch.cues ? { ...current.cues!, ...patch.cues } : current.cues,
    breath: patch.breath ? { ...current.breath, ...patch.breath } : current.breath,
    drone: patch.drone ? { ...current.drone, ...patch.drone } : current.drone,
    candle: patch.candle ? { ...current.candle, ...patch.candle } : current.candle,
    memento: patch.memento ? { ...current.memento, ...patch.memento } : current.memento,
  };
  const db = await getDB();
  await db.put('settings', next);
  return next;
}

// --- Export / import ---------------------------------------------------------

export async function exportRecord(): Promise<RecordExport> {
  const entries = await allEntries('asc');
  const dreams = await allDreams('asc');
  return { app: 'athanor', version: RECORD_VERSION, exportedAt: Date.now(), entries, dreams };
}

export type ImportMode = 'merge' | 'replace';

/** Returns the number of entries written. Validates the envelope shape. */
export async function importRecord(data: unknown, mode: ImportMode = 'merge'): Promise<number> {
  if (
    !data ||
    typeof data !== 'object' ||
    (data as RecordExport).app !== 'athanor' ||
    !Array.isArray((data as RecordExport).entries)
  ) {
    throw new Error('Not a valid Athanor export file.');
  }
  const incoming = (data as RecordExport).entries.filter(isEntryLike);
  const incomingDreams = ((data as RecordExport).dreams ?? []).filter(isEntryLike);
  const db = await getDB();
  const tx = db.transaction(['entries', 'dreams'], 'readwrite');
  const entryStore = tx.objectStore('entries');
  const dreamStore = tx.objectStore('dreams');
  if (mode === 'replace') {
    await entryStore.clear();
    await dreamStore.clear();
  }
  for (const e of incoming) await entryStore.put(e);
  for (const d of incomingDreams) await dreamStore.put(d as DreamEntry);
  await tx.done;
  return incoming.length + incomingDreams.length;
}

function isEntryLike<T extends { id: string; timestamp: number }>(e: unknown): e is T {
  return (
    !!e &&
    typeof e === 'object' &&
    typeof (e as T).id === 'string' &&
    typeof (e as T).timestamp === 'number'
  );
}
