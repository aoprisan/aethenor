// Vanitas emblems for the Memento Mori stage — a skull and an hourglass, drawn
// as inline SVG line-engravings in the single gold accent (colour comes from
// CSS via `currentColor`, so they tarnish/brighten with the theme). Pure DOM
// factories, no state. SVG needs the SVG namespace, so these are parsed rather
// than built with the HTML-only el() helper.

const SKULL = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"
     class="vanitas vanitas--skull" fill="none" stroke="currentColor"
     stroke-width="3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
  <path d="M50 5 C 28 5, 13 21, 13 42 C 13 54, 19 62, 27 66
           C 28 72, 27 79, 32 84 C 37 89, 45 90, 50 90
           C 55 90, 63 89, 68 84 C 73 79, 72 72, 73 66
           C 81 62, 87 54, 87 42 C 87 21, 72 5, 50 5 Z"/>
  <ellipse class="vanitas__socket" cx="34" cy="45" rx="12" ry="10"/>
  <ellipse class="vanitas__socket" cx="66" cy="45" rx="12" ry="10"/>
  <path class="vanitas__socket" d="M50 56 C 47 63, 45 66, 45 70
           C 48 72, 52 72, 55 70 C 55 66, 53 63, 50 56 Z"/>
  <path d="M37 79 H63 M42 79 V90 M50 79 V91 M58 79 V90"/>
</svg>`;

const HOURGLASS = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 100"
     class="vanitas vanitas--hourglass" fill="none" stroke="currentColor"
     stroke-width="3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
  <path d="M14 8 H58 M14 92 H58"/>
  <path d="M20 8 V92 M52 8 V92" stroke-opacity="0.45"/>
  <path d="M22 14 L50 14 L36 50 Z"/>
  <path d="M36 50 L50 86 L22 86 Z"/>
  <path class="vanitas__socket" d="M36 64 L48 86 L24 86 Z"/>
  <path d="M36 50 V72" stroke-width="2"/>
</svg>`;

function buildSvg(markup: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(markup.trim(), 'image/svg+xml');
  return document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
}

export function skull(): SVGSVGElement {
  return buildSvg(SKULL);
}

export function hourglass(): SVGSVGElement {
  return buildSvg(HOURGLASS);
}
