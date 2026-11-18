import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { archOf, BACK_OPENINGS, CEIL, DOORWAY, headAt, NEAR_Z, type Opening, ROOM, SIDE_OPENING, WALL_T } from './office-dims';
import { BRICK_TILE, brickBump, brickTex, bumpTex, C, fbm3, HERRING_TILE, herringboneTex, mapUV, Merger, mix, noise3, omat, once, paint, paintedBrickTex, plank, rand, smoothstep, steelRough, trs, woodTex } from './office-kit';

// The office's shell: an old warehouse floor turned into a loft. Bare red
// brick on the back and left walls (arched heads of soldier bricks over the
// tall windows), a warm limewashed plaster wall on the right behind the
// reception, a herringbone oak floor worn paler along the walkways, and a
// ceiling of dark boards on timber joists with two black steel girders and a
// spiral duct running across. The windows and the door are in office-openings.

const X0 = ROOM.x0;
const X1 = ROOM.x1;
const BZ = ROOM.back;

// ---------- materials ----------

export function shellMats() {
  return {
    brick: omat('brick', () => new THREE.MeshStandardMaterial({ map: brickTex(), bumpMap: brickBump(), bumpScale: 2.2, roughness: 0.9, vertexColors: true })),
    archBrick: omat('arch-brick', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, bumpMap: bumpTex('o-brick-face', { scale: 5, contrast: 0.9 }), bumpScale: 1.2 })),
    mortar: omat('mortar', () => new THREE.MeshStandardMaterial({ color: '#5a5048', roughness: 0.95, bumpMap: bumpTex('o-mortar', { scale: 9, contrast: 1 }), bumpScale: 1 })),
    painted: omat('painted-brick', () => new THREE.MeshStandardMaterial({ map: paintedBrickTex(), bumpMap: brickBump(), bumpScale: 1.8, roughness: 0.86, vertexColors: true })),
    floor: omat('floor', () => new THREE.MeshStandardMaterial({ map: herringboneTex(), roughness: 0.46, vertexColors: true })),
    skirting: omat('skirting', () => new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.55, vertexColors: true })),
    ceiling: omat('ceiling', () => new THREE.MeshStandardMaterial({ map: woodTex('o-ceiling', { w: 1024, h: 512, light: '#6e4a30', dark: '#2a180e', planks: 6, rings: 6, seed: 87 }), roughness: 0.85, vertexColors: true })),
    joist: omat('joist', () => new THREE.MeshStandardMaterial({ map: woodTex('o-joist', { w: 1024, h: 256, light: '#8a5c38', dark: '#2a160a', planks: 2, rings: 9, seed: 91, joints: false, seams: 0.25 }), roughness: 0.7, vertexColors: true })),
    girder: omat('girder', () => new THREE.MeshStandardMaterial({ map: woodTex('o-girder', { w: 1024, h: 256, light: '#6e4428', dark: '#1e0f06', planks: 2, rings: 11, seed: 97, joints: false, seams: 0.3, figure: 0.6 }), roughness: 0.68, vertexColors: true })),
    iron: omat('iron', () => new THREE.MeshStandardMaterial({ color: '#1e1d1c', roughnessMap: steelRough(), roughness: 0.7, metalness: 0.6 })),
    duct: omat('duct', () => new THREE.MeshStandardMaterial({ color: '#8f9498', roughnessMap: steelRough(), roughness: 0.5, metalness: 0.85, vertexColors: true })),
  };
}
export type ShellMats = ReturnType<typeof shellMats>;

// ---------- walls ----------

type Rect = [number, number, number, number]; // u0, u1, y0, y1 in the wall's own frame
type Grime = (u: number, y: number, out: THREE.Color) => void;

