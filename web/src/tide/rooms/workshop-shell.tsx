import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { AISLE_Z, STATIONS } from '../workshop/plan';
import { BACK_BENCH, BACK_POSTS, BENCH, BRICK, CEIL, DOOR, DOORWAY, HEARTH, NEAR_Z, PLATE_H, POST_W, ROOM, SIDE_POSTS, STOVE, WAINSCOT_Y, WIN_BACK, WIN_SIDE } from './workshop-dims';
import { beamTex, brickTex, C, fbm3, floorTex, limeBump, limeTex, mapUV, Merger, mix, noise3, once, paint, paintedBoardsTex, plank, rand, sawdustTex, shadeBy, smoothstep, toyGrainTex, trs, V, wmat, woodTex } from './workshop-kit';

// The workshop's shell: limewashed walls over sage-painted boards, held in a
// frame of dark oak posts, braces and a top plate; honey pine floorboards
// drifted with sawdust and curls of shavings round the benches; a boarded
// ceiling on heavy beams and joists; and old brick behind the stove. The
// windows and the door are in workshop-openings.tsx.

const X0 = ROOM.x0;
const X1 = ROOM.x1;
const BZ = ROOM.back;

// ---------- materials ----------

export function shellMats() {
  return {
    lime: wmat('lime', () => new THREE.MeshStandardMaterial({ map: limeTex(), bumpMap: limeBump(), bumpScale: 0.6, roughness: 0.93, vertexColors: true })),
    boards: wmat('wainscot', () => new THREE.MeshStandardMaterial({ map: paintedBoardsTex('sage', '#7f9a7e', 14), roughness: 0.62, vertexColors: true })),
    trim: wmat('trim', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-trim', { w: 1024, h: 128, light: '#6a4628', dark: '#24130a', planks: 1, rings: 5, seed: 13, joints: false, seams: 0, figure: 0.2 }), roughness: 0.5, vertexColors: true })),
    timber: wmat('timber', () => new THREE.MeshStandardMaterial({ map: beamTex(), roughness: 0.7, vertexColors: true })),
    floor: wmat('floor', () => new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.7, vertexColors: true })),
    ceiling: wmat('ceiling', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-ceiling', { w: 1024, h: 512, light: '#a87e52', dark: '#4e321e', planks: 6, rings: 6, seed: 27 }), roughness: 0.85, vertexColors: true })),
    brick: wmat('brick', () => new THREE.MeshStandardMaterial({ map: brickTex(), roughness: 0.88, vertexColors: true })),
    slate: wmat('slate', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 })),
    sawdust: wmat('sawdust', () => new THREE.MeshStandardMaterial({ map: sawdustTex(), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    shavings: wmat('shavings', () => new THREE.MeshStandardMaterial({ map: toyGrainTex(), vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })),
  };
}
export type ShellMats = ReturnType<typeof shellMats>;

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
    mapUV(g, (x, y) => [x / 4, y / 4]);
    paint(g, (x, y, _z, out) => grime(x, y, out));
    merged.add(g, m);
  }
  return merged.build();
}

const SMOKE = C('#5a4430');
const DAMP = C('#9a8462');

