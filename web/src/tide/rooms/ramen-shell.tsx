import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ROOM } from '../kitchen/plan';
import { CEIL, DOORWAY, FACE_Z, NEAR_Z, SPLASH, WAINSCOT_Y, WIN_BACK, WIN_SIDE } from './ramen-dims';
import { boardsTex, C, fbm3, mat, mapUV, Merger, mix, noise3, once, paint, plank, plasterBump, plasterTex, quarryTex, rand, smoothstep, tileTex, trs, woodTex } from './ramen-kit';

// The kitchen's shell: plastered walls over a dark wood wainscot, glazed tiles
// behind the back line, quarry tiles underfoot in the kitchen and worn boards
// on the customers' side, and a boarded ceiling on heavy beams. The windows and
// the doorway are in ramen-openings.tsx.

const X0 = ROOM.x0;
const X1 = ROOM.x1;
const BZ = ROOM.back;

// ---------- materials ----------

export function shellMats() {
  return {
    plaster: mat('plaster', () => new THREE.MeshStandardMaterial({ map: plasterTex(), bumpMap: plasterBump(), bumpScale: 0.6, roughness: 0.92, vertexColors: true })),
    tiles: mat('tiles', () => new THREE.MeshStandardMaterial({ map: tileTex('splash', { cols: 4, rows: 8, base: '#d8cdb4', vary: 0.08, grout: '#7d766a', offset: true, seed: 5 }), roughness: 0.2, vertexColors: true })),
    band: mat('tile-band', () => new THREE.MeshStandardMaterial({ map: tileTex('band', { cols: 8, rows: 2, base: '#2c4a63', vary: 0.12, grout: '#5c5a52', seed: 9, craze: 0.3 }), roughness: 0.16, vertexColors: true })),
    wainscot: mat('wainscot', () => new THREE.MeshStandardMaterial({ map: woodTex('wainscot', { w: 1024, h: 256, light: '#7b5132', dark: '#2a170c', planks: 1, rings: 9, seed: 41, joints: false, seams: 0, figure: 0.15, warp: 0.5 }), roughness: 0.5, vertexColors: true })),
    trim: mat('trim', () => new THREE.MeshStandardMaterial({ map: woodTex('trim', { w: 1024, h: 128, light: '#5d3a22', dark: '#1d0f07', planks: 1, rings: 5, seed: 13, joints: false, seams: 0, figure: 0.2 }), roughness: 0.48, vertexColors: true })),
    quarry: mat('quarry', () => new THREE.MeshStandardMaterial({ map: quarryTex(), roughness: 0.62, vertexColors: true })),
    boards: mat('boards', () => new THREE.MeshStandardMaterial({ map: boardsTex(), roughness: 0.58, vertexColors: true })),
    ceiling: mat('ceiling', () => new THREE.MeshStandardMaterial({ map: woodTex('ceiling', { w: 1024, h: 512, light: '#a07a52', dark: '#4a3020', planks: 6, rings: 6, seed: 27 }), roughness: 0.85, vertexColors: true })),
    beam: mat('beam', () => new THREE.MeshStandardMaterial({ map: woodTex('beam', { w: 1024, h: 256, light: '#5a3a24', dark: '#160c06', planks: 2, rings: 9, seed: 33, joints: false, seams: 0.2 }), roughness: 0.62, vertexColors: true })),
  };
}

// ---------- walls ----------

type Rect = [number, number, number, number]; // u0, u1, y0, y1 in the wall's own frame

/** A wall from subdivided rectangles (so vertex colours can carry grime), placed by a matrix. */
function wallFromRects(rects: Rect[], m: THREE.Matrix4, grime: (u: number, y: number, out: THREE.Color) => void, step = 0.3) {
  const merged = new Merger();
  for (const [u0, u1, y0, y1] of rects) {
    const w = u1 - u0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) continue;
    const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.round(w / step)), Math.max(1, Math.round(h / step)));
    g.translate((u0 + u1) / 2, (y0 + y1) / 2, 0);
    // plaster tiles every 4 units, in the wall's own frame
    mapUV(g, (x, y) => [x / 4, y / 4]);
    paint(g, (x, y, _z, out) => grime(x, y, out));
    merged.add(g, m);
  }
  return merged.build();
}

