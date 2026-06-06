import { page, stub } from '../../lib/ui';

// "Ask the Hierophant" UI — STUB. Wraps the pure prompt-builder
// (src/ai/prompt.ts): scope picker + intent templates → prompt; egress via Web
// Share API (primary, mobile) with Copy fallback (always). No network calls.
// Implemented after prompt-builder shape confirmation.
export function renderHierophant(root: HTMLElement): void {
  root.append(
    page(
      'Hierophant',
      'Bundle your record + current timing into a prompt, then share it to your own AI agent.',
    ),
  );
  root.append(
    stub(
      'Planned: scope picker (last N / date range / dream+omen+divination tags); intent templates; Web Share egress with first-run iOS share hint; always-available Copy fallback.',
    ),
  );
}