/** Large-scale wear on the limewash: cloudy damp, darker corners and toward the ceiling, soot above the stove. */
function limeGrime(u: number, y: number, out: THREE.Color, o: { ends?: [number, number]; soot?: [number, number] } = {}) {
  out.setRGB(1, 1, 1);
  mix(out, out, DAMP, smoothstep(0.05, 0.4, fbm3(u * 0.3 + 4.1, y * 0.3, 2.3)) * 0.2);
  out.multiplyScalar(1 - smoothstep(CEIL - 1.8, CEIL, y) * 0.3);
  if (o.ends) out.multiplyScalar(1 - (smoothstep(o.ends[0] + 1.2, o.ends[0], u) + smoothstep(o.ends[1] - 1.2, o.ends[1], u)) * 0.24);
  if (o.soot) {
    const k = smoothstep(o.soot[1], o.soot[0], u) * smoothstep(2.0, 6.5, y);
    mix(out, out, SMOKE, k * (0.4 + 0.2 * noise3(u * 1.2, y * 0.8, 3)));
  }
  out.multiplyScalar(1 - smoothstep(WAINSCOT_Y + 0.5, WAINSCOT_Y, y) * 0.1);
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
  return wallFromRects(rects, trs([0, 0, BZ]), (u, y, out) => limeGrime(u, y, out, { ends: [X0, X1], soot: [X0, X0 + 2.6] }));
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
  return wallFromRects(rects, trs([X0, 0, 0], [0, Math.PI / 2, 0]), (u, y, out) => {
    limeGrime(u, y, out, { ends: [-NEAR_Z, -BZ], soot: [-BZ, -BZ - 2.4] });
    // the far side of the room, toward the camera, sinks into shadow
    out.multiplyScalar(1 - smoothstep(-3, -12, u) * 0.6);
  }, 0.4);
}

function rightWallGeometry() {
  const rects: Rect[] = [[BZ, NEAR_Z, 0, CEIL]];
  return wallFromRects(rects, trs([X1, 0, 0], [0, -Math.PI / 2, 0]), (u, y, out) => {
    limeGrime(u, y, out, { ends: [BZ, NEAR_Z] });
    out.multiplyScalar(1 - smoothstep(3, 12, u) * 0.6);
  }, 0.4);
}

/** Painted tongue-and-groove boards from the floor to the cap rail along a run (in the wall's frame), with a cap and a skirting. */
function wainscotRun(boards: Merger, trim: Merger, u0: number, u1: number, mtx: THREE.Matrix4, seed: number) {
  const w = u1 - u0;
  if (w <= 0.05) return;
  const h = WAINSCOT_Y - 0.1;
  const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.round(w / 0.3)), 4);
  g.translate((u0 + u1) / 2, h / 2, 0.022);
  // 8 boards of 0.15 per tile across the wall; the grain (u) runs up
  const off = rand(seed)();
  mapUV(g, (x, y) => [y / 2.6 + off, x / 1.2]);
  paint(g, (x, y, _z, out) => {
    out.setRGB(1, 1, 1);
    // scuffed and darker low down, where boots and brooms knock
    out.multiplyScalar(0.84 + 0.16 * smoothstep(0, 0.45, y));
    out.multiplyScalar(0.93 + 0.1 * fbm3(x * 0.6, y * 0.6, seed));
  });
  boards.add(g, mtx);
  // the cap rail, a bead under it and the skirting
  trim.add(plank(w + 0.02, 0.08, 0.1, 0.03, [1 / 3, 1 / 3]), new THREE.Matrix4().multiplyMatrices(mtx, trs([(u0 + u1) / 2, WAINSCOT_Y - 0.07, 0.05])));
  trim.add(plank(w + 0.02, 0.04, 0.06, 0.016, [1 / 3, 1 / 3]), new THREE.Matrix4().multiplyMatrices(mtx, trs([(u0 + u1) / 2, WAINSCOT_Y - 0.13, 0.045])));
  trim.add(plank(w + 0.02, 0.15, 0.07, 0.02, [1 / 3, 1 / 3]), new THREE.Matrix4().multiplyMatrices(mtx, trs([(u0 + u1) / 2, 0.075, 0.055])));
}

function wainscotGeometry() {
  const boards = new Merger();
  const trim = new Merger();
  const back = trs([0, 0, BZ]);
  // the back wall: under the window (beside the brick), behind the tool bench, either side of the door
  wainscotRun(boards, trim, BRICK.x1, BACK_BENCH.x0 - 0.02, back, 1);
  wainscotRun(boards, trim, BACK_BENCH.x0, BACK_BENCH.x1, back, 2);
  wainscotRun(boards, trim, BACK_BENCH.x1 + 0.02, DOORWAY.x0 - 0.2, back, 3);
  wainscotRun(boards, trim, DOORWAY.x1 + 0.2, X1, back, 4);
  // the side walls (the left one from the brick forward)
  wainscotRun(boards, trim, -NEAR_Z, -BRICK.z1, trs([X0, 0, 0], [0, Math.PI / 2, 0]), 5);
  wainscotRun(boards, trim, BZ, NEAR_Z, trs([X1, 0, 0], [0, -Math.PI / 2, 0]), 6);
  return { boards: boards.build(), trim: trim.build() };
}

