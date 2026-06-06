// Dream Diary — a dated, taggable, editable record of dreams, with per-dream
// egress: share via the native sheet, PNG, PDF, or text, plus an "Ask Claude /
// Copy prompt" interpretation hand-off. Mirrors the Record module's shape; data
// lives in its own IndexedDB store (see db/schema.ts).

import { allDreams, deleteDream, exportRecord, importRecord, queryDreams } from '../../db/repo';
import type { DreamEntry } from '../../db/schema';
import { dreamEditor } from './editor';
import { buildDreamPrompt, type DreamIntent } from '../../ai/dreamPrompt';
import type { AstroContext } from '../../ai/prompt';
import { moonInfo } from '../timing/astro';
import {
  dreamFileBase,
  dreamToPdf,
  dreamToPng,
  dreamToText,
  shareOrDownloadFile,
  shareText,
} from '../../lib/share';
import { canShareText } from '../../lib/platform';
import { button, card, el, page, toast } from '../../lib/ui';

const COMMON_TAGS = ['recurring', 'nightmare', 'vivid', 'prophetic', 'symbolic'];

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Build an AstroContext for a dream from its denormalised snapshot (+ a moon
 *  name derived from the date). Used to enrich the interpretation prompt. */
function dreamAstro(d: DreamEntry): AstroContext | undefined {
  if (!d.context) return undefined;
  const m = moonInfo(new Date(d.timestamp));
  return {
    date: d.timestamp,
    moonPhase: d.context.moonPhase ?? m.phase,
    moonIllumination: d.context.moonIllumination ?? m.illumination,
    moonPhaseName: m.name,
    planetaryHourRuler: d.context.planetaryHourRuler ?? 'unknown',
    dayRuler: d.context.dayRuler ?? 'unknown',
  };
}