/** Rectangles and polygons of wall (subdivided so vertex colours can carry grime), in the wall's frame, placed by a matrix. */
class WallBuilder {
  readonly m = new Merger();
  constructor(
    private place: THREE.Matrix4,
    private grime: Grime,
    private tile: [number, number],
    private step = 0.35,
  ) {}
  private finish(g: THREE.BufferGeometry) {
    mapUV(g, (x, y) => [x / this.tile[0], y / this.tile[1]]);
    paint(g, (x, y, _z, out) => this.grime(x, y, out));
    this.m.add(g, this.place);
  }
  rect([u0, u1, y0, y1]: Rect) {
    const w = u1 - u0;
    const h = y1 - y0;
    if (w <= 1e-4 || h <= 1e-4) return;
    const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.round(w / this.step)), Math.max(1, Math.round(h / this.step)));
    g.translate((u0 + u1) / 2, (y0 + y1) / 2, 0);
    this.finish(g);
  }
  poly(pts: [number, number][]) {
    const s = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
    this.finish(new THREE.ShapeGeometry(s));
  }
  /** The wall around an arched opening: below the sill, the two slivers beside the arch, and above the crown up to `top`. */
  opening(o: Opening, top: number) {
    this.rect([o.u0, o.u1, 0, o.y0]);
    this.rect([o.u0, o.u1, o.y1, top]);
    const a = archOf(o);
    const n = 14;
    for (const side of [-1, 1]) {
      const pts: [number, number][] = [];
      const edge = side < 0 ? o.u0 : o.u1;
      pts.push([edge, o.ys], [edge, o.y1], [a.cu, o.y1]);
      for (let i = 1; i < n; i++) {
        const u = a.cu + (edge - a.cu) * (i / n);
        pts.push([u, headAt(o, u)]);
      }
      if (side > 0) pts.reverse();
      this.poly(pts);
    }
  }
  build() {
    return this.m.build();
  }
}

const SOOT = C('#4a3a30');
const DAMP = C('#6a5a4a');

function brickGrime(u: number, y: number, out: THREE.Color, ends: [number, number]) {
  out.setRGB(1, 1, 1);
  // large soft blotches: the brick's own patina, and old damp
  const blot = fbm3(u * 0.22 + 3.1, y * 0.3, 1.7);
  mix(out, out, DAMP, smoothstep(0.0, 0.45, blot) * 0.3);
  out.multiplyScalar(0.92 + 0.14 * fbm3(u * 0.6, y * 0.6, 4.2));
  // darker toward the ceiling (old soot) and the corners, a damp band at the foot
  mix(out, out, SOOT, smoothstep(CEIL - 2.6, CEIL, y) * 0.45);
  out.multiplyScalar(1 - (smoothstep(ends[0] + 1.2, ends[0], u) + smoothstep(ends[1] - 1.2, ends[1], u)) * 0.25);
  out.multiplyScalar(1 - smoothstep(0.7, 0.0, y) * 0.22);
}

function plasterGrime(u: number, y: number, out: THREE.Color) {
  out.setRGB(1, 1, 1);
  const blot = fbm3(u * 0.3 + 9.1, y * 0.3, 2.9);
  mix(out, out, C('#a08c74'), smoothstep(0.05, 0.4, blot) * 0.3);
  out.multiplyScalar(1 - smoothstep(CEIL - 1.8, CEIL, y) * 0.3);
  out.multiplyScalar(1 - (smoothstep(BZ + 1.2, BZ, u) + smoothstep(10, NEAR_Z, u) * 0.6) * 0.25);
  out.multiplyScalar(1 - smoothstep(0.5, 0.0, y) * 0.15);
}

/** The back wall (u = x): three arched windows and the doorway. */
function backWallGeometry() {
  const w = new WallBuilder(trs([0, 0, BZ]), (u, y, out) => brickGrime(u, y, out, [X0, X1]), BRICK_TILE);
  const os = BACK_OPENINGS;
  w.rect([X0, os[0].u0, 0, CEIL]);
  for (let i = 0; i < os.length; i++) {
    w.opening(os[i], CEIL);
    w.rect([os[i].u1, i + 1 < os.length ? os[i + 1].u0 : DOORWAY.x0, 0, CEIL]);
  }
  w.rect([DOORWAY.x0, DOORWAY.x1, DOORWAY.top, CEIL]);
  w.rect([DOORWAY.x1, X1, 0, CEIL]);
  return w.build();
}

/** The left wall (u = -z, from the camera side to the back corner): the lounge window. */
function leftWallGeometry() {
  const w = new WallBuilder(trs([X0, 0, 0], [0, Math.PI / 2, 0]), (u, y, out) => brickGrime(u, y, out, [-NEAR_Z, -BZ]), BRICK_TILE);
  const o = SIDE_OPENING;
  w.rect([-NEAR_Z, o.u0, 0, CEIL]);
  w.opening(o, CEIL);
  w.rect([o.u1, -BZ, 0, CEIL]);
  return w.build();
}