const SOOT = C('#6b5236');
const DAMP = C('#8a7a62');

/** Large-scale wear on plaster: soot over the stove line, darker corners and a few blotches. */
function plasterGrime(u: number, y: number, out: THREE.Color, o: { sootX?: [number, number]; ends?: [number, number] } = {}) {
  out.setRGB(1, 1, 1);
  const blot = fbm3(u * 0.32 + 4.1, y * 0.32, 2.3);
  mix(out, out, DAMP, smoothstep(0.05, 0.4, blot) * 0.22);
  if (o.sootX) {
    const [a, b] = o.sootX;
    const inside = smoothstep(a - 1.2, a + 0.6, u) * smoothstep(b + 1.2, b - 0.6, u);
    mix(out, out, SOOT, smoothstep(5.0, 7.6, y) * inside * (0.45 + 0.2 * noise3(u * 0.9, y * 0.9, 5)));
  }
  // darker toward the ceiling and the corners, like old rooms
  out.multiplyScalar(1 - smoothstep(CEIL - 1.6, CEIL, y) * 0.28);
  if (o.ends) out.multiplyScalar(1 - (smoothstep(o.ends[0] + 1.0, o.ends[0], u) + smoothstep(o.ends[1] - 1.0, o.ends[1], u)) * 0.22);
  // a faint tide line of wear just above the wainscot
  out.multiplyScalar(1 - smoothstep(WAINSCOT_Y + 0.5, WAINSCOT_Y, y) * 0.12);
}

function backWallGeometry() {
  const { x0: wx0, x1: wx1, y0: wy0, y1: wy1 } = WIN_BACK;
  const { x0: dx0, x1: dx1, top } = DOORWAY;
  const rects: Rect[] = [
    [X0, wx0, 0, CEIL],
    [wx0, wx1, 0, wy0],
    [wx0, wx1, wy1, CEIL],
    [wx1, dx0, 0, CEIL],
    [dx0, dx1, top, CEIL],
    [dx1, X1, 0, CEIL],
  ];
  return wallFromRects(rects, trs([0, 0, BZ]), (u, y, out) => plasterGrime(u, y, out, { sootX: [SPLASH.x0, SPLASH.x1], ends: [X0, X1] }));
}

function leftWallGeometry() {
  // local u runs along -z (the plane turned to face +x)
  const { z0, z1, y0, y1 } = WIN_SIDE;
  const rects: Rect[] = [
    [-z0, -BZ, 0, CEIL],
    [-z1, -z0, 0, y0],
    [-z1, -z0, y1, CEIL],
    [-NEAR_Z, -z1, 0, CEIL],
  ];
  return wallFromRects(rects, trs([X0, 0, 0], [0, Math.PI / 2, 0]), (u, y, out) => plasterGrime(u, y, out, { ends: [-NEAR_Z, -BZ] }), 0.4);
}

function rightWallGeometry() {
  const rects: Rect[] = [[BZ, NEAR_Z, 0, CEIL]];
  return wallFromRects(rects, trs([X1, 0, 0], [0, -Math.PI / 2, 0]), (u, y, out) => plasterGrime(u, y, out, { ends: [BZ, NEAR_Z] }), 0.4);
}

