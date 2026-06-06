import type { Route } from '../router';

// Renders the persistent app chrome: the routed outlet + bottom nav.
// Modules render into the outlet; the shell owns nothing module-specific.
export function mountShell(app: HTMLElement, routes: Route[]): HTMLElement {
  app.innerHTML = '';

  const main = document.createElement('main');
  main.className = 'shell__main';

  const nav = document.createElement('nav');
  nav.className = 'shell__nav';
  nav.setAttribute('aria-label', 'Modules');

  for (const route of routes) {
    const a = document.createElement('a');
    a.href = `#${route.path}`;
    a.textContent = route.label;
    a.setAttribute('data-path', route.path);
    nav.appendChild(a);
  }

  app.append(main, nav);
  return main;
}
