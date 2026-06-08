// Memento mori contemplations — data only, safe to land pre-implementation.
// A rotating set of meditations on mortality and the brevity of life, drawn
// from the Stoics and the wider contemplative tradition. The Memento module
// fades one quote into the next across a session; keeping this pure (no
// Date.now / randomness) means the picker below stays deterministic.

export interface Contemplation {
  /** The line to contemplate. */
  text: string;
  /** Who said it (displayed small, beneath the line). */
  source: string;
}

export const CONTEMPLATIONS: Contemplation[] = [
  { text: 'You could leave life right now. Let that determine what you do and say and think.', source: 'Marcus Aurelius' },
  { text: 'It is not death that a man should fear, but he should fear never beginning to live.', source: 'Marcus Aurelius' },
  { text: 'Let us prepare our minds as if we had come to the very end of life. Let us postpone nothing.', source: 'Seneca' },
  { text: 'As is a tale, so is life: not how long it is, but how good it is, is what matters.', source: 'Seneca' },
  { text: 'You act like mortals in all that you fear, and like immortals in all that you desire.', source: 'Seneca' },
  { text: 'No man ever steps in the same river twice, for it is not the same river and he is not the same man.', source: 'Heraclitus' },
  { text: 'Remember that you are mortal — remember that you must die.', source: 'Roman triumph' },
  { text: 'I am ash and dust; from dust I came, and to dust I shall return.', source: 'Ecclesiastes' },
  { text: 'Vanity of vanities; all is vanity. One generation passes, and another comes.', source: 'Ecclesiastes' },
  { text: 'Pale Death knocks with impartial foot at the huts of the poor and the towers of kings.', source: 'Horace' },
  { text: 'Seize the day, trusting as little as possible in tomorrow.', source: 'Horace' },
  { text: 'Death smiles at us all; all a man can do is smile back.', source: 'Marcus Aurelius (attr.)' },
  { text: 'The fear of death follows from the fear of life. A man who lives fully is prepared to die at any time.', source: 'Mark Twain' },
  { text: 'All things are only for a day, both that which remembers and that which is remembered.', source: 'Marcus Aurelius' },
  { text: 'Think of yourself as dead. You have lived your life. Now take what is left and live it properly.', source: 'Marcus Aurelius' },
  { text: 'Begin at once to live, and count each separate day as a separate life.', source: 'Seneca' },
];

/**
 * Choose the contemplation for a moment in the session. Deterministic: the
 * same elapsed/total/seed always yields the same line, and the line advances
 * once per equal slice of the session so each gets roughly fair time. `seed`
 * lets a session rotate through a different ordering without randomness here.
 */
export function contemplationAt(
  elapsedSec: number,
  totalSec: number,
  seed = 0,
  list: Contemplation[] = CONTEMPLATIONS,
): { quote: Contemplation; index: number } {
  if (list.length === 0) throw new Error('No contemplations.');
  const total = Math.max(1, totalSec);
  const clamped = Math.max(0, Math.min(elapsedSec, total));
  // How many lines comfortably fit: roughly one per ~45s, at least 1, capped
  // at the list length so none repeats within a session shorter than the set.
  const slots = Math.max(1, Math.min(list.length, Math.round(total / 45)));
  const slot = Math.min(slots - 1, Math.floor((clamped / total) * slots));
  const index = (slot + seed) % list.length;
  return { quote: list[index], index };
}
