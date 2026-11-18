import { BACK_DESK, DESK, DOOR, LOUNGE, RECEPTION, ROOM, WINDOWS } from '../office/plan';

// Measurements of the night office's fixed shell that only the room uses
// (the shared floor plan, with the stations, is ../office/plan.ts).

/** The ceiling's underside (the joists hang below it). */
export const CEIL = 8.2;
/** How far the floor, the side walls and the ceiling run toward the camera. */
export const NEAR_Z = 22;
/** The brick walls' thickness, seen in the window and door reveals. */
export const WALL_T = 0.46;
/** How far back in its reveal a steel window stands (from the wall's face). */
export const GLASS_IN = 0.3;
/** How far the window sills stand out from the wall's face. */
export const SILL_OUT = 0.2;
/** How much higher an arched window head is at its crown than at its springing. */
export const ARCH_RISE = 0.36;

/** A window opening as its wall's own frame sees it: u along the wall, y up (the arch's crown at y1). */
export interface Opening {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  /** Where the arch springs from the jambs. */
  ys: number;
}

const opening = (cu: number, w: number, cy: number, h: number): Opening => ({ u0: cu - w / 2, u1: cu + w / 2, y0: cy - h / 2, y1: cy + h / 2, ys: cy + h / 2 - ARCH_RISE });

/** The three tall windows in the back wall (u = x). */
export const BACK_OPENINGS: Opening[] = WINDOWS.slice(0, 3).map((w) => opening(w.c[0], w.w, w.c[1], w.h));
/** The window in the left wall by the lounge (u = -z, so u runs toward the back). */
export const SIDE_OPENING: Opening = opening(-WINDOWS[3].c[2], WINDOWS[3].w, WINDOWS[3].c[1], WINDOWS[3].h);

/** The arch over an opening: its circle's centre height and radius (through both springings and the crown). */
export function archOf(o: Opening) {
  const half = (o.u1 - o.u0) / 2;
  const rise = o.y1 - o.ys;
  const R = (half * half + rise * rise) / (2 * rise);
  return { cu: (o.u0 + o.u1) / 2, cy: o.y1 - R, R };
}

/** The head of an opening at u (the arch above the springing). */
export function headAt(o: Opening, u: number) {
  const a = archOf(o);
  const du = u - a.cu;
  return a.cy + Math.sqrt(Math.max(0, a.R * a.R - du * du));
}

/** The doorway in the back wall. */
export const DOORWAY = { x0: DOOR.x - DOOR.width / 2, x1: DOOR.x + DOOR.width / 2, top: DOOR.height };

/** Front desk: the top's thickness, and the modesty panel on the camera side. */
export const DESK_T = 0.07;
export const PANEL = { z: DESK.front - 0.07, y0: 0.06, y1: DESK.top - DESK_T - 0.02 };

/** The reception counter's shape: its front is rounded at both ends. */
export const RECEPTION_R = 0.55;

/** The pendants over the front desk (shade centres) and the depth they hang at. */
export const PENDANTS = { xs: [-4.8, 0, 4.8], y: 5.5, z: (DESK.back + DESK.front) / 2 - 0.05 };

/** The lounge: the rug under the coffee table, the sideboard with the coffee things, the floor lamp. */
export const RUG = { x: -10.25, z: -4.35, w: 4.1, d: 2.75 };
export const SIDEBOARD = { x0: -8.62, x1: -7.42, z0: ROOM.back, z1: ROOM.back + 0.62, top: 1.0 };
export const FLOOR_LAMP: [number, number, number] = [-12.08, 0, -4.95];

/** Built-in bookshelves along the left wall, in front of the lounge window. */
export const SHELVES = { z0: -1.35, z1: 2.95, depth: 0.5, top: 3.9, x: ROOM.x0 };

export { BACK_DESK, DESK, LOUNGE, RECEPTION, ROOM };
