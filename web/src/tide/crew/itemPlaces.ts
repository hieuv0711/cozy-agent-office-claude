import { createStore } from '../../lib/store';
import type { CatalogItem, Placed } from '../types';
import type { CrewTheme } from './Crew';
import type { Place, V2 } from './plan';
import type { WalkMap } from './walkmap';

// The things you add to a room are used. Each kind of item can say what people
// do with it: on a break, the idle ones wander over (a coffee from the machine,
// a cup of water at the cooler, a look along the bookshelf, a plant tended, the
// radio tuned, a toy wound up); during a long stretch of one kind of work, the
// workers go to the one that fits (the bookshelf while reading, the sawhorse
// while editing); and a stool is one more seat. Each placed item becomes a
// place in the room with a spot to stand at, found on the room's walk map
// (crew/walkmap.ts) together with a way there from the aisle; an item nobody
// can get to is simply not used.
//
// The editor keeps the walkways clear: furniture doesn't go where people walk.

export interface ItemUse {
  /** What they do there (an act of the theme's kit, or one every theme has). */
  act: string;
  /** On a break. */
  idle?: boolean;
  /** During a long stretch of these kinds of work ('think' is thinking, between tools). */
  work?: string[];
  /** Sat on: the seat's height as a share of the item's height. */
  sit?: number;
  /** How far from its edge they stand (world units), default 0.5. */
  gap?: number;
}

export const ITEM_USES: Record<string, ItemUse> = {
  // the night office
  'o-water-cooler': { act: 'drink', idle: true },
  'o-coffee': { act: 'coffee', idle: true },
  'o-bookshelf': { act: 'browse', idle: true, work: ['read', 'web'] },
  'o-monstera': { act: 'tend', idle: true },
  'o-snake-plant': { act: 'tend', idle: true },
  'o-pothos': { act: 'tend', idle: true },
  'o-whiteboard': { act: 'sketch', work: ['plan', 'think'] },
  'o-corkboard': { act: 'look', idle: true },
  'o-art': { act: 'look', idle: true },
  'o-globe': { act: 'pat', idle: true },
  // the ramen kitchen
  'r-stool': { act: 'sit', sit: 0.92 },
  'r-radio': { act: 'tune', idle: true },
  'r-lucky-cat': { act: 'pat', idle: true },
  'r-plant': { act: 'tend', idle: true },
  'r-rice': { act: 'fetch', work: ['run'] },
  'r-veg-crate': { act: 'fetch', work: ['edit'] },
  'r-print': { act: 'look', idle: true },
  'r-plaques': { act: 'look', idle: true },
  // the toy workshop
  'w-rocking-horse': { act: 'rock', idle: true },
  'w-train': { act: 'wind', idle: true },
  'w-robot': { act: 'wind', idle: true },
  'w-tops': { act: 'wind', idle: true },
  'w-plane': { act: 'wind', idle: true },
  'w-teddy': { act: 'pat', idle: true },
  'w-sawhorse': { act: 'saw', work: ['edit'] },
  'w-toolchest': { act: 'rummage', work: ['run'] },
  'w-offcuts': { act: 'fetch', work: ['edit'] },
  'w-drawing': { act: 'blueprint', idle: true, work: ['read', 'plan'] },
  'w-plant': { act: 'tend', idle: true },
  'w-kite': { act: 'look', idle: true },
  'w-cuckoo': { act: 'look', idle: true },
};

/** A placed item, as a place in the room. */
export interface ItemPlace extends Place {
  /** The placed item's id and kind. */
  item: string;
  kind: string;
  idle: boolean;
  work: string[];
  /** Sat on (a stool): one more seat for the idle. */
  seat: boolean;
}

/** The item places of the theme that's open, worked out from its walk map (TideWorld's ItemPlaces). */
export const itemPlacesUi = createStore<{ theme: string | null; list: ItemPlace[] }>({ theme: null, list: [] });

// ---------- the walkways ----------

/** Every way people walk in a theme, as lines: the aisle, and the way in to every spot, seat, place and the door. */
export function walkways(crew: CrewTheme): V2[][] {
  const { plan } = crew;
  const A = plan.aisleZ;
  const out: V2[][] = [
    [
      [plan.aisleX[0], A],
      [plan.aisleX[1], A],
    ],
  ];
  for (const st of plan.stations)
    out.push([
      [st.x, A],
      [st.x, st.z],
    ]);
  for (const q of plan.seats) out.push([[plan.cornerX, A], ...(q.via ?? []), [q.x, q.z]]);
  for (const p of [...(crew.places ?? []), ...(crew.helperSpots ?? [])]) out.push([[p.aisleX ?? p.x, A], ...(p.via ?? []), [p.x, p.z]]);
  for (const [x, z] of plan.waitSpots)
    out.push([
      [x, A],
      [x, z],
    ]);
  out.push([[plan.door.x, A], plan.door.inside, plan.door.outside]);
  out.push(...(crew.walkways ?? []));
  return out;
}

