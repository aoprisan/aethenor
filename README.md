# Athanor

A hermetic / occult daily-practice **PWA**: **breathwork** as the spine, plus a
structured **magical record** and **planetary / lunar timing**, with an
AI-interpretation layer on a **bring-your-own-agent** model.

Fully static, client-side only, installable, and offline-capable. No backend,
no API keys, no account. Your data stays on your device and is yours to export.

> Austere, dark, hermetic — the opposite of wellness-pastel.

---

## Status

**v1 implemented.** All three modules + the AI layer are built on the scaffold
described below:

- **Breath** — animated orb guide; presets (box, 4-7-8, coherent, nadi shodhana)
  plus a custom-ratio builder; Web Audio tone cues (rising/steady/falling),
  optional spoken cues, haptics; AudioContext unlock + Screen Wake Lock on
  start; one-time iOS silent-switch hint; "log to Record" after a session.
- **Candle** — Trāṭaka fixed-gaze watch; a flickering CSS flame that snuffs for
  eyes-closed *rest* phases (hold the afterimage); ritual presets plus a custom
  gaze/rest/rounds builder; soft Web Audio bell cues (single bell opens the gaze,
  two-tone turns you inward), optional spoken cues + haptics; Wake Lock; finite
  rounds that complete themselves; "log to Record" after the watch.
