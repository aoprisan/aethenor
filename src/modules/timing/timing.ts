import {
  moonInfo,
  planetaryDay,
  currentHour,
  dayRuler,
  type PlanetaryDay,
} from './astro';
import { resolveLocation, setManualLocation, type Coords } from '../../lib/location';
import { el, button, field, card, page, toast } from '../../lib/ui';

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function renderTiming(root: HTMLElement): void {
  root.append(
    page('Timing', 'Moon phase, planetary hour, and day ruler — computed locally from your sky.'),
  );
  const body = el('div', {});
  root.append(body);

  let coords: Coords | null = null;

  void init();

  async function init(): Promise<void> {
    coords = await resolveLocation();
    render();
  }

  function render(): void {
    body.innerHTML = '';
    body.append(locationCard());

    const now = new Date();
    const moon = moonInfo(now);

    // Moon card (works without location).
    body.append(
      card(
        el('h2', {}, 'Moon'),
        el('div', { className: 'now-card' },
          el('div', { className: 'ruler' }, moon.name),
          el('div', { className: 'sub' }, `${Math.round(moon.illumination * 100)}% illuminated`),
        ),
      ),
    );

    if (!coords) {
      body.append(
        card(
          el('p', { className: 'muted' },
            'Set a location to compute planetary hours. Day ruler today: ' + dayRuler(now) + '.'),
        ),
      );
      return;
    }

    const day = planetaryDay(now, coords.lat, coords.lon);
    if (day.degenerate) {
      body.append(
        card(el('p', { className: 'muted' }, 'The sun does not rise or set here today — planetary hours are undefined.')),
      );
      return;
    }
    const hour = currentHour(day, now);

    body.append(
      card(
        el('h2', {}, 'Now'),
        el('div', { className: 'now-card' },
          el('div', { className: 'ruler' }, hour ? hour.ruler : '—'),
          el('div', { className: 'sub' },
            `Planetary hour · day ruled by ${day.dayRuler}` + (hour ? ` · ${hour.period}` : '')),
        ),
      ),
    );

    body.append(hourTable(day, now));
  }

  function hourTable(day: PlanetaryDay, now: Date): HTMLElement {
    const table = el('table', { className: 'hours' });
    const tNow = now.getTime();
    day.hours.forEach((h) => {
      const isNow = tNow >= h.start.getTime() && tNow < h.end.getTime();
      const tr = el('tr', { className: isNow ? 'now' : '' });
      tr.append(
        el('td', {}, String(h.index + 1)),
        el('td', { className: 'period' }, h.period),
        el('td', {}, `${fmtTime(h.start)}–${fmtTime(h.end)}`),
        el('td', {}, h.ruler),
      );
      table.append(tr);
    });
    return card(el('h2', {}, "Today's hours"), table);
  }

  function locationCard(): HTMLElement {
    const lat = el('input', { type: 'number', step: 'any', placeholder: 'lat' });
    const lon = el('input', { type: 'number', step: 'any', placeholder: 'lon' });
    if (coords) {
      lat.value = String(coords.lat.toFixed(4));
      lon.value = String(coords.lon.toFixed(4));
    }

    const useGeo = button('Use my location', async () => {
      const fix = await resolveLocation({ allowPrompt: true });
      if (fix && fix.source === 'geolocation') {
        await setManualLocation(fix.lat, fix.lon, 'Current location');
        coords = fix;
        render();
        toast('Location set.');
      } else {
        toast('Location unavailable — enter coordinates manually.');
      }
    });

    const saveManual = button('Save', async () => {
      const la = Number(lat.value);
      const lo = Number(lon.value);
      if (Number.isNaN(la) || Number.isNaN(lo)) {
        toast('Enter valid coordinates.');
        return;
      }
      await setManualLocation(la, lo);
      coords = { lat: la, lon: lo, source: 'manual' };
      render();
      toast('Location saved.');
    });

    return card(
      el('h2', {}, 'Location'),
      el('p', { className: 'muted tiny' },
        coords
          ? `Using ${coords.source === 'geolocation' ? 'device location' : 'manual coordinates'}: ${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`
          : 'No location set.'),
      el('div', { className: 'row' }, useGeo),
      el('div', { className: 'grid-2' }, field('Latitude', lat), field('Longitude', lon)),
      el('div', { className: 'row row--end' }, saveManual),
    );
  }
}