/** The right wall (u = z): brick painted over in a warm off-white long ago. */
function rightWallGeometry() {
  const w = new WallBuilder(trs([X1, 0, 0], [0, -Math.PI / 2, 0]), plasterGrime, BRICK_TILE, 0.45);
  w.rect([BZ, NEAR_Z, 0, CEIL]);
  return w.build();
}

/**
 * The reveals of an arched opening (the wall's thickness): two jambs, the
 * curved soffit under the arch, in brick. In the opening's wall frame, the
 * room at +z, from the face (z = 0) back to z = -WALL_T.
 */
function revealGeometry(o: Opening, grime: Grime) {
  const m = new Merger();
  const d = WALL_T;
  const jh = o.ys - o.y0;
  for (const side of [-1, 1]) {
    const u = side < 0 ? o.u0 : o.u1;
    const g = new THREE.PlaneGeometry(d, jh, 2, Math.max(2, Math.round(jh / 0.35)));
    g.rotateY(side < 0 ? Math.PI / 2 : -Math.PI / 2);
    g.translate(u, (o.y0 + o.ys) / 2, -d / 2);
    mapUV(g, (_x, y, z) => [z / BRICK_TILE[0] + u * 0.37, y / BRICK_TILE[1]]);
    paint(g, (_x, y, _z, out) => grime(u, y, out));
    m.add(g);
  }
  // the soffit: strips following the arch, facing down toward the opening
  const a = archOf(o);
  const half = Math.asin((o.u1 - o.u0) / 2 / a.R);
  const n = 20;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -half + (2 * half * i) / n;
    const u = a.cu + Math.sin(t) * a.R;
    const y = a.cy + Math.cos(t) * a.R;
    for (const z of [0, -d]) {
      pos.push(u, y, z);
      uv.push(z / BRICK_TILE[0], (t * a.R) / BRICK_TILE[1]);
    }
  }
  for (let i = 0; i < n; i++) {
    const k = i * 2;
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const soffit = new THREE.BufferGeometry();
  soffit.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  soffit.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  soffit.setIndex(idx);
  soffit.computeVertexNormals();
  paint(soffit, (x, y, _z, out) => {
    grime(x, y, out);
    out.multiplyScalar(0.8);
  });
  m.add(soffit);
  return m.build();
}