/** Glazed tiles behind the back line, with grime collecting low down and under the hood. */
function splashGeometry(y0: number, y1: number, tilesPerTex: [number, number]) {
  const w = SPLASH.x1 - SPLASH.x0;
  const g = new THREE.PlaneGeometry(w, y1 - y0, Math.round(w / 0.25), Math.max(2, Math.round((y1 - y0) / 0.25)));
  g.translate((SPLASH.x0 + SPLASH.x1) / 2, (y0 + y1) / 2, BZ + 0.012);
  mapUV(g, (x, y) => [x / tilesPerTex[0], y / tilesPerTex[1]]);
  const grease = C('#b59c6c');
  return paint(g, (x, y, _z, out) => {
    out.setRGB(1, 1, 1);
    // splashes and a yellowed film near the burners and up under the hood
    const n = fbm3(x * 0.8, y * 0.8, 7.7);
    mix(out, out, grease, smoothstep(-0.1, 0.5, n) * 0.25 + smoothstep(3.4, 4.5, y) * 0.22);
    out.multiplyScalar(1 - smoothstep(1.4, 0.9, y) * 0.15);
  });
}

/** Vertical tongue-and-groove boards from the floor to the wainscot cap, along a run (in the wall's frame). */
function wainscotRun(m: Merger, trim: Merger, u0: number, u1: number, mtx: THREE.Matrix4, seed: number) {
  const r = rand(seed);
  const bw = 0.34;
  const n = Math.max(1, Math.round((u1 - u0) / bw));
  const w = (u1 - u0) / n;
  const tint = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const cu = u0 + (i + 0.5) * w;
    tint.setRGB(1, 1, 1).multiplyScalar(0.82 + r() * 0.3);
    tint.offsetHSL((r() - 0.5) * 0.015, 0, 0);
    const g = plank(w - 0.012, WAINSCOT_Y - 0.12, 0.05, 0.012, [1 / 2.2, 1 / 2.2], 1, [r() * 4, r() * 4], true);
    // lighter wear on the board faces' lower edge where feet and mops knock
    paint(g, (_x, y, _z, out) => out.setScalar(1 - smoothstep(-0.25, -0.6, y) * 0.18));
    m.add(g, new THREE.Matrix4().multiplyMatrices(mtx, trs([cu, (WAINSCOT_Y - 0.12) / 2 + 0.02, 0.025])), tint);
  }
  // the cap rail and a skirting board
  trim.add(plank(u1 - u0 + 0.02, 0.09, 0.11, 0.03, [1 / 3, 1 / 3]), new THREE.Matrix4().multiplyMatrices(mtx, trs([(u0 + u1) / 2, WAINSCOT_Y - 0.075, 0.055])));
  trim.add(plank(u1 - u0 + 0.02, 0.05, 0.08, 0.02, [1 / 3, 1 / 3]), new THREE.Matrix4().multiplyMatrices(mtx, trs([(u0 + u1) / 2, WAINSCOT_Y - 0.135, 0.07])));
  trim.add(plank(u1 - u0 + 0.02, 0.16, 0.08, 0.02, [1 / 3, 1 / 3]), new THREE.Matrix4().multiplyMatrices(mtx, trs([(u0 + u1) / 2, 0.08, 0.06])));
}

function wainscotGeometry() {
  const boards = new Merger();
  const trim = new Merger();
  const back = trs([0, 0, BZ]);
  // the back wall, either side of the tiles (and around the doorway)
  wainscotRun(boards, trim, X0, SPLASH.x0, back, 1);
  wainscotRun(boards, trim, SPLASH.x1, DOORWAY.x0 - 0.22, back, 2);
  wainscotRun(boards, trim, DOORWAY.x1 + 0.22, X1, back, 3);
  // the side walls
  wainscotRun(boards, trim, -NEAR_Z, -BZ, trs([X0, 0, 0], [0, Math.PI / 2, 0]), 4);
  wainscotRun(boards, trim, BZ, NEAR_Z, trs([X1, 0, 0], [0, -Math.PI / 2, 0]), 5);
  return { boards: boards.build(), trim: trim.build() };
}