/** The oak frame: posts in the walls, the top plate all round, knee braces, a sill beam over the window heads. */
function frameGeometry() {
  const m = new Merger();
  const r = rand(51);
  const tone = () => new THREE.Color().setScalar(0.82 + r() * 0.3);
  const ph = CEIL - PLATE_H;
  const post = (h: number) => plank(POST_W, h, 0.16, 0.03, [1 / 3.2, 1 / 0.9], 2, [r() * 3, r() * 3], true);
  // back wall posts (and the two corner posts)
  for (const x of [...BACK_POSTS, X0 + POST_W / 2, X1 - POST_W / 2]) m.add(post(ph), trs([x, ph / 2, BZ + 0.08]), tone());
  // side wall posts
  for (const z of SIDE_POSTS) {
    m.add(post(ph), trs([X0 + 0.08, ph / 2, z], [0, Math.PI / 2, 0]), tone());
    m.add(post(ph), trs([X1 - 0.08, ph / 2, z], [0, Math.PI / 2, 0]), tone());
  }
  // the top plate on all three walls
  const plateBack = plank(X1 - X0, PLATE_H, 0.26, 0.04, [1 / 4, 1 / 1.2], 2, [r(), r()]);
  m.add(plateBack, trs([(X0 + X1) / 2, ph + PLATE_H / 2, BZ + 0.13]), tone());
  for (const s of [-1, 1]) m.add(plank(NEAR_Z - BZ, PLATE_H, 0.26, 0.04, [1 / 4, 1 / 1.2], 2, [r(), r()]), trs([s < 0 ? X0 + 0.13 : X1 - 0.13, ph + PLATE_H / 2, (BZ + NEAR_Z) / 2], [0, Math.PI / 2, 0]), tone());
  // knee braces from the posts up to the plate, at 45 degrees
  const brace = (len: number) => plank(len, 0.2, 0.13, 0.025, [1 / 3.2, 1 / 0.9], 2, [r() * 3, r()]);
  const L = 1.25;
  for (const x of BACK_POSTS)
    for (const s of [-1, 1]) {
      const cx = x + s * (POST_W / 2 + (L / Math.SQRT2) / 2 - 0.05);
      m.add(brace(L), trs([cx, ph - (L / Math.SQRT2) / 2 + 0.05, BZ + 0.08], [0, 0, s * Math.PI / 4]), tone());
    }
  for (const z of SIDE_POSTS)
    for (const s of [-1, 1]) {
      const cz = z + s * (POST_W / 2 + (L / Math.SQRT2) / 2 - 0.05);
      for (const x of [X0 + 0.08, X1 - 0.08]) m.add(brace(L), trs([x, ph - (L / Math.SQRT2) / 2 + 0.05, cz], [0, Math.PI / 2, -s * Math.PI / 4]), tone());
    }
  // a rail along the back wall over the toy shelves, and one over the left window head
  m.add(plank(BACK_POSTS[1] - BACK_POSTS[0] - POST_W, 0.22, 0.14, 0.03, [1 / 4, 1 / 1.2], 2, [r(), r()]), trs([0, 6.45, BZ + 0.07]), tone());
  m.add(plank(WIN_SIDE.z1 - WIN_SIDE.z0 + 1.6, 0.22, 0.14, 0.03, [1 / 4, 1 / 1.2], 2, [r(), r()]), trs([X0 + 0.07, WIN_SIDE.y1 + 0.55, (WIN_SIDE.z0 + WIN_SIDE.z1) / 2], [0, Math.PI / 2, 0]), tone());
  // weathering, and soot near the stove, over the tones from the merge
  return shadeBy(m.build(), (x, y, z) => (0.92 + 0.12 * fbm3(x * 0.8, y * 0.8, z * 0.8)) * (1 - smoothstep(3.2, 0.5, Math.hypot(x - STOVE.x, z - STOVE.z)) * smoothstep(1.5, 6, y) * 0.25));
}

