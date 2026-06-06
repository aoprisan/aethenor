import { allEntries, deleteEntry, exportRecord, importRecord, queryEntries } from '../../db/repo';
import type { RecordEntry } from '../../db/schema';
import { entryEditor } from './editor';
import { el, button, card, page, toast } from '../../lib/ui';

const FIRST_CLASS_TAGS = ['dream', 'omen', 'divination'];

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function fmtWhen(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m${s ? ` ${s}s` : ''}` : `${s}s`;
}

export function renderRecord(root: HTMLElement): void {
  root.append(
    page('Record', 'The magical diary — every working logged, searchable, and yours to export.'),
  );

  const editorMount = el('div', {});
  const summary = el('div', {});
  const filters = el('div', {});
  const list = el('div', {});
  root.append(actionsBar(), editorMount, summary, filters, list);

  let search = '';
  const activeTags = new Set<string>();

  void refresh();

  function actionsBar(): HTMLElement {
    const newBtn = button('New entry', () => openEditor(), { primary: true });
    const exportBtn = button('Export', () => void doExport());
    const importInput = el('input', { type: 'file', accept: 'application/json' });
    importInput.style.display = 'none';
    importInput.addEventListener('change', () => void doImport(importInput));
    const importBtn = button('Import', () => importInput.click());
    return el('div', { className: 'row' }, newBtn, exportBtn, importBtn, importInput);
  }

  function openEditor(existing?: RecordEntry): void {
    editorMount.innerHTML = '';
    editorMount.append(
      entryEditor({
        existing,
        onSaved: () => {
          editorMount.innerHTML = '';
          toast(existing ? 'Entry updated.' : 'Entry saved.');
          void refresh();
        },
        onCancel: () => (editorMount.innerHTML = ''),
      }),
    );
    editorMount.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function doExport(): Promise<void> {
    const data = await exportRecord();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `athanor-record-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${data.entries.length} entries.`);
  }

  async function doImport(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const n = await importRecord(data, 'merge');
      toast(`Imported ${n} entries.`);
      void refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed.');
    }
  }

  async function refresh(): Promise<void> {
    const all = await allEntries('desc');
    drawSummary(all);
    drawFilters();
    const filtered = await queryEntries({
      text: search || undefined,
      tags: activeTags.size ? [...activeTags] : undefined,
      order: 'desc',
    });
    drawList(filtered);
  }

  function drawSummary(all: RecordEntry[]): void {
    summary.innerHTML = '';
    const days = new Set(all.map((e) => dayKey(e.timestamp)));
    // current streak: consecutive days ending today or yesterday
    let streak = 0;
    const cursor = new Date();
    if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
    while (days.has(dayKey(cursor.getTime()))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    summary.append(
      card(
        el('div', { className: 'streak' },
          el('div', {},
            el('div', { className: 'streak__n' }, String(streak)),
            el('div', { className: 'muted tiny' }, 'day streak')),
          el('div', {},
            el('div', { className: 'streak__n' }, String(all.length)),
            el('div', { className: 'muted tiny' }, 'entries')),
        ),
        heatmap(all),
      ),
    );
  }

  function heatmap(all: RecordEntry[]): HTMLElement {
    const counts = new Map<string, number>();
    for (const e of all) counts.set(dayKey(e.timestamp), (counts.get(dayKey(e.timestamp)) ?? 0) + 1);
    const grid = el('div', { className: 'heat' });
    const WEEKS = 17;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const n = counts.get(dayKey(d.getTime())) ?? 0;
      const level = n === 0 ? '' : n === 1 ? ' heat__cell--1' : ' heat__cell--2';
      const cell = el('div', { className: 'heat__cell' + level, title: `${d.toLocaleDateString()} · ${n}` });
      grid.append(cell);
    }
    return grid;
  }

  function drawFilters(): void {
    filters.innerHTML = '';
    const searchInput = el('input', { type: 'search', placeholder: 'Search notes, technique, tags…' });
    searchInput.value = search;
    searchInput.addEventListener('input', () => {
      search = searchInput.value;
      void refresh();
    });
    const tagRow = el('div', { className: 'row' });
    for (const t of FIRST_CLASS_TAGS) {
      const chip = el('span', { className: 'chip' + (activeTags.has(t) ? ' chip--on' : '') });
      chip.textContent = t;
      chip.addEventListener('click', () => {
        if (activeTags.has(t)) activeTags.delete(t);
        else activeTags.add(t);
        void refresh();
      });
      tagRow.append(chip);
    }
    filters.append(el('div', { className: 'field' }, searchInput), tagRow);
  }

  function drawList(entries: RecordEntry[]): void {
    list.innerHTML = '';
    if (entries.length === 0) {
      list.append(el('p', { className: 'muted' }, 'No entries yet. Practice, then log it.'));
      return;
    }
    for (const e of entries) {
      const row = el('div', { className: 'entry' });
      const tags = el('div', { className: 'entry__meta' });
      for (const t of e.tags) {
        const c = el('span', { className: 'chip chip--on' });
        c.textContent = t;
        tags.append(c);
      }
      const del = button('Delete', async (ev?: unknown) => {
        (ev as Event | undefined)?.stopPropagation?.();
        await deleteEntry(e.id);
        toast('Entry deleted.');
        void refresh();
      });
      del.className = 'tiny';
      row.append(
        el('div', { className: 'entry__head' },
          el('span', { className: 'entry__tech' }, `${e.technique} · ${fmtDuration(e.durationSec)}`),
          el('span', { className: 'entry__date' }, fmtWhen(e.timestamp)),
        ),
      );
      if (e.notes.trim()) row.append(el('div', { className: 'entry__notes' }, e.notes));
      if (e.tags.length) row.append(tags);
      row.append(el('div', { className: 'row row--end' }, del));
      row.addEventListener('click', () => openEditor(e));
      list.append(row);
    }
  }
}
