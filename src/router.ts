// Hash-based router.
//
// Why hash routing: on a GitHub Pages *project* site there is no server to
// rewrite deep links to index.html, so path-based routing 404s on refresh.
// Hash routing (`#/breath`) keeps every route a request for the same
// index.html, which also plays nicely with the SW navigateFallback. Simple,
// static-host-safe, and base-path agnostic.

export type Route = {
  path: string; // e.g. "/breath"
  label: string; // nav label
  group?: string; // bottom-nav grouping; routes sharing a group collapse into one menu
  render: (root: HTMLElement) => void | (() => void); // returns optional cleanup
};

let routes: Route[] = [];
let fallback = '/breath';
let cleanup: (() => void) | void;
let outlet: HTMLElement | null = null;

function current(): string {
  const h = location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : fallback;
}

function resolve(path: string): Route {
  return routes.find((r) => r.path === path) ?? routes[0];
}

function handle(): void {
  if (!outlet) return;
  if (typeof cleanup === 'function') cleanup();
  const route = resolve(current());
  outlet.innerHTML = '';
  cleanup = route.render(outlet);
  document.querySelectorAll('.shell__nav a').forEach((a) => {
    const el = a as HTMLAnchorElement;
    const isCurrent = el.getAttribute('data-path') === route.path;
    if (isCurrent) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  outlet.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

export function startRouter(config: {
  outlet: HTMLElement;
  routes: Route[];
  fallback?: string;
}): void {
  outlet = config.outlet;
  routes = config.routes;
  if (config.fallback) fallback = config.fallback;
  window.addEventListener('hashchange', handle);
  if (!location.hash) location.hash = `#${fallback}`;
  handle();
}

