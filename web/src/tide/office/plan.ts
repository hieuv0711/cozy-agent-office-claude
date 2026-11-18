import type { CrewPlan, Shot, V2, WorkSpot, Zone } from '../crew/plan';
import { inZones } from '../crew/plan';

// The night office's floor plan, shared by the room and the people in it.
//
// A loft office late at night, seen from the front (the fourth wall is open).
// It follows the same skeleton as the kitchen (crew/plan.ts): a front row of
// desks where people sit facing the camera, a row of desks along the back wall
// under big windows (people there face the windows), a reception desk on the
// right where anyone who needs you stands under a yellow lamp, a lounge in the
// back left corner for breaks, and a door in the back wall.
//
// World units: furniture about real size in metres (desk tops at 0.84), floor
// y = 0, +z toward the camera. People are chibi, drawn K times bigger than
// they are sculpted: about 3 tall standing, head centre ~2.0 standing and ~1.85
// seated, hands on a keyboard at desk height. Props are drawn about 1.6x real
// size so they read in their hands (a laptop ~0.55 wide, a mug ~0.2 tall).
//
// Station zones on the desks belong to the people: their laptop, phone,
// papers and mug are drawn by the people's code, so the room keeps those
// areas clear and the editor won't drop things in them.

export const K = 2.2;

export const ROOM = { x0: -12.5, x1: 12.5, back: -6.4, front: 4.6 };

/** The front row: one long bench desk, people sit behind it facing the camera. */
export const DESK = { x0: -7.3, x1: 7.3, back: -1.1, front: 0.0, top: 0.84 };
/** The back row: a desk along the back wall, under the windows (people there face the wall). */
export const BACK_DESK = { x0: -7.3, x1: 7.3, back: ROOM.back, front: -5.25, top: 0.84 };
/** Office chairs: the seat's height. */
export const CHAIR_SEAT = 0.53;

/** Where people sit: behind the front desk, and at the back desk. */
export const SIT_Z = -1.45;
export const BACK_SIT_Z = -4.9;
/** The walkway between the two rows. */
export const AISLE_Z = -3.15;

const front = (x: number): WorkSpot => ({ x, z: SIT_Z, yaw: 0, seat: CHAIR_SEAT, zone: { x0: x - 1.0, x1: x + 1.0, z0: DESK.back, z1: DESK.back + 0.8 } });
const back = (x: number): WorkSpot => ({ x, z: BACK_SIT_Z, yaw: Math.PI, seat: CHAIR_SEAT, zone: { x0: x - 1.0, x1: x + 1.0, z0: BACK_DESK.front - 0.8, z1: BACK_DESK.front } });

/** Desks, in the order they are handed out: six at the front desk, then three at the back. */
export const STATIONS: WorkSpot[] = [front(-1.2), front(1.2), front(-3.6), front(3.6), front(-6.0), front(6.0), back(0), back(-4.0), back(4.0)];

/** The reception desk on the right, where anyone who needs you stands, under two lamps. */
export const RECEPTION = { x0: 7.75, x1: 11.9, back: -1.18, front: 0.42, top: 1.02 };
export const WAIT_SPOTS: V2[] = [
  [8.75, -1.6],
  [10.75, -1.6],
  [9.75, -2.65],
  [8.0, -3.05],
  [6.9, -2.45],
];
/** The two lamp shades over the reception desk (the cast lights them when someone waits). */
export const WAIT_LAMPS: [number, number, number][] = [
  [8.75, 4.3, -1.0],
  [10.75, 4.3, -1.0],
];

/** The lounge in the back left corner: a sofa against the back wall, a coffee table, an armchair. */
export const LOUNGE = { sofa: { x0: -11.9, x1: -8.7, z: -5.75, depth: 1.05 }, table: { x: -10.3, z: -3.95, w: 1.5, d: 0.75, top: 0.45 }, armchair: { x: -11.8, z: -3.75 } };
export const SEATS = [
  { x: -11.3, z: -5.4, yaw: 0, y: 0.5, via: [[-8.3, -4.8], [-11.3, -4.8]] as V2[] },
  // the armchair by the side window, turned toward the coffee table (reached round the table's front)
  { x: -11.8, z: -3.75, yaw: 0.95, y: 0.5, via: [[-11.0, -2.65]] as V2[] },
  { x: -10.3, z: -5.4, yaw: 0, y: 0.5, via: [[-8.3, -4.8], [-10.3, -4.8]] as V2[] },
  { x: -9.3, z: -5.4, yaw: 0, y: 0.5, via: [[-8.3, -4.8], [-9.3, -4.8]] as V2[] },
];

/** The door people come in and leave by, in the back wall behind reception. */
export const DOOR = { x: 9.9, width: 1.9, height: 4.2 };

/**
 * Windows, for the weather: the glass's centre, size (width along the wall,
 * height) and the way it faces into the room (yaw of its normal; 0 = +z).
 * Three tall loft windows over the back desks, one by the lounge.
 */
export const WINDOWS: { c: [number, number, number]; w: number; h: number; yaw: number }[] = [
  { c: [-4.0, 4.3, ROOM.back], w: 3.0, h: 3.4, yaw: 0 },
  { c: [0, 4.3, ROOM.back], w: 3.0, h: 3.4, yaw: 0 },
  { c: [4.0, 4.3, ROOM.back], w: 3.0, h: 3.4, yaw: 0 },
  { c: [ROOM.x0, 3.9, -3.6], w: 3.2, h: 2.8, yaw: Math.PI / 2 },
];

/** People's own areas on the desks: the station zones. */
export const RESERVED: Zone[] = STATIONS.map((s) => s.zone);
export const inStationZone = (x: number, z: number, r = 0) => inZones(RESERVED, x, z, r);

/** Camera shots: [camera x, y, z, target x, y, z], framed for 16:10 at fov 40 (the room may tune them). */
export const OFFICE_SHOTS: { wide: Shot; cozy: Shot; top: Shot; window: Shot } = {
  wide: [0, 5.4, 15.6, 0, 2.05, -2.6],
  cozy: [0, 4.1, 12.2, 0, 1.9, -2.0],
  top: [0, 17.5, 7.4, 0, 0.3, -2.6],
  window: [-9.3, 5.2, 4.2, -10.5, 2.0, -4.3],
};

export const OFFICE_PLAN: CrewPlan = {
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
  shots: OFFICE_SHOTS,
  stream: [OFFICE_SHOTS.wide, OFFICE_SHOTS.cozy, [-9.0, 3.6, 8.5, -3.6, 1.6, -2.0], [9.5, 4.2, 9.0, 4.5, 1.7, -1.8], OFFICE_SHOTS.top, OFFICE_SHOTS.window],
};
