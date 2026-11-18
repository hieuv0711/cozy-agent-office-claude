import { FRONT_Z, TOP, WALL_Z } from '../space';

// The greenhouse's measurements (world units, 1 unit = 10 cm). The tank stands
// on the potting bench at TOP; the back glass wall is at WALL_Z.

export { FRONT_Z, TOP, WALL_Z };

/** The brick floor of the greenhouse (and the garden outside). */
export const FLOOR = TOP - 9.75;
/** Side walls at x = ±SIDE; the roof's eaves and ridge. */
export const SIDE = 20;
export const EAVE = 9;
export const RIDGE = 22;
/** The house runs toward the camera as far as this. */
export const END_Z = 52;
/** Spacing of the glazing posts. */
export const BAY = 5;
/** The timber cill at the foot of the back glass (a narrow ledge just above the bench). */
export const CILL_Y = TOP + 0.36;
export const CILL_FRONT = WALL_Z + 0.58;
/** The bench's back edge butts against the cill. */
export const BENCH_BACK = CILL_FRONT;
export const BENCH_X = 18.4;
/** The transom rail under the top vents, where the festoon lights hang. */
export const RAIL_Y = 5.6;
/** Plant shelves on the back wall, left and right of the tank. */
export const SHELF_Y = 1.75;
export const SHELF_X0 = 7.4;
export const SHELF_X1 = 18.7;
export const SHELF_Z = WALL_Z + 0.62;
/** The slatted shelf under the bench. */
export const LOW_Y = FLOOR + 2.2;

/** The roof line (underside of the gable rafters) at x. */
export const roofY = (x: number) => RIDGE - ((RIDGE - EAVE) * Math.min(SIDE, Math.abs(x))) / SIDE;
