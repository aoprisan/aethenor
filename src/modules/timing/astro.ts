// Planetary & lunar computations. Pure functions over a date + coordinates,
// built on suncalc. No DOM, no storage — so it can be reused by the timing UI,
// the Record context snapshot, and the Hierophant prompt.

import SunCalc from 'suncalc';

export const PLANETS = [
  'Saturn',
  'Jupiter',
  'Mars',
  'Sun',
  'Venus',
  'Mercury',
  'Moon',
] as const;
export type Planet = (typeof PLANETS)[number];

/** Chaldean (slowest→fastest) order used to sequence planetary hours. */
const CHALDEAN: Planet[] = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];

/** Day rulers, indexed by JS getDay() (0 = Sunday). */
const DAY_RULERS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

const MOON_PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
] as const;

export interface MoonInfo {
  phase: number; // 0..1 (0/1 new, 0.5 full)
  illumination: number; // 0..1
  name: string;
}

export function moonInfo(date: Date): MoonInfo {
  const { phase, fraction } = SunCalc.getMoonIllumination(date);
  // Map continuous phase to one of 8 names; quarters/syzygies get a narrow band.
  const idx = Math.round(phase * 8) % 8;
  return { phase, illumination: fraction, name: MOON_PHASE_NAMES[idx] };
}

export function dayRuler(date: Date): Planet {
  return DAY_RULERS[date.getDay()];
}

export interface PlanetaryHour {
  index: number; // 0..23
  ruler: Planet;
  start: Date;
  end: Date;
  period: 'day' | 'night';
}

export interface PlanetaryDay {
  hours: PlanetaryHour[];
  dayRuler: Planet;
  /** True when the sun does not rise/set (polar) and hours are undefined. */
  degenerate: boolean;
}

function startOfLocalDay(d: Date, offsetDays = 0): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0); // noon avoids DST edge cases for getTimes
  x.setDate(x.getDate() + offsetDays);
  return x;
}

/** Build the 24 unequal planetary hours covering the planetary day that
 *  contains `now`. A planetary day runs sunrise → next sunrise. */
export function planetaryDay(now: Date, lat: number, lon: number): PlanetaryDay {
  const today = SunCalc.getTimes(startOfLocalDay(now), lat, lon);
  const valid = (d: Date) => d instanceof Date && !Number.isNaN(d.getTime());

  if (!valid(today.sunrise) || !valid(today.sunset)) {
    return { hours: [], dayRuler: dayRuler(now), degenerate: true };
  }

  let anchor: Date; // the date whose sunrise begins this planetary day
  let sunrise: Date;
  let sunset: Date;
  let nextSunrise: Date;

  if (now.getTime() >= today.sunrise.getTime()) {
    anchor = startOfLocalDay(now);
    sunrise = today.sunrise;
    sunset = today.sunset;
    nextSunrise = SunCalc.getTimes(startOfLocalDay(now, 1), lat, lon).sunrise;
  } else {
    anchor = startOfLocalDay(now, -1);
    const yest = SunCalc.getTimes(anchor, lat, lon);
    sunrise = yest.sunrise;
    sunset = yest.sunset;
    nextSunrise = today.sunrise;
  }

  if (!valid(nextSunrise)) {
    return { hours: [], dayRuler: dayRuler(anchor), degenerate: true };
  }

  const ruler = dayRuler(anchor);
  const startIdx = CHALDEAN.indexOf(ruler);
  const dayLen = (sunset.getTime() - sunrise.getTime()) / 12;
  const nightLen = (nextSunrise.getTime() - sunset.getTime()) / 12;

  const hours: PlanetaryHour[] = [];
  for (let i = 0; i < 24; i++) {
    const isDay = i < 12;
    const base = isDay ? sunrise.getTime() : sunset.getTime();
    const len = isDay ? dayLen : nightLen;
    const j = isDay ? i : i - 12;
    const start = new Date(base + j * len);
    const end = new Date(base + (j + 1) * len);
    hours.push({
      index: i,
      ruler: CHALDEAN[(startIdx + i) % 7],
      start,
      end,
      period: isDay ? 'day' : 'night',
    });
  }
  return { hours, dayRuler: ruler, degenerate: false };
}

export function currentHour(day: PlanetaryDay, now: Date): PlanetaryHour | null {
  const t = now.getTime();
  return day.hours.find((h) => t >= h.start.getTime() && t < h.end.getTime()) ?? null;
}

/** Compact astro snapshot for denormalising onto a Record entry. */
export interface AstroSnapshot {
  moonPhase: number;
  moonIllumination: number;
  planetaryHourRuler?: string;
  dayRuler: string;
}

export function snapshot(now: Date, lat?: number, lon?: number): AstroSnapshot {
  const moon = moonInfo(now);
  const base: AstroSnapshot = {
    moonPhase: moon.phase,
    moonIllumination: moon.illumination,
    dayRuler: dayRuler(now),
  };
  if (lat == null || lon == null) return base;
  const day = planetaryDay(now, lat, lon);
  const hour = currentHour(day, now);
  return { ...base, dayRuler: day.dayRuler, planetaryHourRuler: hour?.ruler };
}
