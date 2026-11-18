import { createStore, saveJSON } from '../../lib/store';

// How the people are drawn: little robots whose screen faces show what they're
// doing, or cel-shaded people with an ink outline. One setting for every
// theme, saved in this browser; `?people=toon` in the address overrides it for
// one visit (screenshots) without saving. A choice that's gone (the old
// "classic" people) falls back to the bots.

export type PeopleStyle = 'bots' | 'toon';

export const PEOPLE_STYLES: PeopleStyle[] = ['bots', 'toon'];

export const PEOPLE_LABEL: Record<PeopleStyle, string> = {
  bots: 'Little bots',
  toon: 'Ink toon',
};

const KEY = 'ao-people-style';

const isStyle = (x: unknown): x is PeopleStyle => typeof x === 'string' && (PEOPLE_STYLES as string[]).includes(x);

function initial(): PeopleStyle {
  if (typeof location !== 'undefined') {
    const p = new URLSearchParams(location.search).get('people');
    if (isStyle(p)) return p;
  }
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    const s = typeof v === 'string' ? v : (v as { style?: unknown } | null)?.style;
    if (isStyle(s)) return s;
  } catch {
    // storage blocked or unreadable: the default
  }
  return 'bots';
}

export const peopleUi = createStore<{ style: PeopleStyle }>({ style: initial() });

/** Chosen in the top bar: saved for next time. */
export function setPeopleStyle(style: PeopleStyle) {
  if (!isStyle(style) || peopleUi.get().style === style) return;
  peopleUi.set({ style });
  saveJSON(KEY, { style });
}
