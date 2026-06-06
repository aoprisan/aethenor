# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server (SW disabled in dev — see vite.config.ts devOptions)
npm run build      # tsc --noEmit (typecheck) THEN vite build → dist/
npm run typecheck  # tsc --noEmit only
npm run preview    # serve the production build locally (test PWA/offline behaviour here)
npm test           # vitest run (one-shot)

# Single test file / test:
npx vitest run src/ai/prompt.test.ts
npx vitest run -t "buildPrompt"        # filter by test name
npx vitest                             # watch mode
```

Only two files have tests, and both cover **pure** logic: `src/ai/prompt.ts`
(prompt-builder determinism/shape) and `src/modules/drone/tuning.ts` (harmony
math). Keep these two modules pure (no `Date.now()`, randomness, DOM, or
network) so they stay unit-testable — UI and side effects live in their sibling
files.

## Architecture

Athanor is a **fully static, client-side-only, offline-capable PWA** — no
backend, no API keys, no accounts. Vanilla TypeScript + Vite, no UI framework.
All user data lives in IndexedDB on-device.

### Module contract

`src/main.ts` is the only wiring point: it imports each module's
`renderX(root)` function, registers them as routes, mounts the shell, and starts
the router. Every module under `src/modules/<name>/` exposes a single
`render(root: HTMLElement)` that may return a cleanup function. The router calls
cleanup before swapping routes. The shell (`src/shell/shell.ts`) owns the
persistent chrome (outlet + bottom nav) and **nothing module-specific** — to add
a module, add a folder with a `render` function and one entry in `main.ts`.

The five modules: **breath** (animated guide, Web Audio/Speech cues, haptics,
wake lock), **drone** (the "Monochord" astro-tuned ambient drone), **record**
(the IndexedDB diary), **timing** (suncalc moon + planetary hours), **ai/
hierophant** (prompt scope picker → Web Share / Copy egress).

### Hash routing (`src/router.ts`)

Routes are hash-based (`#/breath`) — **deliberately**, not legacy. A GitHub Pages
*project* site has no server to rewrite deep links, so hash routes keep every URL
a request for the same `index.html` (refresh- and offline-safe with the SW
navigate fallback). Do not switch to path-based routing.

### The base-path contract (read before touching config)

The app deploys to `https://<user>.github.io/aethenor/` — a subdirectory, NOT a
root domain. `BASE = '/aethenor/'` in `vite.config.ts` is the **single source of
truth**, threaded into the manifest (`id`/`start_url`/`scope`), the SW scope and
`navigateFallback`, and asset URLs. Getting any path wrong here is the #1 way the
PWA breaks. If forking to a different repo name, change `BASE` only.

### Data layer (`src/db/`)

`schema.ts` defines the typed `idb` handle (DB `athanor` v1, stores `entries` +
single-row `settings`); `repo.ts` is the only place reads/writes happen — thin
async helpers, no UI or astro logic. Queries pull a timestamp range from the
index then filter tags/technique/text **in memory** (dataset is personal-scale).
Astrological `context` is **denormalised onto each entry** so historical readings
stay accurate even if the timing libraries change later. Export/import is a
single `RecordExport` JSON envelope (`importRecord` validates the `app: 'athanor'`
shape).

### AI layer — bring-your-own-agent

`src/ai/prompt.ts` `buildPrompt(input)` is a pure function producing
`{ title, text, meta }`. **No network calls, no stored keys, no agent
deep-links.** The hierophant module's egress is Web Share API (user picks their
own agent) with a Copy-to-clipboard fallback always present. Keep it that way.

### PWA registration (`src/lib/pwa.ts`)

The service worker is registered **manually** (`injectRegister: null` in the PWA
plugin config) with scope derived from `BASE`. The SW is disabled in `vite dev`
— use `npm run preview` to exercise offline/install behaviour.

### Shared DOM helpers (`src/lib/ui.ts`)

`el()`, `page()`, `card()`, `field()`, `button()`, `toast()`, `clear()` — use
these for DOM construction rather than ad-hoc `createElement`/innerHTML, to keep
modules consistent. CSS is one global `src/app.css` (dark hermetic theme: one
accent, no gradients).

## Deploy

Push to `main`; `.github/workflows/deploy.yml` builds with Vite and deploys
`dist/` to GitHub Pages (Settings → Pages → Source: GitHub Actions).
