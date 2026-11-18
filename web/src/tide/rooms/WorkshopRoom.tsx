import type { CatalogItem, Placed } from '../types';
import { BENCH, COUNTER, ROOM, WIN_BACK, WIN_SIDE } from './workshop-dims';
import { CuckooClockItem, DrawingItem, KiteItem, LanternItem, OffcutsItem, PlaneItem, PlantItem, RobotItem, RockingHorseItem, SawhorseItem, TeddyItem, ToolChestItem, TopsItem, TrainItem } from './workshop-items';
import { FrontBenches } from './workshop-bench';
import { ShopCounter } from './workshop-counter';
import { WarmCorner } from './workshop-corner';
import { LumberRack } from './workshop-lumber';
import { Doorway, Windows } from './workshop-openings';
import { ToolWall } from './workshop-toolwall';
import { HangingLamps, WorkshopLights } from './workshop-lights';
import { Ceiling, Floors, shellMats, Walls } from './workshop-shell';

// The toy workshop theme: a toymaker's workshop late at night, seen from the
// shop floor. The sessions are the toymakers (drawn by the cast, ../workshop);
// this is the room around them, built to ../workshop/plan.ts: three solid
// workbenches end to end with vises and a lower shelf, the tool bench along
// the back with its lathe, paint table and drill press under three shadow-board
// pegboards and shelves of finished toys, the shop counter with its bell, till
// and two lamps (lit by the cast when someone waits), the stove corner with
// cocoa and four seats, the timber rack, the door onto the storeroom, two
// windows onto the village (with the weather), and one fixed set of lights.

export function WorkshopRoom() {
  const m = shellMats();
  return (
    <group>
      <Walls m={m} />
      <Floors m={m} />
      <Ceiling m={m}>
        <HangingLamps />
      </Ceiling>
      <Windows />
      <Doorway />
      <FrontBenches />
      <ToolWall />
      <ShopCounter />
      <WarmCorner />
      <LumberRack />
      <WorkshopLights />
    </group>
  );
}

export { WAIT_BULBS } from './workshop-counter';
/** Where the brass bell stands on the counter (its base's centre, on the counter top): the makers ring it when they need you. */
export { BELL } from './workshop-dims';

/** Things that can be added to the toy workshop (kinds are prefixed w-). */
export const WORKSHOP_ITEMS: CatalogItem[] = [
  { kind: 'w-rocking-horse', label: 'Rocking horse', group: 'Toys', surfaces: ['floor', 'top'], radius: 0.8, height: 1.25, Render: RockingHorseItem },
  { kind: 'w-train', label: 'Toy train', group: 'Toys', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 0.45, height: 0.32, Render: TrainItem },
  { kind: 'w-robot', label: 'Wooden robot', group: 'Toys', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 0.22, height: 0.7, Render: RobotItem },
  { kind: 'w-teddy', label: 'Teddy bear', group: 'Toys', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 0.25, height: 0.58, Render: TeddyItem },
  { kind: 'w-tops', label: 'Spinning tops', group: 'Toys', surfaces: ['top', 'shelf', 'sill'], radius: 0.25, height: 0.26, Render: TopsItem },
  { kind: 'w-plane', label: 'Toy biplane', group: 'Toys', surfaces: ['top', 'shelf', 'sill'], radius: 0.4, height: 0.7, Render: PlaneItem },
  { kind: 'w-kite', label: 'Kite', group: 'Wall', surfaces: ['wall'], radius: 0.6, height: 1.9, Render: KiteItem },
  { kind: 'w-cuckoo', label: 'Cuckoo clock', group: 'Wall', surfaces: ['wall'], radius: 0.35, height: 2.0, Render: CuckooClockItem },
  { kind: 'w-drawing', label: 'Toy design drawing', group: 'Wall', surfaces: ['wall'], radius: 0.55, height: 0.8, Render: DrawingItem },
  { kind: 'w-sawhorse', label: 'Sawhorse', group: 'Workshop', surfaces: ['floor'], radius: 0.65, height: 0.85, Render: SawhorseItem },
  { kind: 'w-toolchest', label: 'Tool chest', group: 'Workshop', surfaces: ['floor', 'top'], radius: 0.55, height: 0.78, Render: ToolChestItem },
  { kind: 'w-offcuts', label: 'Crate of offcuts', group: 'Workshop', surfaces: ['floor', 'top'], radius: 0.4, height: 0.48, Render: OffcutsItem },
  { kind: 'w-plant', label: 'Potted plant', group: 'Plants', surfaces: ['floor', 'top', 'shelf', 'sill'], radius: 0.25, height: 0.65, Render: PlantItem },
  { kind: 'w-lantern', label: 'Hurricane lantern', group: 'Lighting', surfaces: ['top', 'shelf', 'sill', 'floor'], radius: 0.16, height: 0.68, Render: LanternItem },
];

const ON_BACK = ROOM.back + 0.01;
const ON_LEFT = ROOM.x0 + 0.01;
const ON_RIGHT = ROOM.x1 - 0.01;
const at = (id: string, kind: string, p: [number, number, number], r = 0, seed = 1, s = 1): Placed => ({ id, kind, p, r, s, seed });

/** Where they start out: all in the wide shot, clear of the makers' stations and the walkways. */
export const WORKSHOP_LAYOUT: Placed[] = [
  // on the walls: the cuckoo clock over the door, a design drawing beside it, a kite over the gift shelves
  at('w1', 'w-cuckoo', [9.9, 6.1, ON_BACK], 0, 0),
  at('w2', 'w-drawing', [11.75, 4.85, ON_BACK], 0, 0),
  at('w3', 'w-kite', [ON_RIGHT, 6.3, -2.9], -Math.PI / 2, 0),
  // on the back window's sill: a jade plant and a biplane; on the side window's sill (with the cat): a geranium and a robot
  at('w4', 'w-plant', [-9.2, WIN_BACK.y0, ROOM.back + 0.06], 0, 0, 0.9),
  at('w5', 'w-plane', [-10.7, WIN_BACK.y0, ROOM.back + 0.08], 0.25, 1),
  at('w6', 'w-plant', [ON_LEFT + 0.08, WIN_SIDE.y0, WIN_SIDE.z1 - 0.45], Math.PI / 2, 1, 0.9),
  at('w7', 'w-robot', [ON_LEFT + 0.08, WIN_SIDE.y0, WIN_SIDE.z1 - 1.25], Math.PI / 2 - 0.3, 1),
  // on the counter, waiting to be collected: a teddy; on the bench's front edge between two stations: spinning tops
  at('w8', 'w-teddy', [COUNTER.x0 + 0.2, COUNTER.top, 0.22], -0.25, 0),
  at('w9', 'w-tops', [-2.41, BENCH.top, 0.0], 0.2, 1),
  // on the shop floor: the rocking horse by the counter, a sawhorse and the tool chest by the timber rack, a crate of offcuts, a train
  at('w10', 'w-rocking-horse', [9.7, 0, 1.75], -0.25, 0),
  at('w11', 'w-sawhorse', [-8.4, 0, 0.75], 0.25, 1),
  at('w12', 'w-toolchest', [-10.55, 0, -0.85], 0.35, 0),
  at('w13', 'w-offcuts', [7.0, 0, 1.05], -0.3, 0),
  at('w14', 'w-train', [3.2, 0, 2.6], 0.15, 1),
];
