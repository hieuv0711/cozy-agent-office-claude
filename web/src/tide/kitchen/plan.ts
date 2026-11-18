// The ramen kitchen's floor plan, shared by the room and the cooks.
//
// World units: furniture is about real size in metres (the counter top is at
// 0.92), the floor is y = 0, +z points at the camera. The cooks are chibi: they
// are sculpted in "cook metres" (cookParts.ts) and drawn K times bigger, so a
// cook stands about 3.1 tall to the top of a tall toque, with the head's centre
// at about 2.0 and the hands working at counter height. Doors, shelves and the
// ceiling are sized for them; props are drawn about 1.6x real size so they read
// in their hands (a ramen bowl ~0.42 across, a stock pot ~0.8).
//
// Station zones on the counters belong to the cooks: their board, pot, book and
// food are drawn by the cooks' code, so the room keeps those areas clear and the
// editor won't drop things in them.

import type { CrewPlan, Seat, V2 } from '../crew/plan';

export const K = 2.2;

export const ROOM = { x0: -12.5, x1: 12.5, back: -6.4, front: 4.6 };

/** The counter the cooks work at, facing the camera across it. */
export const COUNTER = { x0: -7.4, x1: 7.4, back: -1.18, front: 0.42, top: 0.92 };
/** The pass: the end of the counter where finished bowls go out, under two lamps. */
export const PASS = { x0: 7.75, x1: 11.9, back: -1.18, front: 0.42, top: 0.92 };
/** The back line: a counter against the back wall (cooks there face the wall). */
export const BACK = { x0: -7.6, x1: 7.6, back: ROOM.back, front: -5.2, top: 0.92 };

/** Where cooks stand behind the front counter, and at the back line. */
export const STAND_Z = -1.55;
export const BACK_STAND_Z = -4.83;
/** The walkway between the two lines. */
export const AISLE_Z = -3.0;

export interface Station {
  /** Where the cook stands. */
  x: number;
  z: number;
  /** Which way the cook faces (0 = +z, toward the camera). */
  yaw: number;
  /** The work area on the counter in front of the cook, kept clear for the cook's things. */
  zone: { x0: number; x1: number; z0: number; z1: number };
}

const front = (x: number): Station => ({ x, z: STAND_Z, yaw: 0, zone: { x0: x - 1.15, x1: x + 1.15, z0: COUNTER.back, z1: COUNTER.back + 0.9 } });
const back = (x: number): Station => ({ x, z: BACK_STAND_Z, yaw: Math.PI, zone: { x0: x - 1.15, x1: x + 1.15, z0: BACK.front - 0.9, z1: BACK.front } });

/** Work stations, in the order they are handed out: six at the front counter, then three at the back line. */
export const STATIONS: Station[] = [front(-1.2), front(1.2), front(-3.6), front(3.6), front(-6.0), front(6.0), back(0), back(-4.0), back(4.0)];

/** Where cooks who need you stand, at the pass under its lamps (the first two are lit). */
export const PASS_SPOTS: [number, number][] = [
  [8.75, STAND_Z],
  [10.75, STAND_Z],
  [9.75, -2.65],
  [8.0, -3.0],
  [11.4, -3.0],
];
/** The two lamps over the pass (their shades; the light shines down from here). */
export const PASS_LAMPS: [number, number, number][] = [
  [8.75, 4.3, -1.0],
  [10.75, 4.3, -1.0],
];

/** The staff table in the back left corner, where idle cooks have tea. */
export const TABLE = { x: -10.1, z: -3.6, r: 0.95, top: 0.84 };
/** Seats around it: position, the way the sitter faces, and the seat height. */
export const SEATS: { x: number; z: number; yaw: number; y: number }[] = [
  { x: -10.6, z: -4.95, yaw: 0.3, y: 0.53 },
  { x: -8.7, z: -3.75, yaw: -1.35, y: 0.53 },
  { x: -9.1, z: -4.95, yaw: -0.45, y: 0.53 },
  { x: -11.5, z: -3.75, yaw: 1.35, y: 0.53 },
];

/** The doorway (a noren curtain) cooks come in and leave by, in the back wall. */
export const DOOR = { x: 9.9, width: 1.9, height: 4.2 };

/**
 * Windows, for the weather: the glass's centre, size (width along the wall,
 * height) and the way it faces into the room (yaw of its normal; 0 = +z).
 */
export const WINDOWS: { c: [number, number, number]; w: number; h: number; yaw: number }[] = [
  { c: [-10.1, 3.9, ROOM.back], w: 3.0, h: 2.8, yaw: 0 },
  { c: [ROOM.x0, 3.9, -3.6], w: 3.2, h: 2.8, yaw: Math.PI / 2 },
];

