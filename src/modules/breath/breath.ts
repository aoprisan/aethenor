import { PATTERNS, patternById, type BreathPattern, type BreathPhaseKind } from './patterns';
import { CueEngine, type CueConfig } from './audio';
import { BreathSession, type SessionState } from './session';
import { getSettings, saveSettings } from '../../db/repo';
import type { Settings } from '../../db/schema';
import { entryEditor } from '../record/editor';
import { el, button, field, card, page, toast } from '../../lib/ui';
import { isIOS, hasHaptics, hasSpeech, hasWakeLock } from '../../lib/platform';

const PHASE_LABEL: Record<BreathPhaseKind, string> = {
  inhale: 'Inhale',
  'hold-in': 'Hold',
  exhale: 'Exhale',
  'hold-out': 'Hold',
};
const TARGET_SCALE: Record<BreathPhaseKind, number> = {
  inhale: 1,
  'hold-in': 1,
  exhale: 0.45,
  'hold-out': 0.45,
};

export function renderBreath(root: HTMLElement): (() => void) | void {
  root.append(
    page('Breath', 'The spine of the practice — an eyes-open guide with eyes-closed audio cues.'),
  );
  const mount = el('div', {});
  root.append(mount);

  let session: BreathSession | null = null;
  let cues: CueEngine | null = null;
  let settings: Settings;
  let pattern: BreathPattern = PATTERNS[0];

  // Build asynchronously once settings load; return a cleanup that stops any
  // live session regardless.
  void init();

  async function init(): Promise<void> {
    settings = await getSettings();
    pattern = patternById(settings.breath?.lastPatternId ?? '') ?? PATTERNS[0];
    cues = new CueEngine(cueConfig());
    build();
  }

  function cueConfig(): CueConfig {
    const c = settings.cues!;
    return { ...c };
  }

  function customPattern(): BreathPattern {
    const c = settings.breath?.custom ?? { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 };
    const phases = [
      { kind: 'inhale' as const, seconds: c.inhale },
      { kind: 'hold-in' as const, seconds: c.holdIn },
      { kind: 'exhale' as const, seconds: c.exhale },
      { kind: 'hold-out' as const, seconds: c.holdOut },
    ].filter((p) => p.seconds > 0);
    return { id: 'custom', name: 'Custom', description: 'Your ratio.', phases };
  }

  function build(): void {
    mount.innerHTML = '';

    // --- iOS silent-switch hint (one-time, dismissible) ---
    if (isIOS() && !settings.dismissedHints?.includes('ios-silent')) {
      const hint = el('div', { className: 'hint' });
      const close = button('Dismiss', () => {
        void saveSettings({ dismissedHints: [...(settings.dismissedHints ?? []), 'ios-silent'] }).then(
          (s) => (settings = s),
        );
        hint.remove();
      });
      close.className = 'hint__close';
      hint.append(
        close,
        document.createTextNode(
          'On iPhone, Web Audio routes through the hardware mute switch — turn off silent mode to hear breath cues.',
        ),
      );
      mount.append(hint);
    }

    // --- pattern selector ---
    const patternRow = el('div', { className: 'row' });
    const allPatterns = [...PATTERNS, customPattern()];
    const customFields = el('div', {});

    function selectPattern(p: BreathPattern): void {
      pattern = p;
      [...patternRow.children].forEach((c) =>
        (c as HTMLElement).classList.toggle('chip--on', (c as HTMLElement).dataset.id === p.id),
      );
      customFields.style.display = p.id === 'custom' ? '' : 'none';
      void saveSettings({ breath: { ...settings.breath, lastPatternId: p.id } }).then(
        (s) => (settings = s),
      );
    }

    for (const p of allPatterns) {
      const chip = el('span', { className: 'chip', title: p.description });
      chip.textContent = p.name;
      chip.dataset.id = p.id;
      chip.addEventListener('click', () => selectPattern(p));
      patternRow.append(chip);
    }

    // custom ratio inputs
    const c = settings.breath?.custom ?? { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 };
    const mk = (v: number) => {
      const i = el('input', { type: 'number', min: '0', step: '0.5' });
      i.value = String(v);
      return i;
    };
    const inIn = mk(c.inhale);
    const inHi = mk(c.holdIn);
    const inEx = mk(c.exhale);
    const inHo = mk(c.holdOut);
    const persistCustom = () => {
      const custom = {
        inhale: Number(inIn.value) || 0,
        holdIn: Number(inHi.value) || 0,
        exhale: Number(inEx.value) || 0,
        holdOut: Number(inHo.value) || 0,
      };
      void saveSettings({ breath: { ...settings.breath, custom } }).then((s) => {
        settings = s;
        if (pattern.id === 'custom') pattern = customPattern();
      });
    };
    [inIn, inHi, inEx, inHo].forEach((i) => i.addEventListener('change', persistCustom));
    customFields.className = 'grid-2';
    customFields.append(
      field('Inhale (s)', inIn),
      field('Hold in (s)', inHi),
      field('Exhale (s)', inEx),
      field('Hold out (s)', inHo),
    );

    // --- stage ---
    const orbInner = el('div', { className: 'breath-orb__inner' }, 'Ready');
    const orb = el('div', { className: 'breath-orb' }, orbInner);
    const count = el('div', { className: 'breath-count' }, '');
    const phaseLabel = el('div', { className: 'breath-phase' }, 'Tap start');
    const cycleLabel = el('div', { className: 'muted tiny' }, '');
    const stage = el('div', { className: 'breath-stage' }, orb, count, phaseLabel, cycleLabel);

    // --- controls ---
    const startBtn = button('Start', () => void onStart(), { primary: true });
    const pauseBtn = button('Pause', () => onPause());
    const stopBtn = button('Stop', () => onStop());
    pauseBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    const controls = el('div', { className: 'row' }, startBtn, pauseBtn, stopBtn);

    const postMount = el('div', {});

    async function onStart(): Promise<void> {
      postMount.innerHTML = '';
      if (pattern.phases.length === 0) {
        toast('This pattern has no phases.');
        return;
      }
      if (isIOS()) toast('Silent mode off to hear cues');
      cues!.update(cueConfig());
      session = new BreathSession(pattern, cues!, {
        onPhase: (phase) => {
          orb.style.transitionDuration = `${phase.seconds}s`;
          orb.style.transform = `scale(${TARGET_SCALE[phase.kind]})`;
          orbInner.textContent = PHASE_LABEL[phase.kind];
          phaseLabel.textContent = PHASE_LABEL[phase.kind];
        },
        onTick: (remaining) => {
          count.textContent = String(remaining);
          cycleLabel.textContent = `Cycle ${session!.cycles + 1}`;
        },
        onState: (s) => reflectState(s),
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
      const cycles = session.cycles;
      session.stop();
      session = null;
      orb.style.transitionDuration = '0.6s';
      orb.style.transform = 'scale(0.45)';
      orbInner.textContent = 'Ready';
      count.textContent = '';
      phaseLabel.textContent = 'Tap start';
      cycleLabel.textContent = '';
      offerLog(elapsed, cycles);
    }

    function reflectState(s: SessionState): void {
      const running = s === 'running' || s === 'paused';
      startBtn.style.display = running ? 'none' : '';
      pauseBtn.style.display = running ? '' : 'none';
      stopBtn.style.display = running ? '' : 'none';
      if (!running) pauseBtn.textContent = 'Pause';
    }

    function offerLog(elapsedSec: number, cycles: number): void {
      postMount.innerHTML = '';
      const head = el(
        'p',
        { className: 'muted' },
        `Session complete — ${Math.round(elapsedSec / 60)} min ${elapsedSec % 60}s, ${cycles} cycle(s).`,
      );
      const logBtn = button(
        'Log to Record',
        () => {
          postMount.innerHTML = '';
          postMount.append(
            entryEditor({
              prefill: { technique: pattern.name, durationSec: elapsedSec },
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

    // --- cue settings ---
    const cueCard = buildCueSettings();

    mount.append(
      card(
        field('Pattern', el('div', {}, patternRow)),
        customFields,
      ),
      stage,
      controls,
      postMount,
      cueCard,
    );
    selectPattern(pattern);
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
    let speech: HTMLInputElement | null = null;
    let speechVol: HTMLInputElement | null = null;
    if (hasSpeech()) {
      speech = checkbox(c.speechEnabled, (v) => save({ speechEnabled: v }));
      speechVol = range(c.speechVolume, (v) => save({ speechVolume: v }));
      speechRow.push(
        field('Spoken cues', wrap(speech)),
        field('Voice volume', speechVol),
      );
    }
    const haptics = hasHaptics()
      ? field('Haptics', wrap(checkbox(c.hapticsEnabled, (v) => save({ hapticsEnabled: v }))))
      : null;

    const notes: string[] = [];
    if (!hasWakeLock()) notes.push('Wake Lock unsupported — keep the screen awake manually.');
    const noteEl = notes.length ? el('p', { className: 'muted tiny' }, notes.join(' ')) : null;

    return card(
      el('h2', {}, 'Cues'),
      el('p', { className: 'muted tiny' }, 'Ascending tone = inhale · steady = hold · descending = exhale.'),
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

// --- small control factories ---
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
