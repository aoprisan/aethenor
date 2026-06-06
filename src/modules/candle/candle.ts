import {
  CANDLE_RITUALS,
  ritualById,
  ritualDurationSec,
  type CandleRitual,
  type CandlePhaseKind,
} from './rituals';
import { CandleChime } from './chime';
import { CandleSession, type CandleState } from './session';
import { getSettings, saveSettings } from '../../db/repo';
import type { Settings } from '../../db/schema';
import type { CueConfig } from '../breath/audio';
import { entryEditor } from '../record/editor';
import { el, button, field, card, page, toast } from '../../lib/ui';
import { isIOS, hasHaptics, hasSpeech, hasWakeLock } from '../../lib/platform';

const PHASE_LABEL: Record<CandlePhaseKind, string> = {
  gaze: 'Gaze — soft, steady, unblinking',
  rest: 'Eyes closed — hold the afterimage',
};

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function renderCandle(root: HTMLElement): (() => void) | void {
  root.append(
    page(
      'Candle',
      'Trāṭaka — fixed-gaze candle watch. Steady the flame outside; steady the mind within.',
    ),
  );
  const mount = el('div', {});
  root.append(mount);

  let session: CandleSession | null = null;
  let chime: CandleChime | null = null;
  let settings: Settings;
  let ritual: CandleRitual = CANDLE_RITUALS[0];

  void init();

  async function init(): Promise<void> {
    settings = await getSettings();
    ritual = ritualById(settings.candle?.lastRitualId ?? '') ?? CANDLE_RITUALS[0];
    chime = new CandleChime(cueConfig());
    build();
  }

  function cueConfig(): CueConfig {
    return { ...settings.cues! };
  }

  function customRitual(): CandleRitual {
    const c = settings.candle?.custom ?? { gazeSec: 120, restSec: 60, rounds: 5 };
    return {
      id: 'custom',
      name: 'Custom Watch',
      description: 'Your gaze, rest, and rounds.',
      gazeSec: c.gazeSec,
      restSec: c.restSec,
      rounds: c.rounds,
    };
  }

  function build(): void {
    mount.innerHTML = '';

    // --- iOS silent-switch hint (shared one-time dismissal with Breath) ---
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
          'On iPhone, Web Audio routes through the hardware mute switch — turn off silent mode to hear the bells.',
        ),
      );
      mount.append(hint);
    }

    // --- ritual selector ---
    const ritualRow = el('div', { className: 'row' });
    const allRituals = [...CANDLE_RITUALS, customRitual()];
    const customFields = el('div', {});
    const durationNote = el('p', { className: 'muted tiny' }, '');

    function reflectDuration(): void {
      durationNote.textContent = `Scheduled length ≈ ${mmss(ritualDurationSec(ritual))} (${ritual.rounds} round${ritual.rounds === 1 ? '' : 's'}).`;
    }

    function selectRitual(r: CandleRitual): void {
      ritual = r;
      [...ritualRow.children].forEach((c) =>
        (c as HTMLElement).classList.toggle('chip--on', (c as HTMLElement).dataset.id === r.id),
      );
      customFields.style.display = r.id === 'custom' ? '' : 'none';
      reflectDuration();
      void saveSettings({ candle: { ...settings.candle, lastRitualId: r.id } }).then(
        (s) => (settings = s),
      );
    }

    for (const r of allRituals) {
      const chip = el('span', { className: 'chip', title: r.description });
      chip.textContent = r.name;
      chip.dataset.id = r.id;
      chip.addEventListener('click', () => selectRitual(r));
      ritualRow.append(chip);
    }

    // custom inputs (gaze / rest are in seconds; rounds is a count)
    const c = settings.candle?.custom ?? { gazeSec: 120, restSec: 60, rounds: 5 };
    const mk = (v: number, min = '0', step = '5') => {
      const i = el('input', { type: 'number', min, step });
      i.value = String(v);
      return i;
    };
    const inGaze = mk(c.gazeSec);
    const inRest = mk(c.restSec);
    const inRounds = mk(c.rounds, '1', '1');
    const persistCustom = () => {
      const custom = {
        gazeSec: Math.max(0, Number(inGaze.value) || 0),
        restSec: Math.max(0, Number(inRest.value) || 0),
        rounds: Math.max(1, Number(inRounds.value) || 1),
      };
      void saveSettings({ candle: { ...settings.candle, custom } }).then((s) => {
        settings = s;
        if (ritual.id === 'custom') {
          ritual = customRitual();
          reflectDuration();
        }
      });
    };
    [inGaze, inRest, inRounds].forEach((i) => i.addEventListener('change', persistCustom));
    customFields.className = 'grid-2';
    customFields.append(
      field('Gaze (s)', inGaze),
      field('Rest (s)', inRest),
      field('Rounds', inRounds),
    );

    // --- stage ---
    const glow = el('div', { className: 'candle__glow' });
    const flame = el('div', { className: 'candle__flame' }, el('div', { className: 'candle__core' }));
    const wick = el('div', { className: 'candle__wick' });
    const body = el('div', { className: 'candle__body' });
    const candle = el('div', { className: 'candle' }, glow, body, wick, flame);
    const count = el('div', { className: 'breath-count' }, '');
    const phaseLabel = el('div', { className: 'breath-phase' }, 'Light a candle, then begin');
    const roundLabel = el('div', { className: 'muted tiny' }, '');
    const stage = el('div', { className: 'candle-stage' }, candle, count, phaseLabel, roundLabel);

    function setRest(resting: boolean): void {
      stage.classList.toggle('candle-stage--rest', resting);
      candle.classList.toggle('candle--rest', resting);
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
      setRest(false);
      candle.classList.remove('candle--lit');
      count.textContent = '';
      phaseLabel.textContent = 'Light a candle, then begin';
      roundLabel.textContent = '';
    }

    async function onStart(): Promise<void> {
      postMount.innerHTML = '';
      if (ritualDurationSec(ritual) <= 0) {
        toast('This watch has no gaze or rest time.');
        return;
      }
      if (isIOS()) toast('Silent mode off to hear the bells');
      chime!.update(cueConfig());
      candle.classList.add('candle--lit');
      session = new CandleSession(ritual, chime!, {
        onPhase: (phase) => {
          setRest(phase.kind === 'rest');
          phaseLabel.textContent = PHASE_LABEL[phase.kind];
        },
        onTick: (remaining) => {
          count.textContent = mmss(remaining);
          roundLabel.textContent = `Round ${Math.min(session!.rounds + 1, ritual.rounds)} of ${ritual.rounds}`;
        },
        onState: (s) => reflectState(s),
        onComplete: (elapsed, rounds) => {
          session = null;
          resetStage();
          phaseLabel.textContent = 'The watch is complete';
          offerLog(elapsed, rounds, true);
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
      const rounds = session.rounds;
      session.stop();
      session = null;
      resetStage();
      offerLog(elapsed, rounds, false);
    }

    function reflectState(s: CandleState): void {
      const running = s === 'running' || s === 'paused';
      startBtn.style.display = running ? 'none' : '';
      pauseBtn.style.display = running ? '' : 'none';
      stopBtn.style.display = running ? '' : 'none';
      if (!running) pauseBtn.textContent = 'Pause';
    }

    function offerLog(elapsedSec: number, rounds: number, completed: boolean): void {
      postMount.innerHTML = '';
      const lead = completed ? 'Watch complete' : 'Watch ended';
      const head = el(
        'p',
        { className: 'muted' },
        `${lead} — ${mmss(elapsedSec)}, ${rounds} round${rounds === 1 ? '' : 's'}.`,
      );
      const logBtn = button(
        'Log to Record',
        () => {
          postMount.innerHTML = '';
          postMount.append(
            entryEditor({
              prefill: { technique: ritual.name, durationSec: elapsedSec, tags: ['trataka'] },
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

    // --- cue settings (shared with Breath) ---
    const cueCard = buildCueSettings();

    mount.append(
      card(field('Watch', el('div', {}, ritualRow)), customFields, durationNote),
      stage,
      controls,
      postMount,
      cueCard,
    );
    selectRitual(ritual);
  }

  function buildCueSettings(): HTMLElement {
    const c = settings.cues!;
    const save = (patch: Partial<CueConfig>) => {
      void saveSettings({ cues: { ...settings.cues!, ...patch } }).then((s) => {
        settings = s;
        chime?.update(cueConfig());
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
      el(
        'p',
        { className: 'muted tiny' },
        'A single low bell opens the gaze · a soft two-tone turns you inward for rest.',
      ),
      field('Bell cues', wrap(tones)),
      field('Bell volume', tonesVol),
      ...speechRow,
      haptics,
      noteEl,
    );
  }

  function cleanup(): void {
    session?.stop();
    session = null;
    chime?.close();
    chime = null;
  }
  return cleanup;
}

// --- small control factories (mirrors Breath) ---
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