export function renderDream(root: HTMLElement): void {
  root.append(
    page('Dreams', 'A diary of the night — dated, tagged, and yours to share or interpret.'),
  );

  const editorMount = el('div', {});
  const summary = el('div', {});
  const filters = el('div', {});
  const list = el('div', {});
  root.append(actionsBar(), editorMount, summary, filters, list);

  let search = '';
  let lucidOnly = false;
  const activeTags = new Set<string>();

  void refresh();

  function actionsBar(): HTMLElement {
    const newBtn = button('New dream', () => openEditor(), { primary: true });
    const exportBtn = button('Export', () => void doExport());
    const importInput = el('input', { type: 'file', accept: 'application/json' });
    importInput.style.display = 'none';
    importInput.addEventListener('change', () => void doImport(importInput));
    const importBtn = button('Import', () => importInput.click());
    return el('div', { className: 'row' }, newBtn, exportBtn, importBtn, importInput);
  }

  function openEditor(existing?: DreamEntry): void {
    editorMount.innerHTML = '';
    editorMount.append(
      dreamEditor({
        existing,
        onSaved: () => {
          editorMount.innerHTML = '';
          toast(existing ? 'Dream updated.' : 'Dream saved.');
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
    toast(`Exported ${data.dreams?.length ?? 0} dreams.`);
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
    const all = await allDreams('desc');
    drawSummary(all);
    drawFilters();
    const filtered = await queryDreams({
      text: search || undefined,
      tags: activeTags.size ? [...activeTags] : undefined,
      lucid: lucidOnly || undefined,
      order: 'desc',
    });
    drawList(filtered);
  }

  function drawSummary(all: DreamEntry[]): void {
    summary.innerHTML = '';
    const lucidCount = all.filter((d) => d.lucid).length;
    summary.append(
      card(
        el('div', { className: 'streak' },
          el('div', {},
            el('div', { className: 'streak__n' }, String(all.length)),
            el('div', { className: 'muted tiny' }, 'dreams')),
          el('div', {},
            el('div', { className: 'streak__n' }, String(lucidCount)),
            el('div', { className: 'muted tiny' }, 'lucid')),
        ),
        heatmap(all),
      ),
    );
  }

  function heatmap(all: DreamEntry[]): HTMLElement {
    const counts = new Map<string, number>();
    for (const d of all) counts.set(dayKey(d.timestamp), (counts.get(dayKey(d.timestamp)) ?? 0) + 1);
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
    const searchInput = el('input', { type: 'search', placeholder: 'Search title, dream, tags…' });
    searchInput.value = search;
    searchInput.addEventListener('input', () => {
      search = searchInput.value;
      void refresh();
    });
    const tagRow = el('div', { className: 'row' });
    for (const t of COMMON_TAGS) {
      const chip = el('span', { className: 'chip' + (activeTags.has(t) ? ' chip--on' : '') });
      chip.textContent = t;
      chip.addEventListener('click', () => {
        if (activeTags.has(t)) activeTags.delete(t);
        else activeTags.add(t);
        void refresh();
      });
      tagRow.append(chip);
    }
    const lucidChip = el('span', { className: 'chip' + (lucidOnly ? ' chip--on' : '') });
    lucidChip.textContent = '✦ lucid';
    lucidChip.addEventListener('click', () => {
      lucidOnly = !lucidOnly;
      void refresh();
    });
    tagRow.append(lucidChip);
    filters.append(el('div', { className: 'field' }, searchInput), tagRow);
  }

  function drawList(dreams: DreamEntry[]): void {
    list.innerHTML = '';
    if (dreams.length === 0) {
      list.append(el('p', { className: 'muted' }, 'No dreams yet. On waking, write one down.'));
      return;
    }
    for (const d of dreams) {
      const row = el('div', { className: 'entry' });

      const del = button('Delete', async (ev?: unknown) => {
        (ev as Event | undefined)?.stopPropagation?.();
        await deleteDream(d.id);
        toast('Dream deleted.');
        void refresh();
      });
      del.className = 'tiny';
      const shareBtn = button('Share / Ask', (ev?: unknown) => {
        (ev as Event | undefined)?.stopPropagation?.();
        openSheet(d);
      });
      shareBtn.className = 'tiny';

      row.append(
        el('div', { className: 'entry__head' },
          el('span', { className: 'entry__tech' }, d.title.trim() || 'Untitled dream'),
          el('span', { className: 'entry__date' }, fmtDate(d.timestamp)),
        ),
      );
      if (d.body.trim()) row.append(el('div', { className: 'entry__notes' }, d.body));
      if (d.tags.length || d.lucid) {
        const meta = el('div', { className: 'entry__meta' });
        if (d.lucid) meta.append(el('span', { className: 'chip chip--on' }, '✦ lucid'));
        for (const t of d.tags) meta.append(el('span', { className: 'chip chip--on' }, t));
        row.append(meta);
      }
      row.append(el('div', { className: 'row row--end' }, shareBtn, del));
      row.addEventListener('click', () => openEditor(d));
      list.append(row);
    }
  }

  // --- Share / interpret sheet ------------------------------------------------

  function openSheet(d: DreamEntry): void {
    const title = d.title.trim() || 'Untitled dream';
    const fileBase = dreamFileBase(d);

    const panel = el('div', { className: 'sheet__panel' });
    const backdrop = el('div', { className: 'sheet' }, panel);
    const close = (): void => backdrop.remove();
    backdrop.addEventListener('click', (ev) => {
      if (ev.target === backdrop) close();
    });

    const action = (label: string, fn: () => void | Promise<void>, primary = false): HTMLButtonElement =>
      button(label, () => void Promise.resolve(fn()), { primary, className: 'sheet__btn' });

    const shareSection = el('div', { className: 'sheet__group' },
      el('div', { className: 'muted tiny' }, 'Share this dream'),
    );
    if (canShareText()) {
      shareSection.append(
        action('Share…', async () => {
          await shareText(title, dreamToText(d));
          close();
        }, true),
      );
    }
    shareSection.append(
      action('PNG image', async () => {
        const r = await shareOrDownloadFile(await dreamToPng(d), `${fileBase}.png`, { title });
        if (r === 'downloaded') toast('PNG saved.');
        close();
      }),
      action('PDF', async () => {
        const r = await shareOrDownloadFile(await dreamToPdf(d), `${fileBase}.pdf`, { title });
        if (r === 'downloaded') toast('PDF saved.');
        close();
      }),
      action('Copy text', async () => {
        try {
          await navigator.clipboard.writeText(dreamToText(d));
          toast('Dream copied.');
        } catch {
          toast('Copy failed.');
        }
        close();
      }),
    );

    const askSection = el('div', { className: 'sheet__group' },
      el('div', { className: 'muted tiny' }, 'Interpret with an AI agent'),
    );
    const intentSel = el('select', { className: 'sheet__select' });
    for (const [val, label] of [
      ['interpret-dream', 'Interpret this dream'],
      ['find-patterns-in-dreams', 'Find patterns (all dreams)'],
      ['continue-the-dream', 'Continue the dream'],
    ] as const) {
      const o = el('option', { value: val });
      o.textContent = label;
      intentSel.append(o);
    }

    async function dreamsForIntent(intent: DreamIntent): Promise<DreamEntry[]> {
      return intent === 'find-patterns-in-dreams' ? allDreams('desc') : [d];
    }
    async function buildText(): Promise<string> {
      const intent = intentSel.value as DreamIntent;
      const dreams = await dreamsForIntent(intent);
      const ctx = intent === 'find-patterns-in-dreams' ? undefined : dreamAstro(d);
      return buildDreamPrompt({ intent, dreams, context: ctx }).text;
    }

    askSection.append(
      intentSel,
      action('Ask Claude', async () => {
        const text = await buildText();
        const shared = await shareText('Athanor — dream', text);
        if (!shared) {
          try {
            await navigator.clipboard.writeText(text);
            toast('Prompt copied — paste it to Claude.');
          } catch {
            toast('Copy failed.');
          }
        }
        close();
      }, true),
      action('Copy prompt', async () => {
        try {
          await navigator.clipboard.writeText(await buildText());
          toast('Prompt copied.');
        } catch {
          toast('Copy failed.');
        }
        close();
      }),
    );

    panel.append(
      el('div', { className: 'sheet__title' }, title),
      shareSection,
      askSection,
      action('Cancel', close),
    );
    document.body.append(backdrop);
  }
}
