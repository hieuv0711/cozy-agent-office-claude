// Office floor plan, in metres. x: -9 (left wall) .. 9, z: -6 (back wall) .. 6 (front).
// Characters face +z at rotation 0; the camera looks from the front right.

export type StationKind = 'desk' | 'lounge' | 'front' | 'door' | 'stand';

export interface Station {
  kind: StationKind;
  idx: number;
  pos: [number, number];
  face: number;
  seated: boolean;
  low?: boolean;
  key: string;
}

export const LANE_Z = 1.95;
export const DOOR: [number, number] = [-8.6, 3.55];
export const SEAT_OFFSET = 0.85;

// Two staggered rows, so anyone walking from a back desk to the front passes
// between the front-row desks instead of through them.
export const DESKS: { x: number; z: number }[] = [
  { x: -6.5, z: -3.6 },
  { x: -4.0, z: -3.6 },
  { x: -1.5, z: -3.6 },
  { x: 1.0, z: -3.6 },
  { x: -5.25, z: -0.6 },
  { x: -2.75, z: -0.6 },
  { x: -0.25, z: -0.6 },
  { x: 2.25, z: -0.6 },
];

const LOUNGE: Omit<Station, 'kind' | 'idx' | 'key'>[] = [
  { pos: [5.95, -4.62], face: 0, seated: true },
  { pos: [7.0, -4.62], face: 0, seated: true },
  { pos: [4.85, -2.5], face: 0.7, seated: true, low: true },
  { pos: [7.95, -2.35], face: -0.8, seated: true, low: true },
  { pos: [4.4, -0.9], face: 0.9, seated: false },
  { pos: [8.3, -0.9], face: -1.1, seated: false },
  { pos: [6.4, -1.2], face: 0, seated: false },
  { pos: [5.3, -1.6], face: 0.4, seated: false },
];

const FRONT: [number, number][] = [
  [6.5, 3.2],
  [5.55, 3.35],
  [7.45, 3.35],
  [4.6, 3.5],
  [8.35, 3.5],
  [3.7, 3.6],
];

const STAND: [number, number][] = [
  [-8.1, -1.4],
  [-8.1, -2.4],
  [-8.1, -0.4],
  [-7.4, 0.9],
  [-6.4, 1.2],
  [-3.9, 1.2],
  [-1.4, 1.2],
  [1.1, 1.2],
];

export function deskStation(i: number): Station {
  if (i < DESKS.length) {
    const d = DESKS[i];
    return { kind: 'desk', idx: i, pos: [d.x, d.z + SEAT_OFFSET], face: Math.PI, seated: true, key: `desk-${i}` };
  }
  const j = (i - DESKS.length) % STAND.length;
  const p = STAND[j];
  return { kind: 'stand', idx: j, pos: p, face: p[0] < -7.5 ? -Math.PI / 2 : Math.PI, seated: false, key: `stand-${j}` };
}

export function loungeStation(i: number): Station {
  if (i < LOUNGE.length) return { kind: 'lounge', idx: i, key: `lounge-${i}`, ...LOUNGE[i] };
  const k = i - LOUNGE.length;
  return { kind: 'lounge', idx: i, key: `lounge-${i}`, pos: [4.3 + (k % 5) * 0.9, -0.2 - Math.floor(k / 5) * 0.8], face: 0, seated: false };
}

export function frontStation(i: number): Station {
  const p = i < FRONT.length ? FRONT[i] : [3.0 - (i - FRONT.length) * 0.8, 3.7];
  return { kind: 'front', idx: i, pos: [p[0], p[1]], face: 0, seated: false, key: `front-${i}` };
}

export const DOOR_STATION: Station = { kind: 'door', idx: 0, pos: DOOR, face: -Math.PI / 2, seated: false, key: 'door' };

function near(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
}
const inLounge = (p: [number, number]) => p[0] > 3.8 && p[1] < 0.6;
const inFront = (p: [number, number]) => p[0] > 3.0 && p[1] > 2.5;

// Walk along the open lane in front of the desks: down, across, up.
export function pathTo(from: [number, number], to: [number, number]): [number, number][] {
  if (near(from, to)) return [];
  if ((inLounge(from) && inLounge(to)) || (inFront(from) && inFront(to))) return [to];
  const pts: [number, number][] = [];
  for (const p of [[from[0], LANE_Z] as [number, number], [to[0], LANE_Z] as [number, number], to]) {
    const last = pts.length ? pts[pts.length - 1] : from;
    if (!near(last, p)) pts.push(p);
  }
  return pts;
}
