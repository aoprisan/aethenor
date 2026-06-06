// Dream editor — new/edit a single dream. Renders a form; on save it writes to
// IndexedDB and auto-snapshots the astrological context for the dream's date
// (denormalised onto the entry, like the Record editor does).

import { putDream } from '../../db/repo';
import type { DreamEntry } from '../../db/schema';
import { snapshot } from '../timing/astro';
import { resolveLocation } from '../../lib/location';
import { button, card, el, field } from '../../lib/ui';

const COMMON_TAGS = ['recurring', 'nightmare', 'vivid', 'prophetic', 'symbolic'];

/** A dream is anchored to a date; we store it at 9am local (a recall time). */
function dateInputValue(ms: number): string {
  const d = new Date(ms);
  return new Date(ms - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function fromDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  if (!y) return Date.now();
  return new Date(y, (m || 1) - 1, d || 1, 9, 0).getTime();
}

export function dreamEditor(opts: {
  existing?: DreamEntry;
  onSaved: (dream: DreamEntry) => void;
  onCancel?: () => void;
}): HTMLElement {
  const e = opts.existing;

  const when = el('input', { type: 'date' });
  when.value = dateInputValue(e?.timestamp ?? Date.now());

  const title = el('input', { type: 'text', placeholder: 'A title for the dream' });
  title.value = e?.title ?? '';

  const body = el('textarea', {
    placeholder: 'What happened. Images, people, places, feelings…',
  });
  body.value = e?.body ?? '';
  body.rows = 8;

  const lucid = el('input', { type: 'checkbox' });
  lucid.checked = !!e?.lucid;

  // Tags: common chips + free-text for the rest.
  const seeded = new Set(e?.tags ?? []);
  const tagChips = COMMON_TAGS.map((t) => {
    const chip = el('span', { className: 'chip' + (seeded.has(t) ? ' chip--on' : '') });
    chip.textContent = t;
    chip.dataset.tag = t;
    chip.addEventListener('click', () => chip.classList.toggle('chip--on'));
    return chip;
  });
  const otherTags = el('input', { type: 'text', placeholder: 'other tags, comma-separated' });
  otherTags.value = [...seeded].filter((t) => !COMMON_TAGS.includes(t)).join(', ');

  const status = el('p', { className: 'muted tiny' });

  const save = button('Save dream', () => void doSave(), { primary: true });

  async function doSave(): Promise<void> {
    save.disabled = true;
    status.textContent = 'Saving…';
    const ts = fromDateInput(when.value);
    const tags = [
      ...tagChips.filter((c) => c.classList.contains('chip--on')).map((c) => c.dataset.tag!),
      ...otherTags.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ];
    const now = Date.now();

    // Snapshot the sky for the dream's date (no geolocation prompt: uses a live
    // fix only if already granted, else stored manual coords).
    const loc = await resolveLocation();
    const snap = snapshot(new Date(ts), loc?.lat, loc?.lon);

    const dream: DreamEntry = {
      id: e?.id ?? crypto.randomUUID(),
      timestamp: ts,
      title: title.value.trim(),
      body: body.value,
      tags,
      lucid: lucid.checked,
      context: {
        moonPhase: snap.moonPhase,
        moonIllumination: snap.moonIllumination,
        planetaryHourRuler: snap.planetaryHourRuler,
        dayRuler: snap.dayRuler,
      },
      createdAt: e?.createdAt ?? now,
      updatedAt: now,
    };
    await putDream(dream);
    opts.onSaved(dream);
  }

  const actions = el('div', { className: 'row row--end' });
  if (opts.onCancel) actions.append(button('Cancel', opts.onCancel));
  actions.append(save);

  return card(
    field('Date', when),
    field('Title', title),
    field('Dream', body),
    field('Lucid', el('div', { className: 'row' }, lucid)),
    field('Tags', el('div', {}, el('div', { className: 'row' }, ...tagChips), el('div', { className: 'row' }, otherTags))),
    status,
    actions,
  );
}
