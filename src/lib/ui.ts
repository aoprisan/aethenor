// Tiny DOM helpers shared by the modules. Vanilla, no deps.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string; dataset?: Record<string, string> } = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const { dataset, ...rest } = props;
  const node = document.createElement(tag);
  Object.assign(node, rest);
  if (dataset) for (const [k, v] of Object.entries(dataset)) node.dataset[k] = v;
  for (const c of children) if (c != null) node.append(c);
  return node;
}

/** Standard page header: title + lede + a gilded divider. */
export function page(title: string, lede: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  frag.append(
    el('h1', {}, title),
    el('p', { className: 'page__lede' }, lede),
    el('div', { className: 'rule' }),
  );
  return frag;
}

/** Dashed placeholder box marking deferred functionality. */
export function stub(text: string): HTMLElement {
  return el('div', { className: 'stub' }, text);
}

export function button(
  label: string,
  onClick: () => void,
  opts: { primary?: boolean; className?: string } = {},
): HTMLButtonElement {
  const b = el('button', {
    className: [opts.primary ? 'primary' : '', opts.className ?? ''].join(' ').trim(),
    type: 'button',
  });
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

/** Labelled field wrapper. */
export function field(label: string, control: HTMLElement): HTMLElement {
  return el('label', { className: 'field' }, el('span', { className: 'field__label' }, label), control);
}

/** A bordered card section. */
export function card(...children: (Node | string | null | undefined)[]): HTMLElement {
  return el('section', { className: 'card' }, ...children);
}

/** Transient toast at the bottom of the screen. */
export function toast(message: string): void {
  const t = el('div', { className: 'toast' }, message);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('toast--in'));
  setTimeout(() => {
    t.classList.remove('toast--in');
    setTimeout(() => t.remove(), 300);
  }, 2400);
}

export function clear(node: HTMLElement): void {
  node.innerHTML = '';
}
