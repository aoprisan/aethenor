// The Monochord — an astro-tuned ambient drone.
//
// Robert Fludd's monochordum mundi tuned a single string to the heavens; this
// module does the same with oscillators. The root is a planetary tone (chosen,
// or following the ruler of the current planetary hour), the overtones stack
// according to the chosen tuning, and the timbre can be opened or closed by the
// moon. It sits *beside* the functional breath cues — a sustained bed, not a
// replacement for them.

import { getSettings, saveSettings } from '../../db/repo';
import type { Settings } from '../../db/schema';
import { resolveLocation, type Coords } from '../../lib/location';
import {
  PLANETS,
  planetaryDay,
  currentHour,
  moonInfo,
  type Planet,
  type MoonInfo,
} from '../timing/astro';
import {
  TUNINGS,
  planetaryRootHz,
  buildVoices,
  type TuningSystem,
  type DroneParams,
} from './tuning';
import { DroneEngine, type DroneConfig } from './engine';
import { entryEditor } from '../record/editor';
import { el, button, field, card, page, toast } from '../../lib/ui';
import { isIOS, hasWakeLock } from '../../lib/platform';

interface Astro {
  ruler: Planet | null; // current planetary-hour ruler (needs location)
  moon: MoonInfo;
}

export function renderMonochord(root: HTMLElement): (() => void) | void {
  root.append(
    page('Monochord', 'A single string tuned to the hour — an astro-tuned drone bed beneath the practice.'),
  );
  const mount = el('div', {});
  root.append(mount);

  let settings: Settings;
  let coords: Coords | null = null;
  let astro: Astro = { ruler: null, moon: moonInfo(new Date()) };
  let engine: DroneEngine | null = null;
  let retuneTimer: number | null = null;
  let started = 0; // performance.now() at Start, for the log offer

  void init();

  async function init(): Promise<void> {
    settings = await getSettings();
    coords = await resolveLocation(); // no prompt — uses a granted fix or manual coords
    astro = computeAstro();
    engine = new DroneEngine(config());
    build();
  }

  // --- derived state ---------------------------------------------------------

  function d() {
    return settings.drone ?? {};
  }

  function computeAstro(): Astro {
    const now = new Date();
    const moon = moonInfo(now);
    if (!coords) return { ruler: null, moon };
    const day = planetaryDay(now, coords.lat, coords.lon);
    const hour = day.degenerate ? null : currentHour(day, now);
    return { ruler: hour?.ruler ?? null, moon };
  }

  /** The planet whose tone sets the root: the live ruler when attuning, else
   *  the chosen root. Falls back to the chosen root if no location is known. */
  function effectivePlanet(): Planet {
    if (d().attuneToHour && astro.ruler) return astro.ruler;
    return (d().rootPlanet as Planet) ?? 'Saturn';
  }

  /** Brightness, optionally driven by lunar illumination. */
  function effectiveBrightness(): number {
    if (d().moonBrightness) return 0.15 + 0.85 * astro.moon.illumination;
    return d().brightness ?? 0.45;
  }

  function droneParams(): DroneParams {
    return {
      tuning: (d().tuning as TuningSystem) ?? 'just',
      rootHz: planetaryRootHz(effectivePlanet()),
      density: d().density ?? 0.5,
      brightness: effectiveBrightness(),
    };
  }

  function config(): DroneConfig {
    return {
      masterVolume: d().volume ?? 0.45,
      brightness: effectiveBrightness(),
      motion: d().motion ?? 0.4,
    };
  }

  function save(patch: NonNullable<Settings['drone']>): void {
    settings = { ...settings, drone: { ...d(), ...patch } };
    void saveSettings({ drone: { ...d(), ...patch } }).then((s) => (settings = s));
  }

  // --- view ------------------------------------------------------------------

  function build(): void {
    mount.innerHTML = '';

    // iOS silent-switch hint (shares the dismiss key with the breath cues).
    if (isIOS() && !settings.dismissedHints?.includes('ios-silent')) {
      const hint = el('div', { className: 'hint' });
      const close = button('Dismiss', () => {
        void saveSettings({
          dismissedHints: [...(settings.dismissedHints ?? []), 'ios-silent'],
        }).then((s) => (settings = s));
        hint.remove();
      });
      close.className = 'hint__close';
      hint.append(
        close,
        document.createTextNode(
          'On iPhone, Web Audio routes through the hardware mute switch — turn off silent mode to hear the drone.',
        ),
      );
      mount.append(hint);
    }

    // --- stage ---
    const sigil = el('div', { className: 'drone-orb' }, el('div', { className: 'drone-orb__ring' }));
    const rootLabel = el('div', { className: 'drone-root' }, '');
    const sub = el('div', { className: 'muted tiny' }, '');
    const stage = el('div', { className: 'drone-stage' }, sigil, rootLabel, sub);

    function reflectRoot(): void {
      const planet = effectivePlanet();
      const hz = planetaryRootHz(planet).toFixed(2);
      rootLabel.textContent = `${planet} · ${hz} Hz`;
      const tuningName = TUNINGS.find((t) => t.id === (d().tuning as TuningSystem))?.name ?? '';
      const bits = [tuningName];
      if (d().attuneToHour) bits.push(astro.ruler ? 'attuned to the hour' : 'no location — using chosen root');
      if (d().moonBrightness) bits.push(`${astro.moon.name.toLowerCase()}`);
      sub.textContent = bits.filter(Boolean).join(' · ');
    }

    // --- tuning chips ---
    const tuningRow = el('div', { className: 'row' });
    for (const t of TUNINGS) {
      const chip = el('span', { className: 'chip', title: t.description });
      chip.textContent = t.name;
      chip.dataset.id = t.id;
      chip.addEventListener('click', () => {
        save({ tuning: t.id });
        markChips(tuningRow, t.id);
        reflectRoot();
        engine?.setVoices(buildVoices(droneParams()));
      });
      tuningRow.append(chip);
    }
    markChips(tuningRow, (d().tuning as string) ?? 'just');

    // --- root planet chips ---
    const planetRow = el('div', { className: 'row' });
    for (const p of PLANETS) {
      const chip = el('span', { className: 'chip', dataset: { id: p } });
      chip.textContent = p;
      chip.addEventListener('click', () => {
        save({ rootPlanet: p, attuneToHour: false });
        attune.checked = false;
        markChips(planetRow, p);
        reflectRoot();
        engine?.setVoices(buildVoices(droneParams()));
      });
      planetRow.append(chip);
    }
    markChips(planetRow, effectivePlanet());

    // --- couplings ---
    const attune = checkbox(!!d().attuneToHour, (v) => {
      save({ attuneToHour: v });
      if (v && !coords) toast('Set a location in Timing to follow the planetary hour.');
      markChips(planetRow, effectivePlanet());
      reflectRoot();
      engine?.setVoices(buildVoices(droneParams()));
    });

    const moonBright = checkbox(!!d().moonBrightness, (v) => {
      save({ moonBrightness: v });
      brightnessSlider.disabled = v;
      reflectRoot();
      engine?.update(config());
    });

    // --- sliders ---
    const volume = range(d().volume ?? 0.45, (v) => {
      save({ volume: v });
      engine?.update(config());
    });
    const density = range(d().density ?? 0.5, (v) => {
      save({ density: v });
      engine?.setVoices(buildVoices(droneParams()));
    });
    const brightnessSlider = range(d().brightness ?? 0.45, (v) => {
      save({ brightness: v });
      engine?.update(config());
    });
    brightnessSlider.disabled = !!d().moonBrightness;
    const motion = range(d().motion ?? 0.4, (v) => {
      save({ motion: v });
      engine?.update(config());
    });

    // --- transport ---
    const postMount = el('div', {});
    const startBtn = button('Sound', () => void onStart(), { primary: true });
    const stopBtn = button('Silence', () => void onStop());
    stopBtn.style.display = 'none';

    async function onStart(): Promise<void> {
      postMount.innerHTML = '';
      if (isIOS()) toast('Silent mode off to hear the drone');
      astro = computeAstro();
      reflectRoot();
      engine!.update(config());
      await engine!.start(buildVoices(droneParams()));
      started = performance.now();
      sigil.classList.add('drone-orb--on');
      startBtn.style.display = 'none';
      stopBtn.style.display = '';
    }

    async function onStop(): Promise<void> {
      const elapsed = Math.round((performance.now() - started) / 1000);
      await engine!.stop();
      sigil.classList.remove('drone-orb--on');
      startBtn.style.display = '';
      stopBtn.style.display = 'none';
      if (elapsed >= 30) offerLog(elapsed);
    }

    function offerLog(elapsedSec: number): void {
      const tuningName = TUNINGS.find((t) => t.id === (d().tuning as TuningSystem))?.name ?? '';
      const technique = `Monochord — ${tuningName} · ${effectivePlanet()}`;
      const head = el(
        'p',
        { className: 'muted' },
        `Drone ended — ${Math.round(elapsedSec / 60)} min ${elapsedSec % 60}s. Log it to the Record?`,
      );
      const logBtn = button(
        'Log to Record',
        () => {
          postMount.innerHTML = '';
          postMount.append(
            entryEditor({
              prefill: { technique, durationSec: elapsedSec },
              onSaved: () => {
                postMount.innerHTML = '';
                toast('Logged to the Record.');
              },
              onCancel: () => (postMount.innerHTML = ''),
            }),
          );
        },
        { primary: true },
      );
      const dismiss = button('Dismiss', () => (postMount.innerHTML = ''));
      postMount.append(card(head, el('div', { className: 'row' }, logBtn, dismiss)));
    }

    const notes: string[] = [];
    if (!hasWakeLock()) notes.push('Wake Lock unsupported — keep the screen awake to avoid the audio suspending.');
    const noteEl = notes.length ? el('p', { className: 'muted tiny' }, notes.join(' ')) : null;

    reflectRoot();
    mount.append(
      stage,
      el('div', { className: 'row' }, startBtn, stopBtn),
      postMount,
      card(
        el('h2', {}, 'Tuning'),
        field('System', tuningRow),
        field('Root planet', planetRow),
        field('Follow the planetary hour', wrap(attune)),
        field('Let the moon set brightness', wrap(moonBright)),
      ),
      card(
        el('h2', {}, 'Voice'),
        field('Volume', volume),
        field('Density', density),
        field('Brightness', brightnessSlider),
        field('Motion', motion),
        noteEl,
      ),
    );

    // Planetary hours turn over roughly hourly and the moon drifts; while
    // sounding, keep an attuned drone in step without a click (pitch glide).
    retuneTimer = window.setInterval(() => {
      astro = computeAstro();
      reflectRoot();
      markChips(planetRow, effectivePlanet());
      if (!engine?.isPlaying) return;
      if (d().attuneToHour) engine.setVoices(buildVoices(droneParams()), true);
      if (d().moonBrightness) engine.update(config());
    }, 60_000);
  }

  function cleanup(): void {
    if (retuneTimer != null) clearInterval(retuneTimer);
    retuneTimer = null;
    engine?.close();
    engine = null;
  }
  return cleanup;
}

// --- small control factories (mirrors breath.ts) -----------------------------

function markChips(row: HTMLElement, id: string): void {
  [...row.children].forEach((c) =>
    (c as HTMLElement).classList.toggle('chip--on', (c as HTMLElement).dataset.id === id),
  );
}
function checkbox(checked: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const i = el('input', { type: 'checkbox' });
  i.checked = checked;
  i.addEventListener('change', () => onChange(i.checked));
  return i;
}
function range(value: number, onChange: (v: number) => void): HTMLInputElement {
  const i = el('input', { type: 'range', min: '0', max: '1', step: '0.05' });
  i.value = String(value);
  i.addEventListener('input', () => onChange(Number(i.value)));
  return i;
}
function wrap(node: HTMLElement): HTMLElement {
  return el('div', { className: 'row' }, node);
}