/** Cook-owned areas on the counters, as boxes in x/z: the station zones. */
export const RESERVED = STATIONS.map((s) => s.zone);

/** Is a spot (with a footprint radius) inside a cook's work area on a counter? */
export function inStationZone(x: number, z: number, r = 0): boolean {
  return RESERVED.some((b) => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r);
}

/**
 * Camera shots of the kitchen: [camera x, y, z, target x, y, z], framed for
 * 16:10 at fov 40. wide: the kitchen from the customers' side, every cook in
 * view from the tea table to the pass, and both dining tables with all six
 * customers in the dark front corners (pulled back from z 19 so the outer
 * side seats fit); cozy: the six
 * front cooks big; top: from above, the ceiling cut away; window: the back-left
 * corner, the two windows (and their weather) over the staff table.
 */
export const KITCHEN_SHOTS = {
  wide: [0, 6.2, 21.5, 0, 2.3, -2.0] as [number, number, number, number, number, number],
  cozy: [0, 4.3, 12.2, 0, 2.05, -2.0] as [number, number, number, number, number, number],
  top: [0, 20, 8.8, 0, 0.3, -2.8] as [number, number, number, number, number, number],
  window: [-8.6, 6.4, 5.4, -10.6, 2.0, -4.3] as [number, number, number, number, number, number],
};

// ---------- the dining floor: customers, and the dishes going out ----------

/** Where cooks set finished bowls down on the pass for the waiter to take out (x, z on the pass top). */
export const PASS_SLOTS: V2[] = [
  [8.35, -0.55],
  [9.05, -0.55],
  [9.75, -0.55],
  [10.45, -0.55],
  [11.15, -0.55],
];

/** Two small dining tables in the front corners of the dining floor. */
export const DINING_TABLES = [
  { x: -9.4, z: 2.5, r: 0.75, top: 0.84 },
  { x: 9.4, z: 2.5, r: 0.75, top: 0.84 },
];

/**
 * Customers' seats, facing their table: the one behind the left table faces the
 * camera; the right table is only sat at from the sides (its back chair would
 * hide whoever waits at the pass behind it).
 */
export const CUSTOMER_SEATS: Seat[] = DINING_TABLES.flatMap((t) => [
  { x: t.x, z: t.z - 0.95, yaw: 0, y: 0.53, via: [[t.x + (t.x < 0 ? 1.35 : -1.35), t.z + 1.4], [t.x + (t.x < 0 ? 1.35 : -1.35), t.z - 0.95]] as V2[] },
  { x: t.x - 1.05, z: t.z - 0.35, yaw: Math.atan2(1.05, 0.35), y: 0.53, via: [[t.x - 1.05, t.z + 1.4]] as V2[] },
  { x: t.x + 1.05, z: t.z - 0.35, yaw: Math.atan2(-1.05, 0.35), y: 0.53, via: [[t.x + 1.05, t.z + 1.4]] as V2[] },
]).filter((q) => !(q.x > 0 && q.yaw === 0));

/** Customers come in from the street in front of the room (out of the picture) and leave the same way. */
export const STREET: V2[] = [
  [-9.4, 9.5],
  [9.4, 9.5],
];

/** Everything the cast needs, in the shape every people theme shares. */
export const KITCHEN_PLAN: CrewPlan = {
  K,
  room: { x0: ROOM.x0, x1: ROOM.x1, z0: ROOM.back, z1: ROOM.front },
  aisleZ: AISLE_Z,
  aisleX: [-8.3, 11.6],
  cornerX: -8.3,
  stations: STATIONS,
  waitSpots: PASS_SPOTS,
  waitLamps: PASS_LAMPS,
  seats: [
    { ...SEATS[0], via: [[-8.3, -5.7], [SEATS[0].x, -5.7]] },
    { ...SEATS[1], via: [] },
    { ...SEATS[2], via: [[-8.3, -5.7], [SEATS[2].x, -5.7]] },
    { ...SEATS[3], via: [[-8.3, -2.2], [SEATS[3].x, -2.2]] },
  ],
  door: { x: DOOR.x, inside: [DOOR.x, ROOM.back + 0.7], outside: [DOOR.x, ROOM.back - 1.1] },
  shots: KITCHEN_SHOTS,
  stream: [
    KITCHEN_SHOTS.wide,
    KITCHEN_SHOTS.cozy,
    [-9.0, 3.6, 8.5, -3.6, 1.7, -2.0],
    [9.5, 4.2, 9.0, 4.5, 1.8, -1.8],
    KITCHEN_SHOTS.top,
    KITCHEN_SHOTS.window,
  ],
};
