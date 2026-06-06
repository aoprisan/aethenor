import { buildPrompt, type AstroContext, type IntentTemplate, type PromptScope } from '../../ai/prompt';
import { queryEntries } from '../../db/repo';
import { getSettings, saveSettings } from '../../db/repo';
import type { Settings } from '../../db/schema';
import { moonInfo, planetaryDay, currentHour, dayRuler } from '../timing/astro';
import { resolveLocation } from '../../lib/location';
import { canShareFiles, canShareText, isIOS } from '../../lib/platform';
import { el, button, card, field, page, toast } from '../../lib/ui';

const INTENTS: { id: IntentTemplate; label: string }[] = [
  { id: 'interpret-recent-practice', label: 'Interpret recent practice' },
  { id: 'find-patterns-in-dreams', label: 'Find patterns in my dreams' },
  { id: 'suggest-tomorrows-working', label: "Suggest tomorrow's working" },
];
const SCOPE_TAGS = ['dream', 'omen', 'divination'];

type ScopeKind = 'last-n' | 'date-range' | 'tags';

export function renderHierophant(root: HTMLElement): void {
  root.append(
    page('Hierophant',
      'Bundle your record + current timing into a prompt, then share it to your own AI agent.'),
  );
  const body = el('div', {});
  root.append(body);

  let settings: Settings;
  let intent: IntentTemplate = 'interpret-recent-practice';
  let scopeKind: ScopeKind = 'last-n';
  let lastN = 10;
  let from = Date.now() - 7 * 86400000;
  let to = Date.now();
  const tags = new Set<string>(SCOPE_TAGS);
  let includeNotes = true;

  void init();

  async function init(): Promise<void> {
    settings = await getSettings();
    build();
  }

  function currentScope(): PromptScope {
    if (scopeKind === 'last-n') return { kind: 'last-n', n: lastN };
    if (scopeKind === 'date-range') return { kind: 'date-range', from, to };
    return { kind: 'tags', tags: [...tags] };
  }

  async function resolveEntries() {
    if (scopeKind === 'last-n') return queryEntries({ order: 'desc', limit: lastN });
    if (scopeKind === 'date-range') return queryEntries({ from, to, order: 'asc' });
    return queryEntries({ tags: [...tags], order: 'desc' });
  }

  async function astroContext(): Promise<AstroContext> {
    const now = new Date();
    const moon = moonInfo(now);
    const loc = await resolveLocation();
    let hourRuler = 'unknown';
    let ruler = dayRuler(now) as string;
    if (loc) {
      const day = planetaryDay(now, loc.lat, loc.lon);
      ruler = day.dayRuler;
      hourRuler = currentHour(day, now)?.ruler ?? 'unknown';
    }
    return {
      date: now.getTime(),
      moonPhase: moon.phase,
      moonIllumination: moon.illumination,
      moonPhaseName: moon.name,
      planetaryHourRuler: hourRuler,
      dayRuler: ruler,
      location: loc ? { lat: loc.lat, lon: loc.lon, label: loc.label } : undefined,
    };
  }

  function build(): void {
    body.innerHTML = '';

    // intent
    const intentSel = el('select', {});
    for (const i of INTENTS) {
      const o = el('option', { value: i.id });
      o.textContent = i.label;
      intentSel.append(o);
    }
    intentSel.value = intent;
    intentSel.addEventListener('change', () => (intent = intentSel.value as IntentTemplate));

    // scope kind
    const scopeSel = el('select', {});
    for (const [val, label] of [
      ['last-n', 'Last N sessions'],
      ['date-range', 'Date range'],
      ['tags', 'By tags'],
    ] as const) {
      const o = el('option', { value: val });
      o.textContent = label;
      scopeSel.append(o);
    }
    scopeSel.value = scopeKind;

    const scopeDetail = el('div', {});
    function drawScopeDetail(): void {
      scopeDetail.innerHTML = '';
      if (scopeKind === 'last-n') {
        const n = el('input', { type: 'number', min: '1', step: '1' });
        n.value = String(lastN);
        n.addEventListener('input', () => (lastN = Math.max(1, Number(n.value) || 1)));
        scopeDetail.append(field('How many sessions', n));
      } else if (scopeKind === 'date-range') {
        const f = el('input', { type: 'date' });
        const t = el('input', { type: 'date' });
        f.value = new Date(from).toISOString().slice(0, 10);
        t.value = new Date(to).toISOString().slice(0, 10);
        f.addEventListener('change', () => (from = new Date(f.value).getTime()));
        t.addEventListener('change', () => (to = new Date(t.value).getTime() + 86399000));
        scopeDetail.append(el('div', { className: 'grid-2' }, field('From', f), field('To', t)));
      } else {
        const row = el('div', { className: 'row' });
        for (const tg of SCOPE_TAGS) {
          const chip = el('span', { className: 'chip' + (tags.has(tg) ? ' chip--on' : '') });
          chip.textContent = tg;
          chip.addEventListener('click', () => {
            if (tags.has(tg)) tags.delete(tg);
            else tags.add(tg);
            chip.classList.toggle('chip--on');
          });
          row.append(chip);
        }
        scopeDetail.append(field('Tags (any)', row));
      }
    }
    scopeSel.addEventListener('change', () => {
      scopeKind = scopeSel.value as ScopeKind;
      drawScopeDetail();
    });
    drawScopeDetail();

    const notesChk = el('input', { type: 'checkbox' });
    notesChk.checked = includeNotes;
    notesChk.addEventListener('change', () => (includeNotes = notesChk.checked));

    const preview = el('div', { className: 'prompt-preview' }, 'Build a prompt to preview it here.');
    const meta = el('p', { className: 'muted tiny' });
    const egress = el('div', { className: 'row' });

    const buildBtn = button('Build prompt', () => void doBuild(), { primary: true });

    async function doBuild(): Promise<void> {
      const entries = await resolveEntries();
      const ctx = await astroContext();
      const built = buildPrompt({ intent, entries, scope: currentScope(), context: ctx, includeNotes });
      preview.textContent = built.text;
      meta.textContent = `${built.meta.entryCount} session(s) · ${built.meta.charCount} chars`;
      drawEgress(built.title, built.text);
    }

    function drawEgress(title: string, text: string): void {
      egress.innerHTML = '';
      // Always-available fallback.
      egress.append(
        button('Copy prompt', async () => {
          try {
            await navigator.clipboard.writeText(text);
            toast('Prompt copied.');
          } catch {
            toast('Copy failed — select the text manually.');
          }
        }),
      );
      // Primary mobile egress: Web Share.
      if (canShareText()) {
        egress.append(
          button('Share', async () => {
            try {
              await navigator.share({ title, text });
            } catch {
              /* user cancelled — no-op */
            }
          }, { primary: true }),
        );
        if (canShareFiles()) {
          egress.append(
            button('Share as file', async () => {
              const file = new File([text], 'athanor-prompt.md', { type: 'text/markdown' });
              try {
                await navigator.share({ title, files: [file] });
              } catch {
                /* cancelled */
              }
            }),
          );
        }
      }
    }

    // iOS share Shortcut hint (one-time).
    const showShareHint = isIOS() && canShareText() && !settings.dismissedHints?.includes('ios-share');
    const hintCard = showShareHint ? iosShareHint() : null;

    body.append(
      card(
        field('Intent', intentSel),
        field('Scope', scopeSel),
        scopeDetail,
        field('Include free-text notes', el('div', { className: 'row' }, notesChk)),
        el('div', { className: 'row' }, buildBtn),
      ),
    );
    if (hintCard) body.append(hintCard);
    body.append(card(el('h2', {}, 'Prompt'), meta, preview, egress));
  }

  function iosShareHint(): HTMLElement {
    const hint = el('div', { className: 'hint' });
    const close = button('Dismiss', () => {
      void saveSettings({ dismissedHints: [...(settings.dismissedHints ?? []), 'ios-share'] }).then(
        (s) => (settings = s),
      );
      hint.remove();
    });
    close.className = 'hint__close';
    hint.append(
      close,
      document.createTextNode(
        'On iPhone, sharing text to Claude needs a one-time "Ask Claude" Shortcut added to your Share Sheet. ' +
          'Alternatively use “Share as file”, which the Claude app accepts directly, or just Copy.',
      ),
    );
    return hint;
  }
}
