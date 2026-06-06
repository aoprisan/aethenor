import { page, stub } from '../../lib/ui';

// Planetary & lunar timing — STUB. Computed client-side from geolocation
// (manual lat/long fallback) via suncalc: moon phase, current planetary hour,
// day ruler, and the day's full Chaldean-order hour table. Implemented after
// architecture confirmation.
export function renderTiming(root: HTMLElement): void {
  root.append(
    page('Timing', 'Moon phase, planetary hour, and day ruler — computed locally from your sky.'),
  );
  root.append(
    stub(
      'Planned: moon phase + illumination; current planetary hour & day ruler (Chaldean order from local sunrise/sunset); full hour table for the day.',
    ),
  );
}
