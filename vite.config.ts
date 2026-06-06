import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Athanor is deployed to a GitHub Pages *project* page, served from
// https://<user>.github.io/aethenor/ — NOT a root domain. Every path
// (Vite base, manifest start_url/scope, SW scope, asset URLs) must respect
// this subdirectory or the PWA breaks. This is the single most important
// config in the project.
const BASE = '/aethenor/';

export default defineConfig({
  base: BASE,
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // we register manually in src/lib/pwa.ts
      // Scope/start_url are resolved against `base` by the plugin, but we set
      // them explicitly to make the subdirectory contract unmistakable.
      scope: BASE,
      includeAssets: [
        'favicon.svg',
        'icon.svg',
        'icon-maskable.svg',
        'icon-192.png',
        'icon-512.png',
        'icon-512-maskable.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Athanor',
        short_name: 'Athanor',
        description:
          'A hermetic daily-practice tool: breathwork, a magical record, and planetary timing.',
        lang: 'en',
        dir: 'ltr',
        id: BASE,
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0c0a09',
        theme_color: '#0c0a09',
        categories: ['lifestyle', 'health', 'education'],
        // Raster PNGs for broad install support (iOS/older Android), plus the
        // scalable gilded SVGs for crisp rendering everywhere they're honoured.
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App is fully static + offline-first. Precache the build output and
        // navigate-fallback to index so deep links work offline within scope.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: {
        // Enable the SW in `vite dev` so PWA behaviour is testable locally.
        enabled: false,
        type: 'module',
      },
    }),
  ],
});