function segDist(px: number, pz: number, a: V2, b: V2) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L)) : 0;
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}

const cache = new WeakMap<CrewTheme, V2[][]>();

/** Would something this wide standing at (x, z) be in people's way? (Half a person each side of every walkway.) */
export function onWalkway(crew: CrewTheme, x: number, z: number, radius: number) {
  let lines = cache.get(crew);
  if (!lines) cache.set(crew, (lines = walkways(crew)));
  const clear = radius + 0.45;
  return lines.some((l) => l.some((p, i) => i > 0 && segDist(x, z, l[i - 1], p) < clear));
}

// ---------- item places ----------

/** The spots around an item to try, nearest first: in front of it, then its sides, then behind. */
function spotsAround(it: Placed, def: CatalogItem, use: ItemUse): V2[] {
  const wall = def.surfaces.every((s) => s === 'wall');
  const reach = def.radius * it.s;
  const gap = use.gap ?? 0.5;
  const out: V2[] = [];
  if (wall) {
    for (const d of [0.95, 1.3, 1.7]) out.push([it.p[0] + Math.sin(it.r) * d, it.p[2] + Math.cos(it.r) * d]);
    return out;
  }
  // something on a counter or a shelf stands back from its edge: further out too
  const raised = it.p[1] > 0.2;
  const dists = raised ? [reach + gap, reach + gap + 0.45, reach + gap + 0.9, reach + gap + 1.4] : [reach + gap, reach + gap + 0.4];
  for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI])
    for (const d of dists) {
      const a = it.r + turn;
      out.push([it.p[0] + Math.sin(a) * d, it.p[2] + Math.cos(a) * d]);
    }
  return out;
}

/** Every placed item that people can use, with a spot to use it from and a way there from the aisle. */
export function computeItemPlaces(crew: CrewTheme, items: Placed[], catalog: Map<string, CatalogItem>, map: WalkMap): ItemPlace[] {
  const { plan } = crew;
  const out: ItemPlace[] = [];
  // nobody uses a thing standing on someone else's spot (a work spot, a seat, the theme's own places)
  const taken: V2[] = [
    ...plan.stations.map((st): V2 => [st.x, st.z]),
    ...plan.seats.map((q): V2 => [q.x, q.z]),
    ...[...(crew.places ?? []), ...(crew.helperSpots ?? [])].map((p): V2 => [p.x, p.z]),
    ...plan.waitSpots,
    plan.door.inside,
  ];
  for (const it of [...items].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const use = ITEM_USES[it.kind];
    const def = catalog.get(it.kind);
    if (!use || !def) continue;
    const ok = (x: number, z: number) => x > plan.room.x0 && x < plan.room.x1 && z > plan.room.z0 && z < plan.room.z1 && !taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 0.9);
    // the way in starts on the aisle, level with the spot
    const enter = (x: number): V2 | null => map.nearestFree(Math.max(plan.aisleX[0], Math.min(plan.aisleX[1], x)), plan.aisleZ, 1.2);
    let found: { spot: V2; way: V2[]; from: V2; stand: V2 } | null = null;
    if (use.sit) {
      // sat on: walk up beside it, then onto it
      const stand = map.nearestFree(it.p[0], it.p[2], def.radius * it.s + 1.0);
      const from = stand && enter(stand[0]);
      const way = stand && from && map.path(from, stand);
      if (stand && from && way && ok(it.p[0], it.p[2])) found = { spot: [it.p[0], it.p[2]], way, from, stand };
    } else {
      for (const [x, z] of spotsAround(it, def, use)) {
        if (!ok(x, z) || !map.free(x, z)) continue;
        const from = enter(x);
        const way = from && map.path(from, [x, z]);
        if (from && way) {
          found = { spot: [x, z], way, from, stand: [x, z] };
          break;
        }
      }
    }
    if (!found) continue;
    const { spot, way, from, stand } = found;
    taken.push(spot);
    // face the item (sat on: face the way they came in, away from the aisle)
    const yaw = use.sit ? Math.atan2(spot[0] - stand[0], spot[1] - stand[1]) : Math.atan2(it.p[0] - spot[0], it.p[2] - spot[1]);
    const via: V2[] = [];
    if (Math.abs(from[1] - plan.aisleZ) > 0.05) via.push(from);
    via.push(...way.slice(0, use.sit ? way.length : -1));
    out.push({
      id: `item:${it.id}`,
      item: it.id,
      kind: it.kind,
      x: spot[0],
      z: spot[1],
      yaw,
      act: use.sit ? 'sit' : use.act,
      sitAt: use.sit ? def.height * it.s * use.sit : undefined,
      aisleX: from[0],
      via,
      idle: !!use.idle,
      work: use.work ?? [],
      seat: !!use.sit,
    });
  }
  return out;
}
