// Shared measurements of the tank and the room around it (world units; one
// unit is about 10 cm). Every theme keeps the tank in the same place.

/** Half width (x), top and bottom (y), half depth (z) of the water volume. */
export const TANK = { x: 6, yTop: 2.4, yBot: -3, z: 2.6 };
/** The sand's base level inside the tank (it ripples a little around this). */
export const SAND_Y = -2.62;
/** The top of the desk, counter or bench the tank stands on. */
export const TOP = -3.15;
/** The back wall's plane. */
export const WALL_Z = -4.6;
/** The front edge of the top surface. */
export const FRONT_Z = 3.6;
/** The tank's footprint on the top surface (frame included); props stay out of it. */
export const FOOTPRINT = { x: 6.25, z: 2.8 };
/** The default camera: [x, y, z, target x, y, z], framed for a 16:10 window. */
export const WIDE_SHOT: [number, number, number, number, number, number] = [0, 1.0, 16.5, 0, -0.4, 0];
