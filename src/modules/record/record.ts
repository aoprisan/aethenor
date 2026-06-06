import { page, stub } from '../../lib/ui';

// The Magical Record — STUB. Structured diary over IndexedDB: create/edit
// entries, searchable/filterable list, calendar/streak view, JSON
// export/import. Implemented after schema confirmation.
export function renderRecord(root: HTMLElement): void {
  root.append(
    page('Record', 'The magical diary — every working logged, searchable, and yours to export.'),
  );
  root.append(
    stub(
      'Planned: entry capture (technique, duration, retentions, notes, state, tags); searchable/filterable list; calendar + streak view; JSON export/import.',
    ),
  );
}