/** The heat shield of old brick in the stove's corner, sooty toward the top, with a slate hearth. */
function brickGeometry() {
  const m = new Merger();
  const top = BRICK.top;
  const back = new THREE.PlaneGeometry(BRICK.x1 - X0, top, 10, 8);
  back.translate((X0 + BRICK.x1) / 2, top / 2, BZ + 0.035);
  mapUV(back, (x, y) => [x / 1.6, y / 1.6]);
  const side = new THREE.PlaneGeometry(BRICK.z1 - BZ, top, 10, 8).rotateY(Math.PI / 2);
  side.translate(X0 + 0.035, top / 2, (BZ + BRICK.z1) / 2);
  mapUV(side, (_x, y, z) => [-z / 1.6, y / 1.6]);
  const soot = C('#2a1e16');
  const sootify = (g: THREE.BufferGeometry) =>
    paint(g, (x, y, z, out) => {
      out.setRGB(1, 1, 1);
      const d = Math.hypot(x - STOVE.x, z - STOVE.z);
      mix(out, out, soot, smoothstep(1.4, 0.2, d) * smoothstep(0.6, 2.1, y) * 0.55 + smoothstep(0.4, 0.8, fbm3(x * 2, y * 2, z * 2)) * 0.1);
    });
  m.add(sootify(back));
  m.add(sootify(side));
  // a brick-on-edge coping along the top of both panels
  const cap = new Merger();
  cap.add(plank(BRICK.x1 - X0 + 0.06, 0.1, 0.14, 0.02), trs([(X0 + BRICK.x1) / 2, top + 0.05, BZ + 0.07]));
  cap.add(plank(0.14, 0.1, BRICK.z1 - BZ + 0.06, 0.02), trs([X0 + 0.07, top + 0.05, (BZ + BRICK.z1) / 2]));
  const capG = cap.build();
  mapUV(capG, (x, y, z) => [(x + z) / 1.6, y / 1.6 + 0.02]);
  m.add(sootify(capG));
  return m.build();
}

/** The hearth: big slate slabs with a bevelled edge, laid in the corner under the stove. */
function hearthGeometry() {
  const m = new Merger();
  const r = rand(66);
  const { x0, x1, z0, z1 } = HEARTH;
  const n = 2;
  const slate = C('#3a3d40');
  const ash = C('#8a8278');
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const sw = (x1 - x0) / n;
      const sd = (z1 - z0) / n;
      const g = plank(sw - 0.02, 0.05, sd - 0.02, 0.015, 1, 2);
      const t = 0.75 + r() * 0.35;
      paint(g, (x, y, z, out) => {
        out.copy(slate).multiplyScalar(t * (0.85 + 0.25 * fbm3(x * 3 + i, y * 3, z * 3 + j)));
        // ash and scorch toward the stove
        const d = Math.hypot(x0 + sw * (i + 0.5) + x - STOVE.x, z0 + sd * (j + 0.5) + z - STOVE.z);
        mix(out, out, ash, smoothstep(0.9, 0.3, d) * 0.25);
      });
      m.add(g, trs([x0 + sw * (i + 0.5), 0.025, z0 + sd * (j + 0.5)]));
    }
  return m.build();
}

