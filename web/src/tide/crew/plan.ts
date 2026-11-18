// The shape every people theme's floor plan shares (the kitchen, the office,
// the toy workshop). They all follow one skeleton, so one cast can work in any
// of them:
//
//   back wall  ─────────────────────────────────────────── z = back
//              [lounge / staff corner]  [back line, faces the wall]  [door]
//   aisle      ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   z = aisleZ
//              [front row: people face the camera]   [waiting spots, lamps]
//   front      ─────────────────────────────────────────── (open to the camera)
//
// World units: furniture about real size in metres, floor y = 0, +z toward the
// camera. People are chibi, sculpted in "cook metres" and drawn K times bigger
// (about 3 tall with a hat, head centre ~2.0).

export type V2 = [number, number];
export type Shot = [number, number, number, number, number, number];

export interface Zone {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Where someone works: the spot they stand (or sit) at, the way they face, and their work area on the furniture in front. */
export interface WorkSpot {
  x: number;
  z: number;
  /** 0 = facing +z (the camera), PI = facing the back wall. */
  yaw: number;
  /** The area on the counter, bench or desk in front of them, kept clear for their own things. */
  zone: Zone;
  /** Sitting at a desk (seat height in world units), or standing. */
  seat?: number;
}

/** A place to sit when idle. */
export interface Seat {
  x: number;
  z: number;
  yaw: number;
  /** Seat height, world units. */
  y: number;
  /** Waypoints from the aisle's end to the seat, around furniture. */
  via?: V2[];
}

export interface CrewPlan {
  K: number;
  /** The room's floor inside its walls (world x, and z from the back wall to the open front). */
  room: { x0: number; x1: number; z0: number; z1: number };
  /** The walkway between the front row and the back line, and how far along x it runs. */
  aisleZ: number;
  aisleX: [number, number];
  /** The aisle end people leave by toward the idle corner. */
  cornerX: number;
  stations: WorkSpot[];
  /** Where people who need you stand (the first two under lamps), facing the camera. */
  waitSpots: V2[];
  waitLamps: [number, number, number][];
  seats: Seat[];
  /** The doorway: a spot just inside, and one outside where people appear and vanish. */
  door: { x: number; inside: V2; outside: V2 };
  shots: { wide: Shot; cozy: Shot; top: Shot; window: Shot };
  /** Close-ups from the stream mode's drift. */
  stream: Shot[];
}

export const inZones = (zones: Zone[], x: number, z: number, r = 0) => zones.some((b) => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r);

/**
 * A spot in the room someone walks to for a while: a machine, a board, a
 * shelf. People reach it from the aisle: along the aisle to `aisleX` (default:
 * the place's own x), then through `via`, then to the spot.
 */
export interface Place {
  id: string;
  x: number;
  z: number;
  yaw: number;
  /** What they do there. */
  act: string;
  /** Seat height (world units) if they sit there. */
  sitAt?: number;
  via?: V2[];
  aisleX?: number;
}

/** Where someone goes for a while, and how. */
export interface Trip {
  /** Places in order of preference (the first free one is taken). */
  places: string[];
  /** How long the session must have been at it before they go (ms). */
  after: number;
  /** What they do while walking there (carrying something), default 'stand'. */
  carry?: string;
}
