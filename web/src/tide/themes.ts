import type { FC } from 'react';
import type { CrewTheme } from './crew/Crew';
import { inZones } from './crew/plan';
import { KITCHEN_THEME } from './kitchen/theme';
import { OFFICE_THEME } from './office/theme';
import { OFFICE_ITEMS, OFFICE_LAYOUT, OfficeRoom } from './rooms/OfficeRoom';
import { RAMEN_ITEMS, RAMEN_LAYOUT, RamenKitchen } from './rooms/RamenKitchen';
import { WORKSHOP_ITEMS, WORKSHOP_LAYOUT, WorkshopRoom } from './rooms/WorkshopRoom';
import type { CatalogItem, Placed, ThemeId } from './types';
import { WORKSHOP_THEME } from './workshop/theme';

// The three themes: the room's fixed shell, its people (crew/), the things
// that can be added to it, and how each one starts out.

export interface ThemeDef {
  id: ThemeId;
  Room: FC;
  /** Things that can be added in this theme. */
  items: CatalogItem[];
  layout: Placed[];
  background: string;
  /** Who works here, and how. */
  crew: CrewTheme;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  office: { id: 'office', Room: OfficeRoom, items: OFFICE_ITEMS, layout: OFFICE_LAYOUT, background: '#100f14', crew: OFFICE_THEME },
  kitchen: { id: 'kitchen', Room: RamenKitchen, items: RAMEN_ITEMS, layout: RAMEN_LAYOUT, background: '#15110e', crew: KITCHEN_THEME },
  workshop: { id: 'workshop', Room: WorkshopRoom, items: WORKSHOP_ITEMS, layout: WORKSHOP_LAYOUT, background: '#140f0c', crew: WORKSHOP_THEME },
};

const catalogs = new Map<ThemeId, Map<string, CatalogItem>>();

/** Every item that can be placed in a theme, by kind. */
export function catalogFor(id: ThemeId): Map<string, CatalogItem> {
  let c = catalogs.get(id);
  if (!c) {
    c = new Map(THEMES[id].items.map((i) => [i.kind, i]));
    catalogs.set(id, c);
  }
  return c;
}

/** Is a spot inside someone's own work area (on a counter, bench or desk) in this theme? */
export const inWorkZone = (id: ThemeId, x: number, z: number, r = 0) => inZones(THEMES[id].crew.plan.stations.map((s) => s.zone), x, z, r);

const defaults = new Map<ThemeId, Placed[]>();

/** A theme's items as it comes, with ids unique within the theme. */
export function defaultLayout(id: ThemeId): Placed[] {
  let d = defaults.get(id);
  if (!d) {
    d = THEMES[id].layout.map((p, i) => ({ ...p, id: `${id}-${i}`, p: [...p.p] as [number, number, number] }));
    defaults.set(id, d);
  }
  return d;
}
