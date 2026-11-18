import type { CrewPlan, Shot, V2, WorkSpot, Zone } from '../crew/plan';
import { inZones } from '../crew/plan';

// The toy workshop's floor plan, shared by the room and the makers in it.
//
// A toymaker's workshop late at night, seen from the front (the fourth wall is
// open). It follows the same skeleton as the kitchen (crew/plan.ts): a long
// workbench where makers stand facing the camera, a tool bench along the back
// wall (makers there face the wall), the shop counter on the right with a bell,
// where anyone who needs you stands under a yellow lamp, a warm corner with a
// wood stove at the back left for breaks, and a door in the back wall.
//
// World units: furniture about real size in metres (bench tops at 0.92),
// floor y = 0, +z toward the camera. Makers are chibi, drawn K times bigger
// than they are sculpted: about 3 tall with a cap, head centre ~2.0, hands
// working at bench height. Props are drawn about 1.6x real size so they read
// in their hands (a hand saw ~0.7 long, a hammer ~0.5, a toy train ~0.5).
//
// Station zones on the benches belong to the makers: their plank, saw, hammer,
// blueprint, parts tray and the toy in progress are drawn by the makers' code,
// so the room keeps those areas clear and the editor won't drop things in them.

export const K = 2.2;

export const ROOM = { x0: -12.5, x1: 12.5, back: -6.4, front: 4.6 };

/** The front workbench (it may be built as several benches end to end): makers stand behind it facing the camera. */
export const BENCH = { x0: -7.4, x1: 7.4, back: -1.18, front: 0.22, top: 0.92 };
/** The tool bench along the back wall (makers there face the wall). */
export const BACK_BENCH = { x0: -7.6, x1: 7.6, back: ROOM.back, front: -5.2, top: 0.92 };

/** Where makers stand: behind the front bench, and at the back bench. */
export const STAND_Z = -1.55;
export const BACK_STAND_Z = -4.83;
/** The walkway between the two benches. */
export const AISLE_Z = -3.0;

const front = (x: number): WorkSpot => ({ x, z: STAND_Z, yaw: 0, zone: { x0: x - 1.15, x1: x + 1.15, z0: BENCH.back, z1: BENCH.back + 0.95 } });
const back = (x: number): WorkSpot => ({ x, z: BACK_STAND_Z, yaw: Math.PI, zone: { x0: x - 1.15, x1: x + 1.15, z0: BACK_BENCH.front - 0.9, z1: BACK_BENCH.front } });

/** Work spots, in the order they are handed out: six at the front bench, then three at the back. */
export const STATIONS: WorkSpot[] = [front(-1.2), front(1.2), front(-3.6), front(3.6), front(-6.0), front(6.0), back(0), back(-4.0), back(4.0)];

/** The shop counter on the right (with a bell), where anyone who needs you stands, under two lamps. */
export const COUNTER = { x0: 7.75, x1: 11.9, back: -1.18, front: 0.42, top: 0.98 };
export const WAIT_SPOTS: V2[] = [
  [8.75, STAND_Z],
  [10.75, STAND_Z],
  [9.75, -2.65],
  [8.0, -3.0],
  [6.9, -2.5],
];
/** The two lamp shades over the counter (the cast lights them when someone waits). */
export const WAIT_LAMPS: [number, number, number][] = [
  [8.75, 4.3, -1.0],
  [10.75, 4.3, -1.0],
];

/** The warm corner at the back left: a wood stove in the corner, a low table with mugs of cocoa, four seats. */
export const STOVE = { x: -11.65, z: -5.65 };
export const TABLE = { x: -10.1, z: -3.6, r: 0.95, top: 0.84 };
export const SEATS = [
  { x: -10.6, z: -4.95, yaw: 0.3, y: 0.53, via: [[-8.3, -5.7], [-10.6, -5.7]] as V2[] },
  { x: -8.7, z: -3.75, yaw: -1.35, y: 0.53, via: [] as V2[] },
  { x: -9.1, z: -4.95, yaw: -0.45, y: 0.53, via: [[-8.3, -5.7], [-9.1, -5.7]] as V2[] },
  { x: -11.5, z: -3.75, yaw: 1.35, y: 0.53, via: [[-8.3, -2.2], [-11.5, -2.2]] as V2[] },
];

/** The door makers come in and leave by, in the back wall behind the counter. */
export const DOOR = { x: 9.9, width: 1.9, height: 4.2 };

/** Windows, for the weather: the glass's centre, size (width along the wall, height) and facing (yaw; 0 = +z). */
export const WINDOWS: { c: [number, number, number]; w: number; h: number; yaw: number }[] = [
  { c: [-10.1, 3.9, ROOM.back], w: 3.0, h: 2.8, yaw: 0 },
  { c: [ROOM.x0, 3.9, -3.6], w: 3.2, h: 2.8, yaw: Math.PI / 2 },
];

/** Makers' own areas on the benches: the station zones. */
export const RESERVED: Zone[] = STATIONS.map((s) => s.zone);
export const inStationZone = (x: number, z: number, r = 0) => inZones(RESERVED, x, z, r);

/**
 * Camera shots: [camera x, y, z, target x, y, z] at fov 40, framed for the
 * app's wide stage (1440 x 704). wide: every maker in view, from the rocking
 * chair by the stove to the far waiting spot, faces about 55 px tall; cozy:
 * the six front makers big; top: from above, the ceiling cut away; window:
 * the stove corner and the two windows (and their weather).
 */
export const WORKSHOP_SHOTS: { wide: Shot; cozy: Shot; top: Shot; window: Shot } = {
  wide: [0, 5.2, 16.0, 0, 2.4, -2.0],
  cozy: [0, 3.9, 9.6, 0, 1.95, -2.0],
  top: [0, 20, 8.8, 0, 0.3, -2.8],
  window: [-7.5, 4.9, 4.6, -10.6, 2.55, -4.5],
};

export const WORKSHOP_PLAN: CrewPlan = {
  K,
  room: { x0: ROOM.x0, x1: ROOM.x1, z0: ROOM.back, z1: ROOM.front },
  aisleZ: AISLE_Z,
  aisleX: [-8.3, 11.6],
  cornerX: -8.3,
  stations: STATIONS,
  waitSpots: WAIT_SPOTS,
  waitLamps: WAIT_LAMPS,
  seats: SEATS,
  door: { x: DOOR.x, inside: [DOOR.x, ROOM.back + 0.7], outside: [DOOR.x, ROOM.back - 1.1] },
  shots: WORKSHOP_SHOTS,
  stream: [WORKSHOP_SHOTS.wide, WORKSHOP_SHOTS.cozy, [-9.0, 3.6, 8.5, -3.6, 1.7, -2.0], [9.5, 4.2, 9.0, 4.5, 1.8, -1.8], WORKSHOP_SHOTS.top, WORKSHOP_SHOTS.window],
};