/** A segmental arch of soldier bricks over an opening (and the mortar bed behind them), proud of the wall a little. */
function archGeometry(o: Opening, seed: number) {
  const bricks = new Merger();
  const bed = new Merger();
  const a = archOf(o);
  const half = Math.asin((o.u1 - o.u0) / 2 / a.R) + 0.02;
  const depthR = 0.44;
  const arc = 2 * half * (a.R + depthR / 2);
  const n = Math.max(9, Math.round(arc / 0.152));
  const r = rand(seed);
  const tones = ['#8e3f26', '#9a4a2c', '#7d3820', '#a3532f', '#86412a', '#6e3322', '#a8603a'];
  for (let i = 0; i < n; i++) {
    const t = -half + (2 * half * (i + 0.5)) / n;
    const rr = a.R + depthR / 2 + 0.01;
    const tw = ((2 * half) / n) * (a.R + depthR / 2) - 0.022;
    const g = plank(tw, depthR - 0.02, 0.11, 0.02, 1, 2);
    const tone = C(tones[Math.floor(r() * tones.length)]).multiplyScalar(0.82 + r() * 0.3);
    const dark = r() < 0.15;
    paint(g, (x, y, z, out) => {
      out.copy(tone);
      out.multiplyScalar(0.88 + 0.18 * noise3(x * 30 + i, y * 30, z * 30));
      if (dark) out.multiplyScalar(0.7 + 0.3 * smoothstep(0.2, -0.2, y));
    });
    bricks.add(g, trs([a.cu + Math.sin(t) * rr, a.cy + Math.cos(t) * rr, 0.035], [0, 0, -t]));
  }
  // the mortar bed: an annular band just in front of the wall face, behind the bricks
  const pos: number[] = [];
  const idx: number[] = [];
  const m = 24;
  for (let i = 0; i <= m; i++) {
    const t = -half + (2 * half * i) / m;
    for (const rr of [a.R, a.R + depthR + 0.01]) pos.push(a.cu + Math.sin(t) * rr, a.cy + Math.cos(t) * rr, 0.006);
  }
  for (let i = 0; i < m; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const band = new THREE.BufferGeometry();
  band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  band.setIndex(idx);
  band.computeVertexNormals();
  bed.add(band);
  return { bricks: bricks.build(), bed: bed.build() };
}

/** Dark skirting along the walls (but not across the doorway). */
function skirtingGeometry() {
  const m = new Merger();
  const h = 0.16;
  const t = 0.035;
  const run = (u0: number, u1: number, place: THREE.Matrix4) => {
    const g = plank(u1 - u0, h, t, 0.012, 1, 2);
    paint(g, (x, y, _z, out) => out.setScalar(0.85 + 0.15 * noise3(x * 2, y * 9, 1)));
    m.add(g, new THREE.Matrix4().multiplyMatrices(place, trs([(u0 + u1) / 2, h / 2, t / 2])));
  };
  run(X0, DOORWAY.x0 - 0.18, trs([0, 0, BZ]));
  run(DOORWAY.x1 + 0.18, X1, trs([0, 0, BZ]));
  run(-NEAR_Z, -BZ, trs([X0, 0, 0], [0, Math.PI / 2, 0]));
  run(BZ, NEAR_Z, trs([X1, 0, 0], [0, -Math.PI / 2, 0]));
  return m.build();
}

export function Walls({ m }: { m: ShellMats }) {
  const geo = useMemo(
    () =>
      once('office:walls', () => {
        const back = trs([0, 0, BZ]);
        const left = trs([X0, 0, 0], [0, Math.PI / 2, 0]);
        const reveals = new Merger();
        const archBricks = new Merger();
        const beds = new Merger();
        BACK_OPENINGS.forEach((o, i) => {
          reveals.add(revealGeometry(o, (u, y, out) => brickGrime(u, y, out, [X0, X1])), back);
          const a = archGeometry(o, 40 + i);
          archBricks.add(a.bricks, back);
          beds.add(a.bed, back);
        });
        reveals.add(revealGeometry(SIDE_OPENING, (u, y, out) => brickGrime(u, y, out, [-NEAR_Z, -BZ])), left);
        const sa = archGeometry(SIDE_OPENING, 47);
        archBricks.add(sa.bricks, left);
        beds.add(sa.bed, left);
        return {
          back: backWallGeometry(),
          left: leftWallGeometry(),
          right: rightWallGeometry(),
          reveals: reveals.build(),
          archBricks: archBricks.build(),
          beds: beds.build(),
          skirting: skirtingGeometry(),
        };
      }),
    [],
  );
  return (
    <group>
      <mesh geometry={geo.back} material={m.brick} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.left} material={m.brick} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.right} material={m.painted} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.reveals} material={m.brick} receiveShadow />
      <mesh geometry={geo.beds} material={m.mortar} receiveShadow />
      <mesh geometry={geo.archBricks} material={m.archBrick} receiveShadow />
      <mesh geometry={geo.skirting} material={m.skirting} receiveShadow />
    </group>
  );
}

// ---------- floor ----------

/** Where people walk most: the aisle between the rows, the path in from the door, the way to the lounge. */
function walked(x: number, z: number) {
  const aisle = smoothstep(-5.0, -3.9, z) * smoothstep(-1.4, -2.4, z) * smoothstep(-9.5, -7.5, x) * smoothstep(12.2, 11.0, x);
  const door = smoothstep(1.4, 0.4, Math.abs(x - DOORWAY.x0 - 0.95)) * smoothstep(-3.0, -4.0, z);
  const lounge = smoothstep(1.0, 0.3, Math.abs(z + 4.8)) * smoothstep(-12.0, -11.0, x) * smoothstep(-7.6, -8.6, x);
  return Math.min(1, aisle + door + lounge);
}

function floorGeometry() {
  const g = new THREE.PlaneGeometry(X1 - X0, NEAR_Z - BZ, 100, 112).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (BZ + NEAR_Z) / 2);
  mapUV(g, (x, _y, z) => [x / HERRING_TILE, -z / HERRING_TILE]);
  const worn = C('#ffe4c0');
  const dark = C('#5a3a24');
  return paint(g, (x, _y, z, out) => {
    out.setRGB(1, 1, 1);
    // big soft patches of older and newer finish
    out.multiplyScalar(0.9 + 0.14 * fbm3(x * 0.18, 1.3, z * 0.18));
    mix(out, out, dark, smoothstep(0.1, 0.5, fbm3(x * 0.35 + 5, 2.1, z * 0.35)) * 0.2);
    // paler and scuffed where people walk
    mix(out, out, worn, walked(x, z) * 0.16 * (0.7 + 0.3 * noise3(x * 1.5, 3, z * 1.5)));
    // darker along the walls and in the corners
    const edge = Math.min(x - X0, X1 - x, z - BZ);
    out.multiplyScalar(0.68 + 0.32 * smoothstep(0, 1.8, edge));
    // the part of the floor near the camera sinks into shadow
    out.multiplyScalar(1 - smoothstep(4.5, 15, z) * 0.82);
  });
}

