// Tiny DOM helpers shared by the (currently stubbed) modules. Vanilla, no deps.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(c);
  return node;
}

/** Standard page header: title + lede. */
export function page(title: string, lede: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  frag.append(el('h1', {}, title), el('p', { className: 'page__lede' }, lede));
  return frag;
}

/** Dashed placeholder box marking deferred functionality. */
export function stub(text: string): HTMLElement {
  return el('div', { className: 'stub' }, text);
}
