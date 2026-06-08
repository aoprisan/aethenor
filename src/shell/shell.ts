import type { Route } from '../router';

// Renders the persistent app chrome: the routed outlet + bottom nav.
// Modules render into the outlet; the shell owns nothing module-specific.
//
// Routes sharing a `group` collapse into a single bottom-nav button that opens
// a small pop-up menu of its members — so eight modules cost three buttons of
// horizontal space instead of eight. Ungrouped routes render as plain links.
export function mountShell(app: HTMLElement, routes: Route[]): HTMLElement {
  app.innerHTML = '';

  const main = document.createElement('main');
  main.className = 'shell__main';

  const nav = document.createElement('nav');
  nav.className = 'shell__nav';
  nav.setAttribute('aria-label', 'Modules');

  // Bucket routes by group, preserving first-seen order.
  const groups = new Map<string, Route[]>();
  for (const route of routes) {
    const key = route.group ?? `\0${route.path}`; // ungrouped → unique key
    const list = groups.get(key) ?? [];
    list.push(route);
    groups.set(key, list);
  }

  for (const [key, members] of groups) {
    if (!members[0].group) nav.appendChild(navLink(members[0]));
    else nav.appendChild(navGroup(key, members));
  }

  app.append(main, nav);

  // Dismiss any open menu on outside click or Escape.
  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenus();
  });
  // Keep the group buttons in sync with the active route.
  window.addEventListener('hashchange', () => {
    closeMenus();
    markActiveGroup();
  });
  markActiveGroup();

  return main;
}

function navLink(route: Route): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = `#${route.path}`;
  a.textContent = route.label;
  a.setAttribute('data-path', route.path);
  return a;
}

function navGroup(name: string, members: Route[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'shell__group';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'shell__group-btn';
  btn.textContent = name;
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'shell__menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  for (const route of members) {
    const a = navLink(route);
    a.setAttribute('role', 'menuitem');
    a.addEventListener('click', () => closeMenus());
    menu.appendChild(a);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = btn.getAttribute('aria-expanded') === 'true';
    closeMenus();
    if (!open) {
      btn.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
    }
  });

  wrap.append(btn, menu);
  return wrap;
}

function closeMenus(): void {
  document.querySelectorAll<HTMLButtonElement>('.shell__group-btn[aria-expanded="true"]').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
    const menu = btn.nextElementSibling as HTMLElement | null;
    if (menu) menu.hidden = true;
  });
}

// Mark the group button whose member matches the current hash, so the active
// module is discoverable without opening the menu. Derived from the hash
// directly (not aria-current) to avoid ordering races with the router.
function markActiveGroup(): void {
  const path = location.hash.replace(/^#/, '');
  document.querySelectorAll('.shell__group').forEach((g) => {
    const active = path !== '' && !!g.querySelector(`a[data-path="${CSS.escape(path)}"]`);
    g.querySelector('.shell__group-btn')?.toggleAttribute('data-active', active);
  });
}