export function Floors({ m }: { m: ShellMats }) {
  const geo = useMemo(() => once('office:floor', floorGeometry), []);
  return <mesh geometry={geo} material={m.floor} receiveShadow userData={{ surface: 'floor' }} />;
}

// ---------- ceiling ----------

/** The joists' spacing along x, and the two steel girders' depths (z) they rest on. */
const JOIST = { step: 0.92, w: 0.16, h: 0.34 };
export const GIRDERS_Z = [-3.15, 1.6];
const GIRDER = { h: 0.42, flange: 0.32 };
/** The spiral duct running across the room over the back desk. */
export const DUCT = { z: -4.85, y: CEIL - GIRDER.h - 0.62, r: 0.36 };

/** Box-projected UVs with the grain running along z on every long face (for joists and rails that run front to back). */
export function grainAlongZ(g: THREE.BufferGeometry, s: number, offset: [number, number] = [0, 0]) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const [u, v] = az >= ax && az >= ay ? [x, y] : ay >= ax ? [z, x] : [z, y];
    uv[i * 2] = u * s + offset[0];
    uv[i * 2 + 1] = v * s + offset[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function ceilingGeometries() {
  const L = NEAR_Z - BZ;
  const boards = new THREE.PlaneGeometry(X1 - X0, L, 40, 40).rotateX(Math.PI / 2).translate((X0 + X1) / 2, CEIL, (BZ + NEAR_Z) / 2);
  // boards run along z between the joists: one texture = 6 boards over 2.2 units
  mapUV(boards, (x, _y, z) => [z / 6, x / 2.2]);
  paint(boards, (x, _y, z, out) => {
    out.setRGB(1, 1, 1);
    out.multiplyScalar(0.62 + 0.28 * smoothstep(-6.4, 3, z));
    out.multiplyScalar(0.9 + 0.12 * fbm3(x * 0.3, 1, z * 0.3));
    out.multiplyScalar(1 - smoothstep(6, 18, z) * 0.6);
  });
  // joists running front to back, sitting on the girders, their tops at the boards
  const joists = new Merger();
  const r = rand(14);
  const n = Math.floor((X1 - X0) / JOIST.step);
  for (let i = 0; i <= n; i++) {
    const x = X0 + 0.3 + i * ((X1 - X0 - 0.6) / n);
    const g = grainAlongZ(plank(JOIST.w, JOIST.h, L, 0.02, 1, 1), 1 / 5, [r() * 3, r() * 3]);
    paint(g, (_x, y, z, out) => {
      out.setScalar(0.8 + 0.2 * smoothstep(-0.15, 0.15, y));
      out.multiplyScalar(1 - smoothstep(6, 18, z + (BZ + NEAR_Z) / 2) * 0.6);
    });
    joists.add(g, trs([x, CEIL - JOIST.h / 2, (BZ + NEAR_Z) / 2]));
  }
  // heavy timber girders across the room under the joists, joined with iron strap plates and bolts
  const beams = new Merger();
  const iron = new Merger();
  const gy = CEIL - JOIST.h - GIRDER.h / 2;
  for (const z of GIRDERS_Z) {
    const b = plank(X1 - X0, GIRDER.h, GIRDER.flange, 0.03, [1 / 6, 1 / 6], 2, [r() * 3, r() * 3]);
    paint(b, (x, y, zz, out) => {
      out.setScalar(0.82 + 0.18 * smoothstep(-0.2, 0.2, y));
      out.multiplyScalar(0.9 + 0.14 * noise3(x * 0.7, y * 3, zz * 3 + z));
      // checks (splits) along the grain here and there
      out.multiplyScalar(1 - smoothstep(0.012, 0.0, Math.abs(y - 0.05 * Math.sin(x * 0.4))) * smoothstep(0.3, 0.6, noise3(x * 0.3, 1, z)) * 0.5);
    });
    beams.add(b, trs([(X0 + X1) / 2, gy, z]));
    for (const x of [-8.4, 0, 8.4]) {
      for (const s of [-1, 1]) iron.add(plank(0.5, GIRDER.h * 0.8, 0.012, 0.004, 1, 1), trs([x, gy, z + s * (GIRDER.flange / 2 + 0.006)]));
      for (const bx of [-0.17, 0, 0.17])
        for (const by of [-0.12, 0.12]) for (const s of [-1, 1]) iron.add(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8).rotateX(Math.PI / 2), trs([x + bx, gy + by, z + s * (GIRDER.flange / 2 + 0.015)]));
    }
  }
  return { boards, joists: joists.build(), beams: beams.build(), iron: iron.build() };
}