export function Walls({ m }: { m: ShellMats }) {
  const geo = useMemo(
    () =>
      once('ws:walls', () => ({
        back: backWallGeometry(),
        left: leftWallGeometry(),
        right: rightWallGeometry(),
        wainscot: wainscotGeometry(),
        frame: frameGeometry(),
        brick: brickGeometry(),
        hearth: hearthGeometry(),
      })),
    [],
  );
  return (
    <group>
      <mesh geometry={geo.back} material={m.lime} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.left} material={m.lime} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.right} material={m.lime} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.wainscot.boards} material={m.boards} receiveShadow userData={{ surface: 'wall' }} />
      <mesh geometry={geo.wainscot.trim} material={m.trim} receiveShadow />
      <mesh geometry={geo.frame} material={m.timber} castShadow receiveShadow />
      <mesh geometry={geo.brick} material={m.brick} receiveShadow />
      <mesh geometry={geo.hearth} material={m.slate} receiveShadow />
    </group>
  );
}

// ---------- floor ----------

/** Where sawdust lies thick: under and around the benches, and round the lathe. */
function dustAmount(x: number, z: number) {
  let k = 0;
  // the front benches: under them and spilling forward a little
  k += smoothstep(BENCH.x1 + 0.6, BENCH.x1 - 0.4, Math.abs(x)) * smoothstep(1.2, 0.2, Math.abs(z - (BENCH.back + BENCH.front) / 2 - 0.1));
  // behind them, where the makers stand
  k += 0.6 * smoothstep(BENCH.x1, BENCH.x1 - 1, Math.abs(x)) * smoothstep(0.7, 0.1, Math.abs(z + 1.75));
  // the tool bench, and the lathe at its left end
  k += 0.7 * smoothstep(BACK_BENCH.x1 + 0.3, BACK_BENCH.x1 - 0.6, Math.abs(x)) * smoothstep(1.0, 0.2, Math.abs(z - (BACK_BENCH.front - 0.1)));
  k += smoothstep(1.4, 0.3, Math.hypot(x + 6.4, z + 4.8));
  return Math.min(1, k);
}

function floorGeometry() {
  const L = NEAR_Z - BZ;
  const g = new THREE.PlaneGeometry(X1 - X0, L, 100, 80).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (BZ + NEAR_Z) / 2);
  // boards run toward the camera: grain along z, six boards of 0.45 per tile across
  mapUV(g, (x, _y, z) => [z / 7.2, x / 2.7]);
  const dust = C('#f0d6a4');
  const worn = C('#e8c49a');
  return paint(g, (x, _y, z, out) => {
    out.setRGB(1, 1, 1);
    // dirt along the walls and in the corners
    const edge = Math.min(x - X0, X1 - x, z - BZ);
    out.multiplyScalar(0.7 + 0.3 * smoothstep(0, 1.8, edge));
    // a paler worn path down the aisle and from the door
    const aisle = smoothstep(1.0, 0.2, Math.abs(z - AISLE_Z)) * smoothstep(BENCH.x1 + 3, BENCH.x1, -x);
    const door = smoothstep(0.9, 0.2, Math.abs(x - DOOR.x)) * smoothstep(AISLE_Z + 0.5, AISLE_Z - 0.5, z);
    mix(out, out, worn, Math.max(aisle, door) * 0.14 * (0.6 + 0.4 * noise3(x * 0.6, 1, z * 0.6)));
    // sawdust ground into the boards
    mix(out, out, dust, dustAmount(x, z) * 0.34 * (0.6 + 0.4 * noise3(x * 1.7, 4, z * 1.7)));
    out.multiplyScalar(0.8 + 0.07 * fbm3(x * 0.5, 2.5, z * 0.5));
    // the shop floor toward the camera sinks into shadow
    out.multiplyScalar(1 - smoothstep(2.5, 11, z) * 0.78);
  });
}

