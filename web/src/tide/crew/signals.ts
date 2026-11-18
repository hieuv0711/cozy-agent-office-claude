import { loadJSON, saveJSON } from '../../lib/store';

// What the people are doing that the room shows: who is at which place (the
// printer prints while someone waits at it, the lathe spins while someone
// works it), and what has been finished today (notes on the office board,
// parcels on the workshop counter). Mutated by the cast every frame, read by
// the rooms' props in their own frame loops: no React updates involved.

/** Who is at each place right now, and doing what. */
export const placeUse = new Map<string, { act: string; sid: string; color: string; since: number }>();

export interface Finished {
  /** The day (local date) these are for. */
  day: string;
  /** One entry per finished turn: the session's colour. */
  colors: string[];
}

const today = () => new Date().toLocaleDateString('en-CA');

/** Turns finished today, per theme, kept in this browser (a new day starts empty). */
const store = new Map<string, Finished>();

export function finishedFor(theme: string): Finished {
  let f = store.get(theme);
  if (!f || f.day !== today()) {
    const saved = loadJSON<Finished>(`ao-finished:${theme}`, { day: '', colors: [] });
    f = saved.day === today() && Array.isArray(saved.colors) ? saved : { day: today(), colors: [] };
    store.set(theme, f);
  }
  return f;
}

/** Someone finished a turn (a note moved to done, a toy delivered). */
export function addFinished(theme: string, color: string) {
  const f = finishedFor(theme);
  f.colors = [...f.colors, color].slice(-60);
  saveJSON(`ao-finished:${theme}`, f);
}
