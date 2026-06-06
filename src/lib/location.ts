// Location resolution for timing. Tries the Geolocation API; falls back to the
// manual coordinates stored in settings. Pure data in/out — no UI.

import { getSettings, saveSettings } from '../db/repo';

export interface Coords {
  lat: number;
  lon: number;
  label?: string;
  source: 'geolocation' | 'manual';
}

export async function getManualLocation(): Promise<Coords | null> {
  const s = await getSettings();
  if (s.location) return { ...s.location, source: 'manual' };
  return null;
}

export async function setManualLocation(lat: number, lon: number, label?: string): Promise<void> {
  await saveSettings({ location: { lat, lon, label } });
}

/** Resolve coordinates: prefer a live fix, fall back to stored manual coords.
 *  Never rejects — returns null when nothing is available. */
export async function resolveLocation(opts: { allowPrompt?: boolean } = {}): Promise<Coords | null> {
  if (opts.allowPrompt && 'geolocation' in navigator) {
    const fix = await new Promise<Coords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, source: 'geolocation' }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60 * 60 * 1000 },
      );
    });
    if (fix) return fix;
  }
  return getManualLocation();
}