/** Sawdust lying on the boards: soft decals round the benches and the lathe. */
function sawdustGeometry() {
  const m = new Merger();
  const r = rand(91);
  const spots: [number, number, number, number][] = [];
  // under the front benches at each station, spilling forward
  for (const s of STATIONS.slice(0, 6)) spots.push([s.x + (r() - 0.5) * 0.6, -0.35 + (r() - 0.5) * 0.3, 1.9, 1.5]);
  // where the makers stand
  for (const s of STATIONS.slice(0, 6)) spots.push([s.x + (r() - 0.5) * 0.8, -1.9, 1.3, 0.9]);
  // the tool bench and round the lathe
  for (const s of STATIONS.slice(6)) spots.push([s.x + (r() - 0.5) * 0.5, -5.05, 1.6, 0.9]);
  spots.push([-6.3, -4.75, 2.2, 1.5], [-6.9, -5.6, 1.2, 0.9]);
  for (const [x, z, w, d] of spots) {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    m.add(g, trs([x, 0.004 + r() * 0.002, z], [0, r() * Math.PI * 2, 0], [w, 1, d]));
  }
  return m.build();
}

/** A curl of shaving: a thin ribbon wound into a loose spiral, lying on its side. */
function curl(r: () => number) {
  const turns = 1.1 + r() * 1.4;
  const n = Math.round(turns * 16);
  const w = 0.018 + r() * 0.02;
  const R0 = 0.012 + r() * 0.012;
  const grow = 0.0018 + r() * 0.0022;
  const pos: number[] = [];
  const idx: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    const R = R0 + grow * a;
    const x = Math.cos(a) * R;
    const y = Math.sin(a) * R + R0 + grow * turns * Math.PI * 2;
    const z = (t - 0.5) * w * 1.2;
    pos.push(x, y, z - w / 2, x, y, z + w / 2);
    uv.push(t * 2, 0, t * 2, 0.15);
    if (i < n) {
      const b = i * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Curls of shavings in drifts under the benches and round the lathe. */
function shavingsGeometry() {
  const m = new Merger();
  const r = rand(7);
  const tones = ['#f2dcb2', '#e8c896', '#d8b07a', '#f6e6c4', '#c89a64'];
  const drift = (cx: number, cz: number, n: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.7) * spread;
      const g = curl(r);
      const tone = tones[Math.floor(r() * tones.length) % tones.length];
      paint(g, (_x, _y, _z, out) => out.set(tone));
      // most lie on their side; some have rolled flat
      const flat = r() < 0.35;
      m.add(g, trs([cx + Math.cos(a) * d, flat ? 0.012 : 0, cz + Math.sin(a) * d * 0.6], [flat ? Math.PI / 2 : 0, r() * Math.PI * 2, (r() - 0.5) * 0.5], 0.9 + r() * 0.4));
    }
  };
  for (const s of STATIONS.slice(0, 6)) drift(s.x + (r() - 0.5) * 0.6, -0.5, 14, 0.75);
  for (const s of STATIONS.slice(0, 6)) drift(s.x + (r() - 0.5) * 0.8, -1.95, 6, 0.6);
  drift(-6.4, -4.75, 30, 0.8);
  drift(0.2, -5.0, 8, 0.5);
  drift(-4.2, -4.95, 6, 0.5);
  drift(4.1, -5.0, 6, 0.5);
  return m.build();
}

export function Floors({ m }: { m: ShellMats }) {
  const geo = useMemo(() => once('ws:floor', () => ({ floor: floorGeometry(), dust: sawdustGeometry(), shavings: shavingsGeometry() })), []);
  return (
    <group>
      <mesh geometry={geo.floor} material={m.floor} receiveShadow userData={{ surface: 'floor' }} />
      <mesh geometry={geo.dust} material={m.sawdust} receiveShadow renderOrder={1} />
      <mesh geometry={geo.shavings} material={m.shavings} castShadow receiveShadow />
    </group>
  );
}

// ---------- ceiling ----------

/** Cross beams' z positions: against the back wall, over the aisle, over the bench (the lamps hang from it), on toward the camera. */
export const BEAMS_Z = [-3.1, 0.0, 3.4, 6.8, 10.4, 14, 18, 22];
const BEAM = { w: 0.42, h: 0.55 };

