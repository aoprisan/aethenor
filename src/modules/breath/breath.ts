import { PATTERNS } from './patterns';
import { page, stub } from '../../lib/ui';

// Breathwork module — STUB. The animated guide, Web Audio cues, Web Speech,
// haptics, wake lock, and iOS silent-switch hint are implemented after the
// architecture is confirmed.
export function renderBreath(root: HTMLElement): void {
  root.append(
    page('Breath', 'The spine of the practice — an eyes-open guide with eyes-closed audio cues.'),
  );
  root.append(
    stub(
      `Planned: animated expanding/contracting guide; patterns (${PATTERNS.map((p) => p.name).join(
        ', ',
      )}, custom kumbhaka); Web Audio tone cues; optional spoken cues; haptics; Screen Wake Lock; one-time iOS silent-switch hint.`,
    ),
  );
}
