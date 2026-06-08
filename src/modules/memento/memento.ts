import {
  MEDITATIONS,
  meditationById,
  customMeditation,
  type Meditation,
} from './meditations';
import { CONTEMPLATIONS, contemplationAt } from './quotes';
import { skull, hourglass } from './vanitas';
import { MementoSession, type MementoState } from './session';
import { CueEngine, type CueConfig } from '../breath/audio';
import type { BreathPhase, BreathPhaseKind } from '../breath/patterns';
import { getSettings, saveSettings } from '../../db/repo';
import type { Settings } from '../../db/schema';
import { entryEditor } from '../record/editor';
import { el, button, field, card, page, toast } from '../../lib/ui';
import { isIOS, hasHaptics, hasSpeech, hasWakeLock } from '../../lib/platform';

const PHASE_LABEL: Record<BreathPhaseKind, string> = {
  inhale: 'Breathe in',
  'hold-in': 'Hold',
  exhale: 'Breathe out',
  'hold-out': 'Rest',
};
// How far the breath aura swells/contracts per phase.
const AURA_SCALE: Record<BreathPhaseKind, number> = {
  inhale: 1,
  'hold-in': 1,
  exhale: 0.66,
  'hold-out': 0.66,
};

const DEFAULT_CUSTOM = { minutes: 8, inhale: 6, exhale: 6 };

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function renderMemento(root: HTMLElement): (() => void) | void {
  root.append(
    page(
      'Memento Mori',
      'Watch one candle burn down with the breath. Remember you must die — and so, live.',
    ),
  );
  // Vanitas emblems — a skull and hourglass flanking the old memento-mori motto.
  root.append(
    el(
      'div',
      { className: 'memento-emblems' },
      el('span', { className: 'vanitas-wrap' }, skull()),
      el('span', { className: 'memento-emblems__motto' }, 'hora fugit · mors certa'),
      el('span', { className: 'vanitas-wrap' }, hourglass()),
    ),
  );
  const mount = el('div', {});
  root.append(mount);

  let session: MementoSession | null = null;
  let cues: CueEngine | null = null;
  let settings: Settings;
  let meditation: Meditation = MEDITATIONS[0];

  void init();

  async function init(): Promise<void> {
    settings = await getSettings();
    meditation = meditationById(settings.memento?.lastMeditationId ?? '') ?? MEDITATIONS[0];
    cues = new CueEngine(cueConfig());
    build();
  }

  function cueConfig(): CueConfig {
    return { ...settings.cues! };
  }

  function customMed(): Meditation {
    return customMeditation(settings.memento?.custom ?? DEFAULT_CUSTOM);
  }

  function build(): void {
    mount.innerHTML = '';

    // --- iOS silent-switch hint (shared one-time dismissal with Breath/Candle) ---
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
          'On iPhone, Web Audio routes through the hardware mute switch — turn off silent mode to hear the breath cues.',
        ),
      );
      mount.append(hint);
    }

    // --- meditation selector ---
    const medRow = el('div', { className: 'row' });
    const allMeds = [...MEDITATIONS, customMed()];
    const customFields = el('div', {});
    const durationNote = el('p', { className: 'muted tiny' }, '');

    function reflectDuration(): void {
      durationNote.textContent = `The candle burns for ${mmss(meditation.totalSec)}.`;
    }

    function selectMeditation(m: Meditation): void {
      meditation = m;
      [...medRow.children].forEach((c) =>
        (c as HTMLElement).classList.toggle('chip--on', (c as HTMLElement).dataset.id === m.id),
      );
      customFields.style.display = m.id === 'custom' ? '' : 'none';
      reflectDuration();
      void saveSettings({ memento: { ...settings.memento, lastMeditationId: m.id } }).then(
        (s) => (settings = s),
      );
    }

    for (const m of allMeds) {
      const chip = el('span', { className: 'chip', title: m.description });
      chip.textContent = m.name;
      chip.dataset.id = m.id;
      chip.addEventListener('click', () => selectMeditation(m));
      medRow.append(chip);
    }

    // custom inputs (length in minutes; breath in seconds)
    const c = settings.memento?.custom ?? DEFAULT_CUSTOM;
    const mk = (v: number, min = '0', step = '0.5') => {
      const i = el('input', { type: 'number', min, step });
      i.value = String(v);
      return i;
    };
    const inMin = mk(c.minutes, '1', '1');
    const inIn = mk(c.inhale);
    const inEx = mk(c.exhale);
    const persistCustom = () => {
      const custom = {
        minutes: Math.max(1, Number(inMin.value) || 1),
        inhale: Math.max(0, Number(inIn.value) || 0),
        exhale: Math.max(0, Number(inEx.value) || 0),
      };
      void saveSettings({ memento: { ...settings.memento, custom } }).then((s) => {
        settings = s;
        if (meditation.id === 'custom') {
          meditation = customMed();
          reflectDuration();
        }
      });
    };
    [inMin, inIn, inEx].forEach((i) => i.addEventListener('change', persistCustom));
    customFields.className = 'grid-2';
    customFields.append(
      field('Length (min)', inMin),
      field('Inhale (s)', inIn),
      field('Exhale (s)', inEx),
    );

    // --- stage: a candle that burns down, wrapped in a breathing aura ---
    const aura = el('div', { className: 'memento-aura' });
    const flame = el('div', { className: 'memento-candle__flame' }, el('div', { className: 'memento-candle__core' }));
    const wick = el('div', { className: 'memento-candle__wick' });
    const wax = el('div', { className: 'memento-candle__wax' });
    const holder = el('div', { className: 'memento-candle__holder' });
    const candle = el('div', { className: 'memento-candle' }, aura, holder, wax, wick, flame);
    candle.style.setProperty('--burn', '1');

    // The candle stands before a skull — the vanitas tableau. The skull lifts
    // out of the dark as the flame catches (see --lit below).
    const skullBack = skull();
    skullBack.classList.add('memento-skull');
    const tableau = el('div', { className: 'memento-tableau' }, skullBack, candle);

    const count = el('div', { className: 'breath-count' }, '');
    const phaseLabel = el('div', { className: 'breath-phase' }, 'Light the candle, then begin');

    // contemplation quote, cross-faded as the session advances
    const quoteText = el('blockquote', { className: 'memento-quote__text' }, '');
    const quoteSource = el('cite', { className: 'memento-quote__source' }, '');
    const quote = el('figure', { className: 'memento-quote' }, quoteText, quoteSource);

    const stage = el(
      'div',
      { className: 'memento-stage' },
      tableau,
      count,
      phaseLabel,
      quote,
    );

    let quoteSeed = 0;
    let shownQuoteIndex = -1;

    function setQuote(index: number, animate: boolean): void {
      const q = CONTEMPLATIONS[index];
      const apply = () => {
        quoteText.textContent = q.text;
        quoteSource.textContent = `— ${q.source}`;
        quote.classList.add('memento-quote--in');
      };
      if (!animate) {
        apply();
        return;
      }
      quote.classList.remove('memento-quote--in');
      window.setTimeout(apply, 600);
    }

    function setAura(kind: BreathPhaseKind, seconds: number): void {
      aura.style.transitionDuration = `${seconds}s`;
      aura.style.transform = `scale(${AURA_SCALE[kind]})`;
    }

    // --- controls ---
    const startBtn = button('Begin', () => void onStart(), { primary: true });
    const pauseBtn = button('Pause', () => onPause());
    const stopBtn = button('End', () => onStop());
    pauseBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    const controls = el('div', { className: 'row' }, startBtn, pauseBtn, stopBtn);

    const postMount = el('div', {});

    function resetStage(): void {
      candle.classList.remove('memento-candle--lit');
      tableau.classList.remove('memento-tableau--lit');
      candle.style.setProperty('--burn', '1');
      aura.style.transitionDuration = '0.8s';
      aura.style.transform = 'scale(0.66)';
      count.textContent = '';
      phaseLabel.textContent = 'Light the candle, then begin';
      quote.classList.remove('memento-quote--in');
      shownQuoteIndex = -1;
    }

    async function onStart(): Promise<void> {
      postMount.innerHTML = '';
      if (meditation.totalSec <= 0 || meditation.phases.length === 0) {
        toast('This meditation has no length or breath.');
        return;
      }
      if (isIOS()) toast('Silent mode off to hear the cues');
      cues!.update(cueConfig());
      candle.classList.add('memento-candle--lit');
      tableau.classList.add('memento-tableau--lit');
      quoteSeed = Math.floor(Math.random() * CONTEMPLATIONS.length);
      shownQuoteIndex = -1;
      const total = meditation.totalSec;

      session = new MementoSession(meditation, cues!, {
        onPhase: (phase: BreathPhase) => {
          setAura(phase.kind, phase.seconds);
          phaseLabel.textContent = PHASE_LABEL[phase.kind];
        },
        onTick: (elapsed, remaining) => {
          count.textContent = mmss(remaining);
          // Burn the candle down: wax remaining ∝ time remaining.
          candle.style.setProperty('--burn', String(Math.max(0, remaining / total)));
          const { index } = contemplationAt(elapsed, total, quoteSeed);
          if (index !== shownQuoteIndex) {
            setQuote(index, shownQuoteIndex !== -1);
            shownQuoteIndex = index;
          }
        },
        onState: (s) => reflectState(s),
        onComplete: (elapsed) => {
          session = null;
          // Leave the candle spent — a burned-down stub, flame snuffed, and the
          // skull sinking back into the dark.
          candle.style.setProperty('--burn', '0');
          candle.classList.remove('memento-candle--lit');
          tableau.classList.remove('memento-tableau--lit');
          aura.style.transitionDuration = '1.2s';
          aura.style.transform = 'scale(0.66)';
          count.textContent = '';
          quote.classList.remove('memento-quote--in');
          shownQuoteIndex = -1;
          phaseLabel.textContent = 'The candle is spent';
          offerLog(elapsed, true);
        },
      });
      await session.start();
    }

    function onPause(): void {
      if (!session) return;
      if (pauseBtn.textContent === 'Pause') {
        session.pause();
        pauseBtn.textContent = 'Resume';
      } else {
        void session.resume();
        pauseBtn.textContent = 'Pause';
      }
    }

    function onStop(): void {
      if (!session) return;
      const elapsed = session.elapsedSec;
      session.stop();
      session = null;
      resetStage();
      offerLog(elapsed, false);
    }

    function reflectState(s: MementoState): void {
      const running = s === 'running' || s === 'paused';
      startBtn.style.display = running ? 'none' : '';
      pauseBtn.style.display = running ? '' : 'none';
      stopBtn.style.display = running ? '' : 'none';
      if (!running) pauseBtn.textContent = 'Pause';
    }

    function offerLog(elapsedSec: number, completed: boolean): void {
      postMount.innerHTML = '';
      const lead = completed ? 'Meditation complete' : 'Meditation ended';
      const head = el('p', { className: 'muted' }, `${lead} — ${mmss(elapsedSec)} contemplated.`);
      const logBtn = button(
        'Log to Record',
        () => {
          postMount.innerHTML = '';
          postMount.append(
            entryEditor({
              prefill: {
                technique: `Memento Mori — ${meditation.name}`,
                durationSec: elapsedSec,
                tags: ['memento-mori'],
              },
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

    // --- cue settings (shared with Breath / Candle) ---
    const cueCard = buildCueSettings();

    mount.append(
      card(field('Meditation', el('div', {}, medRow)), customFields, durationNote),
      stage,
      controls,
      postMount,
      cueCard,
    );
    selectMeditation(meditation);
    resetStage();
  }

  function buildCueSettings(): HTMLElement {
    const c = settings.cues!;
    const save = (patch: Partial<CueConfig>) => {
      void saveSettings({ cues: { ...settings.cues!, ...patch } }).then((s) => {
        settings = s;
        cues?.update(cueConfig());
      });
    };

    const tones = checkbox(c.tonesEnabled, (v) => save({ tonesEnabled: v }));
    const tonesVol = range(c.tonesVolume, (v) => save({ tonesVolume: v }));
    const speechRow: (Node | string)[] = [];
    if (hasSpeech()) {
      const speech = checkbox(c.speechEnabled, (v) => save({ speechEnabled: v }));
      const speechVol = range(c.speechVolume, (v) => save({ speechVolume: v }));
      speechRow.push(field('Spoken cues', wrap(speech)), field('Voice volume', speechVol));
    }
    const haptics = hasHaptics()
      ? field('Haptics', wrap(checkbox(c.hapticsEnabled, (v) => save({ hapticsEnabled: v }))))
      : null;

    const notes: string[] = [];
    if (!hasWakeLock()) notes.push('Wake Lock unsupported — keep the screen awake manually.');
    const noteEl = notes.length ? el('p', { className: 'muted tiny' }, notes.join(' ')) : null;

    return card(
      el('h2', {}, 'Cues'),
      el('p', { className: 'muted tiny' }, 'Rising tone = inhale · falling = exhale. The quotes turn in silence.'),
      field('Tone cues', wrap(tones)),
      field('Tone volume', tonesVol),
      ...speechRow,
      haptics,
      noteEl,
    );
  }

  function cleanup(): void {
    session?.stop();
    session = null;
    cues?.close();
    cues = null;
  }
  return cleanup;
}

// --- small control factories (mirrors Breath / Candle) ---
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
