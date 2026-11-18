import { createStore, loadJSON, saveJSON } from '../lib/store';
import { defaultLayout } from './themes';
import type { Placed, ThemeId } from './types';

// Each theme's placed items, saved in this browser. A theme you never changed
// has no saved copy and shows its defaults, so new defaults reach it.

const KEY = 'ao-tide-layouts-v1';
type Saved = Partial<Record<ThemeId, Placed[]>>;
/**
 * A theme whose room was rebuilt keeps its saved layout under a new version:
 * the kitchen became a ramen kitchen (v2), then gained its dining floor (v3),
 * so an older saved kitchen is let go and it starts from its defaults.
 */
const VERSION: Partial<Record<ThemeId, number>> = { kitchen: 3 };
const VERSION_KEY = 'ao-tide-layout-versions';

function valid(list: unknown): list is Placed[] {
  return (
    Array.isArray(list) &&
    list.every((p) => p && typeof p.id === 'string' && typeof p.kind === 'string' && Array.isArray(p.p) && p.p.length === 3 && p.p.every(Number.isFinite) && Number.isFinite(p.r) && Number.isFinite(p.s))
  );
}

function load(): Saved {
  const raw = loadJSON<Saved>(KEY, {});
  const versions = loadJSON<Partial<Record<ThemeId, number>>>(VERSION_KEY, {});
  const out: Saved = {};
  for (const id of ['office', 'kitchen', 'workshop'] as ThemeId[]) if (valid(raw[id]) && (versions[id] ?? 1) === (VERSION[id] ?? 1)) out[id] = raw[id];
  return out;
}

export const layouts = createStore<{ byTheme: Saved }>({ byTheme: load() });

let timer = 0;
layouts.subscribe(() => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    saveJSON(KEY, layouts.get().byTheme);
    saveJSON(VERSION_KEY, VERSION);
  }, 250);
});

export function itemsOf(theme: ThemeId): Placed[] {
  return layouts.get().byTheme[theme] ?? defaultLayout(theme);
}

/** A theme's items, kept up to date. */
export function useItems(theme: ThemeId): Placed[] {
  return layouts.use((s) => s.byTheme[theme]) ?? defaultLayout(theme);
}

/** Has this theme been changed from how it comes? */
export function useCustomised(theme: ThemeId): boolean {
  return layouts.use((s) => !!s.byTheme[theme]);
}

function write(theme: ThemeId, items: Placed[]) {
  layouts.set((s) => ({ byTheme: { ...s.byTheme, [theme]: items } }));
}

export function newId() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export const layoutActions = {
  add(theme: ThemeId, item: Placed) {
    write(theme, [...itemsOf(theme), item]);
  },
  update(theme: ThemeId, id: string, patch: Partial<Placed>) {
    write(
      theme,
      itemsOf(theme).map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  },
  remove(theme: ThemeId, id: string) {
    write(
      theme,
      itemsOf(theme).filter((it) => it.id !== id),
    );
  },
  reset(theme: ThemeId) {
    layouts.set((s) => {
      const next = { ...s.byTheme };
      delete next[theme];
      return { byTheme: next };
    });
  },
};