function tileTrimGeometry() {
  // a rounded cap along the top of the tiles, and a quarter-round where they meet the hood
  const m = new Merger();
  m.add(plank(SPLASH.x1 - SPLASH.x0 + 0.06, 0.07, 0.06, 0.028, [1 / 3, 1 / 3]), trs([(SPLASH.x0 + SPLASH.x1) / 2, SPLASH.top + 0.03, BZ + 0.035]));
  for (const x of [SPLASH.x0, SPLASH.x1]) m.add(plank(0.06, SPLASH.top, 0.06, 0.028, [1 / 3, 1 / 3]), trs([x, SPLASH.top / 2, BZ + 0.035]));
  return m.build();
}

export function Walls({ m }: { m: ReturnType<typeof shellMats> }) {
  const geo = useMemo(
    () =>
      once('ramen:walls', () => ({
        back: backWallGeometry(),
        left: leftWallGeometry(),
        right: rightWallGeometry(),
        splash: splashGeometry(0, SPLASH.top - 0.5, [2, 2]),
        band: splashGeometry(SPLASH.top - 0.5, SPLASH.top, [2, 0.5]),
        wainscot: wainscotGeometry(),
        tileTrim: tileTrimGeometry(),
      })),
    [],
  );
  return (
    <group>
      <mesh geometry={geo.back} material={m.plaster} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.left} material={m.plaster} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.right} material={m.plaster} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.splash} material={m.tiles} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.band} material={m.band} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.tileTrim} material={m.band} receiveShadow />
      <mesh geometry={geo.wainscot.boards} material={m.wainscot} receiveShadow />
      <mesh geometry={geo.wainscot.trim} material={m.trim} receiveShadow />
    </group>
  );
}

// ---------- floors ----------

/** Where the kitchen's tiles give way to the customers' boards (under the counter body). */
const FLOOR_SPLIT = FACE_Z - 0.3;

function floorGeometries() {
  const tw = 0.78; // one quarry tile
  const kitchen = new THREE.PlaneGeometry(X1 - X0, FLOOR_SPLIT - BZ, 50, 18).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (BZ + FLOOR_SPLIT) / 2);
  mapUV(kitchen, (x, _y, z) => [x / (tw * 4), -z / (tw * 4)]);
  const worn = C('#d8b49a');
  paint(kitchen, (x, _y, z, out) => {
    out.setRGB(1, 1, 1);
    // dirt in the corners and along the walls, paler where people walk the aisle
    const edge = Math.min(x - X0, X1 - x, z - BZ);
    out.multiplyScalar(0.72 + 0.28 * smoothstep(0, 1.6, edge));
    const aisle = smoothstep(-5.2, -3.8, z) * smoothstep(-0.8, -2.2, z);
    mix(out, out, worn, aisle * 0.16 * (0.6 + 0.4 * noise3(x * 0.6, 1, z * 0.6)));
    out.multiplyScalar(0.94 + 0.08 * fbm3(x * 0.5, 2.5, z * 0.5));
  });
  const L = NEAR_Z - FLOOR_SPLIT;
  const dining = new THREE.PlaneGeometry(X1 - X0, L, 40, 40).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (FLOOR_SPLIT + NEAR_Z) / 2);
  // boards run toward the camera: grain along z; one texture covers 8 boards = 3.6 units
  mapUV(dining, (x, _y, z) => [z / 7, x / 3.6]);
  paint(dining, (x, _y, z, out) => {
    out.setRGB(1, 1, 1);
    // a worn path along the stools, darker toward the walls
    const edge = Math.min(x - X0, X1 - x);
    out.multiplyScalar(0.75 + 0.25 * smoothstep(0, 2.0, edge));
    out.multiplyScalar(1 + smoothstep(3.2, 1.2, Math.abs(z - (FACE_Z + 1.0))) * 0.12 * (0.7 + 0.3 * noise3(x * 0.4, 7, 0)));
    // the far side of the dining room, toward the camera, sinks into shadow
    out.multiplyScalar(1 - smoothstep(2.5, 11, z) * 0.78);
  });
  const sill = new Merger().add(plank(X1 - X0, 0.03, 0.22, 0.012, [1 / 3, 1 / 3]), trs([(X0 + X1) / 2, 0.012, FLOOR_SPLIT])).build();
  return { kitchen, dining, sill };
}

