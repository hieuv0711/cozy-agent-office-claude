import { BACK_BENCH, BENCH, COUNTER, DOOR, ROOM, SEATS, STOVE, TABLE, WAIT_LAMPS, WINDOWS } from '../workshop/plan';

// Measurements of the toy workshop's fixed shell that only the room uses (the
// shared floor plan, with the makers' stations, is ../workshop/plan.ts).

/** The ceiling's underside. */
export const CEIL = 8.2;
/** How far the shop floor, ceiling and side walls run toward the camera. */
export const NEAR_Z = 26;
/** Painted boards up to here on the walls, limewash above. */
export const WAINSCOT_Y = 1.3;

/** Timber posts standing in the back wall (x), and in the side walls (z). */
export const BACK_POSTS = [-7.95, 7.95];
export const SIDE_POSTS = [-1.45, 2.7];
export const POST_W = 0.3;
/** The top plate: the beam all round the walls, under the ceiling. */
export const PLATE_H = 0.5;

/** The window openings, as boxes in their walls. */
export const WIN_BACK = { x0: WINDOWS[0].c[0] - WINDOWS[0].w / 2, x1: WINDOWS[0].c[0] + WINDOWS[0].w / 2, y0: WINDOWS[0].c[1] - WINDOWS[0].h / 2, y1: WINDOWS[0].c[1] + WINDOWS[0].h / 2 };
export const WIN_SIDE = { z0: WINDOWS[1].c[2] - WINDOWS[1].w / 2, z1: WINDOWS[1].c[2] + WINDOWS[1].w / 2, y0: WINDOWS[1].c[1] - WINDOWS[1].h / 2, y1: WINDOWS[1].c[1] + WINDOWS[1].h / 2 };
/** How deep the window reveals are (the wall's thickness there). */
export const REVEAL = 0.42;
/** The window sills stand this far into the room. */
export const SILL_OUT = 0.3;

/** The doorway in the back wall. */
export const DOORWAY = { x0: DOOR.x - DOOR.width / 2, x1: DOOR.x + DOOR.width / 2, top: DOOR.height };
/** The storeroom behind the door: how deep it runs. */
export const STORE_DEPTH = 3.6;

/** The pegboard panels over the tool bench: centres (one behind each back station), size and height. */
export const PEG = { xs: [-4.0, 0, 4.0], w: 3.1, y0: 1.18, y1: 3.32 };
/** Long shelves over the pegboards: jars and tins on the first, finished toys on the two above. */
export const WALL_SHELVES = { x0: BACK_BENCH.x0 + 0.15, x1: BACK_BENCH.x1 - 0.15, y: [3.62, 4.55, 5.48], depth: 0.44 };

/** The front benches, end to end along BENCH (each a solid bench of its own). */
export const BENCHES = [
  { x0: BENCH.x0, x1: -2.43 },
  { x0: -2.39, x1: 2.39 },
  { x0: 2.43, x1: BENCH.x1 },
];
/** Bench top thickness. */
export const TOP_T = 0.1;

/** The stove's hearth and the brick behind it, in the back left corner. */
export const HEARTH = { x0: ROOM.x0, x1: STOVE.x + 0.95, z0: ROOM.back, z1: STOVE.z + 0.95 };
export const BRICK = { x1: STOVE.x + 0.85, z1: STOVE.z + 0.85, top: 2.12 };

/** The long cushioned bench behind the cocoa table (it seats SEATS[0] and SEATS[2]). */
export const SETTLE = { x0: SEATS[0].x - 0.45, x1: SEATS[2].x + 0.5, z: (SEATS[0].z + SEATS[2].z) / 2, depth: 0.56 };
/** The braided rug under the table. */
export const RUG = { x: TABLE.x - 0.05, z: TABLE.z - 0.3, rx: 2.15, rz: 1.62 };

/** The lumber rack on the left wall, toward the front. */
export const LUMBER = { z0: -1.05, z1: 2.3, ys: [0.62, 1.34, 2.06, 2.78, 3.5], reach: 0.62 };
/** Shelves on the right wall behind the counter. */
export const RIGHT_SHELVES = { z0: -5.7, z1: -1.65, ys: [1.35, 2.25, 3.15, 4.05], depth: 0.42 };

/** Pendant lamps over the front bench (x positions, the bulb's height, z). */
export const BENCH_LAMPS = { xs: [-5.4, -1.8, 1.8, 5.4], y: 4.45, z: 0.0 };

/** The brass bell on the shop counter (the makers ring it when they need you). */
export const BELL: [number, number, number] = [(WAIT_LAMPS[0][0] + WAIT_LAMPS[1][0]) / 2, COUNTER.top, -0.62];

export { BACK_BENCH, BENCH, COUNTER, DOOR, ROOM, SEATS, STOVE, TABLE, WAIT_LAMPS, WINDOWS };
