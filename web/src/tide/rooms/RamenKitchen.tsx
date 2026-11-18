import type { CatalogItem, Placed } from '../types';
import { BackLine } from './ramen-backline';
import { FrontCounter } from './ramen-counter';
import { DiningTables } from './ramen-dining';
import { LEDGE, ROOM, SHELVES, WIN_BACK } from './ramen-dims';
import { BarStool, BowlStackItem, CondimentTray, FloorLantern, LuckyCat, MenuPlaques, NorenHanging, Pothos, Radio, RamenPrint, RiceSack, SakeSet, SchoolClock, VegCrate, WallLantern } from './ramen-items';
import { CeilingFan, PendantLights, Pendants, RamenLights } from './ramen-lights';
import { Doorway, HeaderLanterns, Valance, Windows } from './ramen-openings';
import { BelowCeiling, Ceiling, Floors, shellMats, Walls } from './ramen-shell';
import { StaffCorner } from './ramen-staff';

// The Ramen kitchen theme: a cozy late-night ramen shop, seen from the
// customers' side of the counter. The sessions are the cooks (drawn by
// ../kitchen); this is the room around them: the front counter with its
// ledge, bar stools and the pass, the back line with the broth pots, shelves
// and hood, the staff table in the corner, the doorway, the two windows onto
// the night street (with the weather), and one fixed set of lights.

export function RamenKitchen() {
  const m = shellMats();
  return (
    <group>
      <Walls m={m} />
      <Floors m={m} />
      <Ceiling m={m}>
        <CeilingFan />
      </Ceiling>
      <Windows />
      <Doorway />
      {/* what hangs from the ceiling stays out of the top shot (the lights stay on) */}
      <BelowCeiling>
        <Valance />
        <HeaderLanterns />
        <Pendants />
      </BelowCeiling>
      <FrontCounter />
      <BackLine />
      <StaffCorner />
      <DiningTables />
      <PendantLights />
      <RamenLights />
    </group>
  );
}

/** Things that can be added to the ramen kitchen (kinds are prefixed r-). */
export const RAMEN_ITEMS: CatalogItem[] = [
  { kind: 'r-lantern', label: 'Paper lantern', group: 'Lighting', surfaces: ['wall'], radius: 0.65, height: 1.4, Render: WallLantern },
  { kind: 'r-andon', label: 'Floor lantern', group: 'Lighting', surfaces: ['floor', 'top'], radius: 0.38, height: 1.45, Render: FloorLantern },
  { kind: 'r-noren', label: 'Noren curtain', group: 'Wall', surfaces: ['wall'], radius: 1.0, height: 1.5, Render: NorenHanging },
  { kind: 'r-plaques', label: 'Menu plaques', group: 'Wall', surfaces: ['wall'], radius: 1.15, height: 0.95, Render: MenuPlaques },
  { kind: 'r-clock', label: 'Wall clock', group: 'Wall', surfaces: ['wall'], radius: 0.5, height: 1.4, Render: SchoolClock },
  { kind: 'r-print', label: 'Framed print', group: 'Wall', surfaces: ['wall'], radius: 0.55, height: 1.4, Render: RamenPrint },
  { kind: 'r-sake', label: 'Sake bottles', group: 'Pantry', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 0.3, height: 0.62, Render: SakeSet },
  { kind: 'r-condiments', label: 'Condiment tray', group: 'Pantry', surfaces: ['top', 'shelf'], radius: 0.25, height: 0.2, Render: CondimentTray },
  { kind: 'r-bowls', label: 'Stack of bowls', group: 'Pantry', surfaces: ['top', 'shelf'], radius: 0.22, height: 0.36, Render: BowlStackItem },
  { kind: 'r-rice', label: 'Rice sacks', group: 'Pantry', surfaces: ['floor'], radius: 0.45, height: 0.8, Render: RiceSack },
  { kind: 'r-veg-crate', label: 'Vegetable crate', group: 'Pantry', surfaces: ['floor', 'top'], radius: 0.5, height: 0.48, Render: VegCrate },
  { kind: 'r-stool', label: 'Bar stool', group: 'Furniture', surfaces: ['floor'], radius: 0.31, height: 0.84, Render: BarStool },
  { kind: 'r-lucky-cat', label: 'Lucky cat', group: 'Decor', surfaces: ['top', 'shelf', 'sill'], radius: 0.16, height: 0.45, Render: LuckyCat },
  { kind: 'r-radio', label: 'Radio', group: 'Decor', surfaces: ['top', 'shelf'], radius: 0.25, height: 0.45, Render: Radio },
  { kind: 'r-plant', label: 'Pothos', group: 'Plants', surfaces: ['floor', 'top', 'shelf', 'sill'], radius: 0.3, height: 0.5, Render: Pothos },
];

const ON_BACK = ROOM.back + 0.01;
const SHELF_Z = ROOM.back + SHELVES.depth / 2 + 0.02;
const at = (id: string, kind: string, p: [number, number, number], r = 0, seed = 1, s = 1): Placed => ({ id, kind, p, r, s, seed });

/** Where they start out: all in the wide shot, clear of the cooks' stations and walkways and of the dining floor's lanes. */
export const RAMEN_LAYOUT: Placed[] = [
  // on the walls: menu plaques over the back window, a clock over the doorway, a print and a lantern beside it,
  // a lantern on the left wall and a noren on the right
  at('r1', 'r-plaques', [-10.1, 6.38, ON_BACK], 0, 1),
  at('r2', 'r-clock', [9.9, 5.55, ON_BACK], 0, 1),
  at('r3', 'r-print', [11.78, 3.5, ON_BACK], 0, 1),
  at('r4', 'r-lantern', [8.45, 4.05, ON_BACK], 0, 0),
  at('r5', 'r-lantern', [ROOM.x0 + 0.01, 4.4, -0.9], Math.PI / 2, 1),
  at('r6', 'r-noren', [ROOM.x1 - 0.01, 4.95, -3.7], -Math.PI / 2, 2),
  // on the customers' ledge: condiment trays between the stools, a lucky cat at the end
  at('r7', 'r-condiments', [-4.8, LEDGE.top, 0.74], 0, 1),
  at('r8', 'r-condiments', [0, LEDGE.top, 0.74], 0, 2),
  at('r9', 'r-lucky-cat', [-7.15, LEDGE.top, 0.76], 0.35, 0),
  // on the back shelves, and the back window's sill (beside the sleeping cat)
  at('r10', 'r-radio', [2.45, SHELVES.y[1], SHELF_Z], 0, 0),
  at('r11', 'r-bowls', [1.6, SHELVES.y[0], SHELF_Z], 0, 3),
  at('r12', 'r-sake', [-9.55, WIN_BACK.y0, ROOM.back + 0.02], 0.2, 1),
  at('r13', 'r-plant', [-8.85, WIN_BACK.y0, ROOM.back + 0.05], 0, 1),
  // the floor lantern by the left wall where the kitchen opens to the dining room; the crate and rice sacks
  // just inside the back door (deliveries), clear of the doorway, the aisle and the dining floor
  at('r14', 'r-andon', [-11.7, 0, -0.45], 0.4, 0),
  at('r15', 'r-veg-crate', [11.98, 0, -5.62], Math.PI / 2 + 0.08, 0),
  at('r16', 'r-rice', [11.3, 0, -5.82], -0.3, 0),
];

