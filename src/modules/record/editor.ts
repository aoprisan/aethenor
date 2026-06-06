// Entry editor — shared by the Record list (new/edit) and the post-session
// "log this session" flow in Breath. Renders a form element; on save it writes
// to IndexedDB, auto-snapshotting the astrological context onto the entry.

import { putEntry } from '../../db/repo';
import type { RecordEntry, RetentionCount } from '../../db/schema';
import { snapshot } from '../timing/astro';
import { resolveLocation } from '../../lib/location';
import { PATTERNS } from '../breath/patterns';
import { CANDLE_RITUALS } from '../candle/rituals';
import { button, card, el, field } from '../../lib/ui';

export interface EntryPrefill {
  technique?: string;
  durationSec?: number;
  retentions?: RetentionCount[];
  notes?: string;
  tags?: string[];
}

const FIRST_CLASS_TAGS = ['dream', 'omen', 'divination'];

function localDatetimeValue(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function entryEditor(opts: {
  existing?: RecordEntry;
  prefill?: EntryPrefill;
  onSaved: (entry: RecordEntry) => void;
  onCancel?: () => void;
}): HTMLElement {
  const e = opts.existing;
  const seed = opts.prefill ?? {};

  // --- controls ---
  const when = el('input', { type: 'datetime-local' });
  when.value = localDatetimeValue(e?.timestamp ?? Date.now());

  const techList = el('datalist', { id: 'tech-list' });
  for (const p of PATTERNS) techList.append(el('option', { value: p.name }));
  for (const r of CANDLE_RITUALS) techList.append(el('option', { value: r.name }));
  techList.append(el('option', { value: 'Free practice' }));
  const technique = el('input', { type: 'text', placeholder: 'Technique' });
  technique.setAttribute('list', 'tech-list');
  technique.value = e?.technique ?? seed.technique ?? '';

  const duration = el('input', { type: 'number', min: '0', step: '1' });
  duration.value = String(e?.durationSec ?? seed.durationSec ?? 0);

  // retentions
  const retWrap = el('div', {});
  const retentions: RetentionCount[] = (e?.retentions ?? seed.retentions ?? []).map((r) => ({ ...r }));
  function drawRetentions(): void {
    retWrap.innerHTML = '';
    retentions.forEach((r, i) => {
      const phase = el('select', {});
      for (const opt of ['antara', 'bahya'] as const) {
        const o = el('option', { value: opt });
        o.textContent = opt === 'antara' ? 'after inhale' : 'after exhale';
        if (r.phase === opt) o.selected = true;
        phase.append(o);
      }
      phase.addEventListener('change', () => (r.phase = phase.value as RetentionCount['phase']));
      const secs = el('input', { type: 'number', min: '0', step: '1' });
      secs.value = String(r.seconds);
      secs.addEventListener('input', () => (r.seconds = Number(secs.value) || 0));
      const rm = button('×', () => {
        retentions.splice(i, 1);
        drawRetentions();
      });
      retWrap.append(el('div', { className: 'row' }, phase, secs, el('span', { className: 'muted tiny' }, 'sec'), rm));
    });
  }
  drawRetentions();
  const addRet = button('+ retention', () => {
    retentions.push({ phase: 'antara', seconds: 0 });
    drawRetentions();
  });

  const notes = el('textarea', { placeholder: 'What happened. Images, sensations, omens…' });
  notes.value = e?.notes ?? seed.notes ?? '';

  const depth = el('input', { type: 'range', min: '1', max: '5', step: '1' });
  depth.value = String(e?.state.depth ?? 3);
  const arousal = el('input', { type: 'range', min: '1', max: '5', step: '1' });
  arousal.value = String(e?.state.arousal ?? 3);
  const qualities = el('input', { type: 'text', placeholder: 'lucid, heavy, clear…' });
  qualities.value = (e?.state.qualities ?? []).join(', ');

  // tags
  const otherTags = el('input', { type: 'text', placeholder: 'other tags, comma-separated' });
  const seededTags = new Set(e?.tags ?? seed.tags ?? []);
  otherTags.value = [...seededTags].filter((t) => !FIRST_CLASS_TAGS.includes(t)).join(', ');
  const tagChips = FIRST_CLASS_TAGS.map((t) => {
    const chip = el('span', { className: 'chip' + (seededTags.has(t) ? ' chip--on' : '') });
    chip.textContent = t;
    chip.addEventListener('click', () => chip.classList.toggle('chip--on'));
    chip.dataset.tag = t;
    return chip;
  });

  const status = el('p', { className: 'muted tiny' });

  const save = button(
    'Save entry',
    () => {
      void doSave();
    },
    { primary: true },
  );

  async function doSave(): Promise<void> {
    save.disabled = true;
    status.textContent = 'Saving…';
    const ts = when.value ? new Date(when.value).getTime() : Date.now();
    const tags = [
      ...tagChips.filter((c) => c.classList.contains('chip--on')).map((c) => c.dataset.tag!),
      ...otherTags.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ];
    const now = Date.now();

    // Auto-snapshot astrological context (no geolocation prompt here; uses a
    // live fix only if already granted, else stored manual coords).
    const loc = await resolveLocation();
    const snap = snapshot(new Date(ts), loc?.lat, loc?.lon);

    const entry: RecordEntry = {
      id: e?.id ?? crypto.randomUUID(),
      timestamp: ts,
      technique: technique.value.trim() || 'Free practice',
      durationSec: Number(duration.value) || 0,
      retentions,
      notes: notes.value,
      state: {
        depth: Number(depth.value),
        arousal: Number(arousal.value),
        qualities: qualities.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      tags,
      context: {
        moonPhase: snap.moonPhase,
        moonIllumination: snap.moonIllumination,
        planetaryHourRuler: snap.planetaryHourRuler,
        dayRuler: snap.dayRuler,
      },
      createdAt: e?.createdAt ?? now,
      updatedAt: now,
    };
    await putEntry(entry);
    opts.onSaved(entry);
  }

  const actions = el('div', { className: 'row row--end' });
  if (opts.onCancel) actions.append(button('Cancel', opts.onCancel));
  actions.append(save);

  return card(
    field('When', when),
    field('Technique', technique),
    field('Duration (seconds)', duration),
    field('Retentions', el('div', {}, retWrap, el('div', { className: 'row' }, addRet))),
    field('Notes', notes),
    el('div', { className: 'grid-2' }, field('Depth (1–5)', depth), field('Arousal (1–5)', arousal)),
    field('Qualities', qualities),
    field('Tags', el('div', {}, el('div', { className: 'row' }, ...tagChips), el('div', { className: 'row' }, otherTags))),
    status,
    actions,
  );
}