- **Monochord** — an astro-tuned ambient drone, synthesised entirely with Web
  Audio oscillators (no hosted audio). Root is a planetary tone (Cousto "Cosmic
  Octave"), optionally following the live planetary-hour ruler; overtones stack
  by tuning system (just / Pythagorean / equal / planetary); brightness can be
  driven by lunar illumination. Long fades, slow beating + drift, Screen Wake
  Lock while sounding, and "log to Record" after a sitting.
- **Record** — IndexedDB diary with the schema below; new/edit/delete; search +
  tag filters; streak + contribution-style heatmap; JSON export/import.
- **Timing** — moon phase/illumination, current planetary hour + day ruler, and
  the day's full Chaldean-order hour table, from geolocation or manual coords.
- **Hierophant** — pure prompt-builder (unit-tested) + scope picker + intents;
  egress via Web Share (with iOS share-Shortcut hint and share-as-file) and an
  always-present Copy fallback. No network calls, no keys.

```bash
npm test     # vitest — prompt-builder + Monochord tuning determinism/shape
```

## Stack

- **TypeScript + Vite**
- **vite-plugin-pwa** (Workbox) — manifest + offline service worker
- **idb** — IndexedDB ergonomics (The Magical Record)
- **suncalc** — sun/moon times (planetary & lunar timing)
- Vanilla TS, hash-based router, no UI framework. Minimal dependencies.

## Develop

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build locally
```

## The base-path contract (read this first)

Athanor deploys to a GitHub Pages **project page**, served from
`https://<user>.github.io/aethenor/` — **not** a root domain. Getting any path
wrong here is the #1 way Pages PWAs break. The base path is wired through in one
place and respected everywhere:

- **Vite** — `base: '/aethenor/'` in `vite.config.ts`.
- **Manifest** — `start_url`, `scope`, and `id` all set to `/aethenor/`.
- **Service worker** — registration scope derives from Vite `base`;
  `navigateFallback` is `/aethenor/index.html`.
- **Assets** — referenced relatively (`./favicon.svg`, etc.) or via Vite so the
  base is applied at build time.

If you fork to a different repo name, change `BASE` in `vite.config.ts` (it is
the single source of truth) and update this README.

### Routing

Hash-based (`#/breath`). A project Pages site has no server to rewrite deep
links, so hash routes keep every URL a request for the same `index.html` —
refresh-safe and offline-safe with the SW navigate fallback.

## GitHub Pages setup

1. Push to `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` builds with Vite and deploys
   the `dist/` artifact to the Pages environment.

## Icons

Icons are SVG (`public/icon.svg`, `icon-maskable.svg`, `favicon.svg`) to keep
the build static and tiny. For the best iOS home-screen appearance you may want
to add a rasterised `apple-touch-icon.png` (180×180) later; the app works
without it.

---

## v1 design proposals

### 1. File / module architecture

```
athanor/
├── index.html               # base-path-aware shell host
├── vite.config.ts           # BASE = '/aethenor/' (single source of truth) + PWA
├── public/                  # static icons (SVG)
└── src/
    ├── main.ts              # entry: mount shell, register routes, init PWA
    ├── app.css              # dark hermetic theme (one accent, no gradients)
    ├── router.ts            # hash router (static-host-safe)
    ├── shell/shell.ts       # persistent chrome: outlet + bottom nav
    ├── lib/
    │   ├── pwa.ts           # explicit SW registration (scope = base)
    │   └── ui.ts            # tiny vanilla DOM helpers
    ├── db/
    │   └── schema.ts        # IndexedDB schema + typed handle (idb)
    ├── ai/
    │   └── prompt.ts        # PURE prompt-builder (no network, no keys)
    └── modules/
        ├── breath/          # animated guide, Web Audio/Speech cues, haptics,
        │   ├── breath.ts    #   wake lock, iOS silent-switch hint
        │   └── patterns.ts  # pattern definitions (box, 4-7-8, coherent, …)
        ├── candle/          # Trāṭaka candle-gaze watch (CSS flame, bell cues)
        │   ├── candle.ts    #   UI; gaze/rest stage, wake lock, log to Record
        │   ├── session.ts   #   finite gaze/rest runner (self-completing)
        │   ├── chime.ts     #   soft Web Audio bells + optional speech/haptics
        │   └── rituals.ts   # ritual definitions (trāṭaka short/standard, …)
        ├── drone/           # the Monochord: astro-tuned ambient drone
        │   ├── drone.ts     #   UI: tuning/root/couplings, transport, log offer
        │   ├── engine.ts    #   Web Audio graph: fades, beating, drift, wake lock
        │   └── tuning.ts    # PURE harmony (planetary tones → partials), unit-tested
        ├── record/record.ts # IndexedDB diary: list/search/calendar/export
        ├── timing/timing.ts # suncalc moon + planetary hours (Chaldean)
        └── ai/hierophant.ts # scope picker + intents → Web Share / Copy egress
```

Each module exposes a single `render(root)` function the router calls; the shell
owns nothing module-specific. The prompt-builder lives apart from its UI so it
stays pure and unit-testable.

### 2. IndexedDB schema (`src/db/schema.ts`)

Database `athanor`, version `1`, two object stores:

- **`entries`** (keyPath `id`) — one `RecordEntry` per session:
  `id`, `timestamp`, `technique`, `durationSec`, `retentions[]` (antara/bahya +
  seconds), `notes`, `state` (depth/arousal/qualities), `tags[]`, optional
  denormalised astrological `context` snapshot, `createdAt`/`updatedAt`.
  Indexes: `by-timestamp`, `by-technique`, and a **multiEntry `by-tag`** index
  so the AI scope picker can filter `dream`/`omen`/`divination` fast.
- **`settings`** (keyPath `id`, single `'app'` row) — manual location fallback,
  cue/speech/haptics toggles + volumes, dismissed one-time hints.

Astrological context is **denormalised onto each entry** so historical readings
stay accurate even if the timing libraries change. Export/import is a single
`RecordExport` JSON `{ app, version, exportedAt, entries[] }`.

### 3. Prompt-builder I/O shape (`src/ai/prompt.ts`)

A pure, deterministic function — no `Date.now()`, no randomness, no network:

```ts
buildPrompt(input: PromptInput): BuiltPrompt
```

**Input**
- `intent`: `'interpret-recent-practice' | 'find-patterns-in-dreams' | 'suggest-tomorrows-working'`
- `entries`: `RecordEntry[]` (already resolved by the scope picker)
- `scope`: `{ kind: 'last-n', n } | { kind: 'date-range', from, to } | { kind: 'tags', tags }`
- `context?`: `AstroContext` (moon phase/illumination/name, planetary-hour ruler,
  day ruler, optional location)
- `includeNotes?`: redaction toggle (drop free-text, keep structured fields)

**Output**
- `title`: share-sheet title
- `text`: the full prompt string (what gets shared/copied)
- `meta`: `{ entryCount, charCount, intent }` for the UI

**Egress** (the UI, not the builder): primary **Web Share API**
(`navigator.share`, feature-detected via `navigator.canShare`) so the user picks
their own agent; **Copy to clipboard** always shown as fallback. No
`claude.ai/new?q=` deep-links. iOS gets a first-run hint that sharing text to
Claude needs a one-time "Ask Claude" Shortcut.

---

## Non-goals (v1)

Direct API calls / stored keys, accounts / sync / cloud, pathworking, scrying,
ceremonial rituals, social features.

> The original v1 non-goal of "ambient/drone soundscapes" has since shipped as
> the **Monochord** module — still synthesised, static, and offline (no hosted
> audio), in keeping with the constraints above.
