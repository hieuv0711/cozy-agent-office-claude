import { BACK, COUNTER, DOOR, PASS, ROOM, WINDOWS } from '../kitchen/plan';

// Measurements of the ramen kitchen's fixed shell that only the room uses
// (the shared floor plan, with the cooks' stations, is ../kitchen/plan.ts).

/** The ceiling's underside. */
export const CEIL = 8.2;
/** How far the dining side (floor, ceiling, side walls) runs toward the camera. */
export const NEAR_Z = 26;

/** The customers' ledge along the front of the counter: a raised bar top. */
export const LEDGE = { x0: COUNTER.x0 - 0.12, x1: COUNTER.x1 + 0.12, back: COUNTER.front, front: COUNTER.front + 0.62, top: 1.16, thick: 0.1 };
/** The counter body's front face, set back under the ledge's overhang for knees. */
export const FACE_Z = LEDGE.front - 0.24;
/** The pass's body front (no ledge there: a stainless upstand instead). */
export const PASS_FACE_Z = PASS.front + 0.12;

/** The tiled wall behind the back line, up to the hood. */
export const SPLASH = { x0: BACK.x0 - 0.45, x1: BACK.x1 + 0.45, top: 4.5 };
/** Wood wainscot height on the plastered walls. */
export const WAINSCOT_Y = 1.5;

/** Open shelves on the tiles over the back line (between the broth pots). */
export const SHELVES = { x0: -5.25, x1: 5.25, y: [2.5, 3.4] as number[], depth: 0.46 };
/** The range hood over the whole back line. */
export const HOOD = { x0: BACK.x0 - 0.25, x1: BACK.x1 + 0.25, y0: 4.55, y1: 5.55, front: BACK.front + 0.3 };

/** The window openings, as boxes in their walls. */
export const WIN_BACK = { x0: WINDOWS[0].c[0] - WINDOWS[0].w / 2, x1: WINDOWS[0].c[0] + WINDOWS[0].w / 2, y0: WINDOWS[0].c[1] - WINDOWS[0].h / 2, y1: WINDOWS[0].c[1] + WINDOWS[0].h / 2 };
export const WIN_SIDE = { z0: WINDOWS[1].c[2] - WINDOWS[1].w / 2, z1: WINDOWS[1].c[2] + WINDOWS[1].w / 2, y0: WINDOWS[1].c[1] - WINDOWS[1].h / 2, y1: WINDOWS[1].c[1] + WINDOWS[1].h / 2 };
/** How deep the window reveals are (the wall's thickness there). */
export const REVEAL = 0.42;
/** The window sills stand this far into the room. */
export const SILL_OUT = 0.34;

/** The doorway in the back wall. */
export const DOORWAY = { x0: DOOR.x - DOOR.width / 2, x1: DOOR.x + DOOR.width / 2, top: DOOR.height };

/**
 * Bar stools along the customers' side of the counter, one per front station,
 * tucked in under the ledge so the waiter's lane (z 1.6 to 2.3) stays clear.
 */
export const BAR_STOOLS: { x: number; z: number }[] = [-6.0, -3.6, -1.2, 1.2, 3.6, 6.0].map((x) => ({ x, z: LEDGE.front + 0.24 }));

export { BACK, COUNTER, PASS, ROOM };