export function Floors({ m }: { m: ReturnType<typeof shellMats> }) {
  const geo = useMemo(() => once('ramen:floors', floorGeometries), []);
  return (
    <group>
      <mesh geometry={geo.kitchen} material={m.quarry} receiveShadow userData={{ surface: 'floor' }} />
      <mesh geometry={geo.dining} material={m.boards} receiveShadow userData={{ surface: 'floor' }} />
      <mesh geometry={geo.sill} material={m.trim} receiveShadow />
    </group>
  );
}

// ---------- ceiling ----------

/** Cross beams' z positions: over the back line, the aisle, the counter and on toward the camera. */
export const BEAMS_Z = [BZ + 0.2, -3.2, -0.2, 3.0, 6.4, 10, 14, 18, 22];
const BEAM = { w: 0.42, h: 0.52 };

function ceilingGeometries() {
  const L = NEAR_Z - BZ;
  const boards = new THREE.PlaneGeometry(X1 - X0, L, 30, 40).rotateX(Math.PI / 2).translate((X0 + X1) / 2, CEIL, (BZ + NEAR_Z) / 2);
  // boards run along x, one texture = 6 boards over 2.4 units
  mapUV(boards, (x, _y, z) => [x / 7, z / 2.4]);
  paint(boards, (x, _y, z, out) => {
    out.setRGB(1, 1, 1);
    // smoke-darkened over the stove line, fading toward the customers' side
    out.multiplyScalar(0.7 + 0.3 * smoothstep(-6.4, 2, z));
    out.multiplyScalar(0.9 + 0.12 * fbm3(x * 0.3, 1, z * 0.3));
  });
  const beams = new Merger();
  const plates = new Merger();
  const r = rand(8);
  for (const z of BEAMS_Z) {
    const g = plank(X1 - X0 + 0.1, BEAM.h, BEAM.w, 0.05, [1 / 5, 1 / 5], 2, [r() * 3, r() * 3]);
    paint(g, (_x, y, _zz, out) => out.setScalar(0.85 + 0.15 * smoothstep(-0.2, 0.2, y)));
    // the beam against the back wall caps that wall in the top shot, so it always shows
    (z === BEAMS_Z[0] ? plates : beams).add(g, trs([(X0 + X1) / 2, CEIL - BEAM.h / 2, z]));
  }
  // wall plates along both sides (they cap the side walls when seen from above)
  for (const x of [X0 + 0.22, X1 - 0.22]) plates.add(plank(0.44, 0.36, L, 0.05, [1 / 5, 1 / 5]), trs([x, CEIL - 0.18, (BZ + NEAR_Z) / 2]));
  return { boards, beams: beams.build(), plates: plates.build() };
}

/** Shows its children only while the camera is below the ceiling (the top shot looks in from above). */
export function BelowCeiling({ children }: { children?: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (g.current) g.current.visible = camera.position.y < CEIL - 0.05;
  });
  // it hides itself: merged meshes of what's inside stay inside (tide/batch.ts)
  return (
    <group ref={g} userData={{ visToggle: true }}>
      {children}
    </group>
  );
}

/**
 * The boarded ceiling and its beams. The boards face down only, so from above
 * (the top shot) they vanish; the beams and anything hung from the ceiling hide
 * themselves whenever the camera rises above the ceiling.
 */
export function Ceiling({ m, children }: { m: ReturnType<typeof shellMats>; children?: React.ReactNode }) {
  const geo = useMemo(() => once('ramen:ceiling', ceilingGeometries), []);
  const above = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (above.current) above.current.visible = camera.position.y < CEIL - 0.05;
  });
  return (
    <group>
      <mesh geometry={geo.boards} material={m.ceiling} />
      <mesh geometry={geo.plates} material={m.beam} castShadow />
      <group ref={above} userData={{ visToggle: true }}>
        <mesh geometry={geo.beams} material={m.beam} castShadow />
        {children}
      </group>
    </group>
  );
}
