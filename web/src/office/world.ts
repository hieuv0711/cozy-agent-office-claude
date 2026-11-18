import { createStore, loadJSON, saveJSON } from '../lib/store';
import type { ThemeId } from '../tide/types';

// The themes: rooms where your sessions are people at work (see tide/crew).
// Each theme can be customised (see tide/).
export type WorldId = ThemeId;


export interface WorldInfo {
  id: WorldId;
  name: string;
  episode: string;
  /** Where the tank is, in a few words. */
  blurb: string;
}

export const WORLDS: Record<WorldId, WorldInfo> = {
  // (the weather sets the hour: a clear night by default, or a sunny day)
  office: { id: 'office', name: 'Loft office', episode: 'Episode 1', blurb: 'A brick loft office over the city' },
  kitchen: { id: 'kitchen', name: 'Kitchen', episode: 'Episode 2', blurb: 'A small ramen kitchen' },
  workshop: { id: 'workshop', name: 'Toy workshop', episode: 'Episode 3', blurb: "A toymaker's workshop" },
};

export const WORLD_ORDER: WorldId[] = ['office', 'kitchen', 'workshop'];

/** Words that depend on who the sessions are in a theme: creatures in a tank, or cooks. */
export interface WorldWords {
  /** The live view's tab. */
  view: string;
  loading: string;
  empty: string;
  /** One session, as seen in the scene. */
  who: string;
  customize: string;
}
export const WORLD_WORDS: Record<WorldId, WorldWords> = {
  office: {
    view: 'Office',
    loading: 'Opening the office…',
    empty: 'No Claude Code session is running. Start one in any terminal and someone comes in to work.',
    who: 'person',
    customize: 'Add, move and remove things around the office',
  },
  kitchen: {
    view: 'Kitchen',
    loading: 'Opening the kitchen…',
    empty: 'No Claude Code session is running. Start one in any terminal and a cook comes in to work.',
    who: 'cook',
    customize: 'Add, move and remove things around the kitchen',
  },
  workshop: {
    view: 'Workshop',
    loading: 'Opening the workshop…',
    empty: 'No Claude Code session is running. Start one in any terminal and a toymaker comes in to work.',
    who: 'toymaker',
    customize: 'Add, move and remove things around the workshop',
  },
};

const saved = loadJSON<{ id?: string }>('ao-world', {});
// `?world=kitchen` opens a theme directly (screenshots, stream overlays). Places
// saved by older versions (desk, greenhouse, ramen, park) fall back to the first theme.
const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('world') : null;
const first = [param, saved.id].find((x): x is WorldId => !!x && x in WORLDS) || 'office';

// card: when the place last changed, so the title card can play once.
// drawn: when the current place last finished drawing its first frames.
// The title card also covers the first opening (it waits until the place has drawn).
export const worldUi = createStore<{ id: WorldId; card: number; drawn: number }>({ id: first, card: Date.now(), drawn: 0 });
worldUi.subscribe(() => saveJSON('ao-world', { id: worldUi.get().id }));

export function setWorld(id: WorldId) {
  if (worldUi.get().id !== id) worldUi.set({ id, card: Date.now() });
}