function ductGeometry() {
  const m = new Merger();
  const L = X1 - X0 - 0.2;
  const tube = new THREE.CylinderGeometry(DUCT.r, DUCT.r, L, 40, Math.round(L / 0.12), true).rotateZ(Math.PI / 2);
  // the spiral lock seam: a slim raised helix, and a sheen that varies along it
  paint(tube, (x, y, z, out) => {
    const a = Math.atan2(z, y);
    const ph = (x / 0.42 + a / (Math.PI * 2)) % 1;
    const seam = smoothstep(0.06, 0.0, Math.abs(ph - 0.5) - 0.0);
    out.setScalar(0.82 + 0.12 * noise3(x * 0.8, y * 3, z * 3) - seam * 0.25);
  });
  m.add(tube, trs([(X0 + X1) / 2, 0, 0]));
  // joint collars every few metres, hanger straps up to the joists
  for (let x = X0 + 1.0; x < X1 - 0.5; x += 3.1) {
    const collar = new THREE.CylinderGeometry(DUCT.r + 0.02, DUCT.r + 0.02, 0.07, 40, 1, true).rotateZ(Math.PI / 2);
    m.add(paint(collar, (_x, _y, _z, out) => out.setScalar(0.7)), trs([x, 0, 0]));
    const strap = new THREE.TorusGeometry(DUCT.r + 0.025, 0.012, 6, 40, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI);
    m.add(paint(strap, (_x, _y, _z, out) => out.setScalar(0.5)), trs([x + 0.5, 0, 0]));
    for (const s of [-1, 1]) m.add(paint(new THREE.BoxGeometry(0.018, CEIL - JOIST.h - DUCT.y, 0.04), (_x, _y, _z, out) => out.setScalar(0.5)), trs([x + 0.5, (CEIL - JOIST.h - DUCT.y) / 2, s * (DUCT.r + 0.025)]));
  }
  // round diffusers under it, over the back desk
  for (const x of [-4, 0, 4]) {
    const neck = new THREE.CylinderGeometry(0.16, 0.16, 0.18, 28, 1, true);
    m.add(paint(neck, (_x, _y, _z, out) => out.setScalar(0.75)), trs([x, -DUCT.r - 0.06, 0]));
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.CylinderGeometry(0.12 + k * 0.07, 0.2 + k * 0.08, 0.035, 32, 1, true);
      m.add(paint(cone, (_x, _y, _z, out) => out.setScalar(0.9 - k * 0.06)), trs([x, -DUCT.r - 0.16 - k * 0.03, 0]));
    }
    m.add(paint(new THREE.CircleGeometry(0.12, 24).rotateX(Math.PI / 2), (_x, _y, _z, out) => out.setScalar(0.25)), trs([x, -DUCT.r - 0.14, 0]));
  }
  return m.build();
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

/** The boarded ceiling (it faces down only, so it vanishes from above), the joists, girders and the duct (hidden from above). */
export function Ceiling({ m, children }: { m: ShellMats; children?: React.ReactNode }) {
  const geo = useMemo(() => once('office:ceiling', ceilingGeometries), []);
  const duct = useMemo(() => once('office:duct', ductGeometry), []);
  return (
    <group>
      <mesh geometry={geo.boards} material={m.ceiling} />
      <BelowCeiling>
        <mesh geometry={geo.joists} material={m.joist} />
        <mesh geometry={geo.beams} material={m.girder} castShadow />
        <mesh geometry={geo.iron} material={m.iron} />
        <mesh geometry={duct} material={m.duct} position={[0, DUCT.y, DUCT.z]} />
        {children}
      </BelowCeiling>
    </group>
  );
}