function ceilingGeometries() {
  const L = NEAR_Z - BZ;
  const boards = new THREE.PlaneGeometry(X1 - X0, L, 30, 40).rotateX(Math.PI / 2).translate((X0 + X1) / 2, CEIL, (BZ + NEAR_Z) / 2);
  mapUV(boards, (x, _y, z) => [x / 7, z / 2.4]);
  paint(boards, (x, _y, z, out) => {
    out.setRGB(1, 1, 1);
    out.multiplyScalar(0.72 + 0.28 * smoothstep(-6.4, 2, z));
    out.multiplyScalar(0.9 + 0.12 * fbm3(x * 0.3, 1, z * 0.3));
    // smoke-darkened round the stovepipe
    out.multiplyScalar(1 - smoothstep(2.6, 0.3, Math.hypot(x - STOVE.x, z - STOVE.z)) * 0.4);
  });
  const beams = new Merger();
  const joists = new Merger();
  const r = rand(8);
  for (const z of BEAMS_Z) {
    const g = plank(X1 - X0 - 0.4, BEAM.h, BEAM.w, 0.05, [1 / 5, 1 / 1.4], 2, [r() * 3, r() * 3]);
    paint(g, (_x, y, _zz, out) => out.setScalar(0.82 + 0.18 * smoothstep(-0.25, 0.2, y)));
    beams.add(g, trs([(X0 + X1) / 2, CEIL - BEAM.h / 2, z]));
  }
  // joists along z, resting on the beams, under the boards
  for (let x = X0 + 0.9; x < X1 - 0.5; x += 1.05) {
    const g = plank(L, 0.2, 0.13, 0.02, [1 / 5, 1 / 1.4], 1, [r() * 3, r() * 3]);
    joists.add(g, trs([x, CEIL - 0.1, (BZ + NEAR_Z) / 2], [0, Math.PI / 2, 0]), new THREE.Color().setScalar(0.85 + r() * 0.25));
  }
  // iron straps where the beams meet the side plates
  const straps = new Merger();
  for (const z of BEAMS_Z.slice(0, 4))
    for (const x of [X0 + 0.5, X1 - 0.5]) {
      straps.add(plank(0.06, BEAM.h + 0.04, BEAM.w + 0.03, 0.01), trs([x, CEIL - BEAM.h / 2, z]));
      for (const dy of [-0.15, 0.15]) straps.add(new THREE.SphereGeometry(0.025, 8, 6), trs([x, CEIL - BEAM.h / 2 + dy, z + BEAM.w / 2 + 0.016]));
    }
  return { boards, beams: beams.build(), joists: joists.build(), straps: straps.build() };
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
 * The boarded ceiling with its beams and joists. The boards face down only,
 * so from above (the top shot) they vanish; the beams, joists and anything
 * hung from the ceiling hide whenever the camera rises above the ceiling.
 */
export function Ceiling({ m, children }: { m: ShellMats; children?: React.ReactNode }) {
  const geo = useMemo(() => once('ws:ceiling', ceilingGeometries), []);
  const iron = wmat('strap-iron', () => new THREE.MeshStandardMaterial({ color: '#26211d', metalness: 0.55, roughness: 0.55 }));
  return (
    <group>
      <mesh geometry={geo.boards} material={m.ceiling} />
      <BelowCeiling>
        <mesh geometry={geo.beams} material={m.timber} castShadow />
        <mesh geometry={geo.joists} material={m.timber} />
        <mesh geometry={geo.straps} material={iron} />
        {children}
      </BelowCeiling>
    </group>
  );
}

/** A hook screwed into a beam's underside, for things that hang (a small eye and screw). */
export function hookGeometry() {
  return once('ws:hook', () => {
    const m = new Merger();
    m.add(new THREE.TorusGeometry(0.03, 0.008, 6, 16), trs([0, -0.035, 0]));
    m.add(tubeThrough([V(0, 0, 0), V(0, -0.006, 0)], () => 0.01, 1, 6).geometry);
    return m.build();
  });
}
