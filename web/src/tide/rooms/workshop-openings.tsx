import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { WindowWeather } from '../weather';
import { swayCloth, useCloth } from './ramen-openings';
import { DOORWAY, REVEAL, ROOM, SILL_OUT, STORE_DEPTH, WIN_BACK, WIN_SIDE } from './workshop-dims';
import { bumpTex, fbm3, mapUV, Merger, noise3, once, paint, paintedBoardsTex, plank, rand, shadeBy, smoothstep, tex, trs, V, wmat, woodTex } from './workshop-kit';
import { OutsideViews } from './workshop-outside';
import { BelowCeiling } from './workshop-shell';

// The openings in the walls: two cream-painted cottage casements (the village
// at night outside, the weather on the glass) with gingham valances, and the
// back door, a ledged-and-braced oak door standing open onto the storeroom,
// where a stair climbs toward a warm light upstairs.

const BZ = ROOM.back;

/** Red and cream gingham with a scalloped, darker hem band. */
function ginghamTex() {
  return tex('ws-gingham', 512, 256, (g, w, h) => {
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, w, h);
    const s = 16;
    g.fillStyle = 'rgba(176,44,36,0.5)';
    for (let x = 0; x < w; x += s * 2) g.fillRect(x, 0, s, h * 0.86);
    for (let y = 0; y < h * 0.86; y += s * 2) g.fillRect(0, y, w, s);
    // the weave
    const r = rand(3);
    for (let y = 0; y < h; y += 2) {
      g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.03})`;
      g.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 2) {
      g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`;
      g.fillRect(x, 0, 1, h);
    }
    // a plain red band at the hem with a little white rickrack
    g.fillStyle = '#9a2a22';
    g.fillRect(0, h * 0.86, w, h * 0.14);
    g.strokeStyle = 'rgba(240,232,214,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.9 + ((x / 8) % 2 ? 6 : -2));
    g.stroke();
  });
}

export function openingMats() {
  return {
    frame: wmat('o:frame', () => new THREE.MeshStandardMaterial({ map: paintedBoardsTex('cream-frame', '#e2d6bc', 33, false, 0.72), roughness: 0.55, vertexColors: true })),
    sill: wmat('o:sill', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-sill', { w: 1024, h: 256, light: '#9a6a3c', dark: '#3e2210', planks: 1, rings: 8, seed: 70, joints: false, seams: 0 }), roughness: 0.48, vertexColors: true })),
    reveal: wmat('o:reveal', () => new THREE.MeshStandardMaterial({ color: '#d0b890', roughness: 0.92, bumpMap: bumpTex('ws-reveal', { scale: 3, contrast: 0.5 }), bumpScale: 0.4 })),
    glass: wmat('o:glass', () => new THREE.MeshPhysicalMaterial({ color: '#a9bfd8', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false })),
    cloth: wmat('o:gingham', () => new THREE.MeshStandardMaterial({ map: ginghamTex(), bumpMap: bumpTex('ws-cloth', { scale: 12, contrast: 0.5 }), bumpScale: 0.3, roughness: 0.9, side: THREE.DoubleSide })),
    brass: wmat('o:brass', () => new THREE.MeshStandardMaterial({ color: '#c09048', metalness: 0.9, roughness: 0.32 })),
    oak: wmat('o:oak', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-door', { w: 1024, h: 512, light: '#8a5c34', dark: '#2a160a', planks: 6, rings: 9, seed: 92, seams: 1.2, figure: 0.4 }), roughness: 0.58, vertexColors: true })),
    iron: wmat('o:iron', () => new THREE.MeshStandardMaterial({ color: '#1e1a17', metalness: 0.6, roughness: 0.5, vertexColors: true })),
    store: wmat('o:store', () => new THREE.MeshBasicMaterial({ map: woodTex('ws-store', { w: 512, h: 512, light: '#8a6a4a', dark: '#3a2616', planks: 4, rings: 5, seed: 18 }), vertexColors: true })),
    storeFlat: wmat('o:store-flat', () => new THREE.MeshBasicMaterial({ vertexColors: true })),
  };
}
type OMats = ReturnType<typeof openingMats>;

// ---------- windows ----------

/** A cottage window in its own frame: the opening is w x h centred on the origin, the room is +z. Two casements of 2 x 3 panes. */
function windowGeometries(w: number, h: number, seed: number) {
  const frame = new Merger();
  const r = rand(seed);
  const tone = () => new THREE.Color().setScalar(0.88 + r() * 0.2);
  const t = 0.12;
  const zF = -REVEAL + 0.1;
  const s = 1 / 1.4;
  frame.add(plank(w, t, 0.2, 0.02, [s, s], 2, [r(), r()]), trs([0, h / 2 - t / 2, zF]), tone());
  frame.add(plank(w, t, 0.2, 0.02, [s, s], 2, [r(), r()]), trs([0, -h / 2 + t / 2, zF]), tone());
  for (const sx of [-1, 1]) frame.add(plank(t, h, 0.2, 0.02, [s, s], 2, [r(), r()], true), trs([(sx * (w - t)) / 2, 0, zF]), tone());
  // the mullion between the two casements
  const mw = 0.1;
  frame.add(plank(mw, h - 2 * t, 0.2, 0.02, [s, s], 2, [r(), r()], true), trs([0, 0, zF]), tone());
  const iw = w - 2 * t;
  const ih = h - 2 * t;
  const cw = (iw - mw) / 2;
  const st = 0.075;
  const bars: { x: number[]; y: number[] } = { x: [], y: [] };
  for (const sx of [-1, 1]) {
    const cx = sx * (mw / 2 + cw / 2);
    const z = zF + 0.03;
    frame.add(plank(cw, st, 0.07, 0.012, [s, s], 1, [r(), r()]), trs([cx, ih / 2 - st / 2, z]), tone());
    frame.add(plank(cw, st * 1.3, 0.07, 0.012, [s, s], 1, [r(), r()]), trs([cx, -ih / 2 + (st * 1.3) / 2, z]), tone());
    for (const k of [-1, 1]) frame.add(plank(st, ih, 0.07, 0.012, [s, s], 1, [r(), r()], true), trs([cx + (k * (cw - st)) / 2, 0, z]), tone());
    // glazing bars: one upright, two across (2 x 3 panes)
    frame.add(plank(0.032, ih - st * 2, 0.045, 0.008, [s, s], 1, [r(), r()], true), trs([cx, 0, z]), tone());
    for (const f of [-1, 1]) frame.add(plank(cw - st * 2, 0.032, 0.045, 0.008, [s, s], 1, [r(), r()]), trs([cx, (f * (ih - st * 2.3)) / 6, z]), tone());
    bars.x.push(cx - cw / 2 + st / 2, cx, cx + cw / 2 - st / 2);
  }
  bars.x.push(0);
  bars.y.push(-(ih - st * 2.3) / 6, (ih - st * 2.3) / 6);
  // the reveal's faces (plaster), from the wall face back to the frame
  const reveal = new Merger();
  reveal.add(new THREE.PlaneGeometry(REVEAL, h).rotateY(Math.PI / 2), trs([-w / 2, 0, -REVEAL / 2]));
  reveal.add(new THREE.PlaneGeometry(REVEAL, h).rotateY(-Math.PI / 2), trs([w / 2, 0, -REVEAL / 2]));
  reveal.add(new THREE.PlaneGeometry(w, REVEAL).rotateX(Math.PI / 2), trs([0, h / 2, -REVEAL / 2]));
  // the deep sill and its apron
  const sill = new Merger();
  const apron = new Merger();
  const sd = REVEAL + SILL_OUT;
  sill.add(plank(w + 0.46, 0.085, sd, 0.035, [1 / 2.2, 1 / 2.2]), trs([0, -h / 2 - 0.0425, -REVEAL + sd / 2]));
  apron.add(plank(w + 0.3, 0.22, 0.05, 0.015, [1 / 2.2, 1 / 2.2]), trs([0, -h / 2 - 0.2, 0.025]));
  // the casing round the opening, with a little cornice over the head
  for (const sx of [-1, 1]) frame.add(plank(0.15, h + 0.12, 0.05, 0.015, [s, s], 2, [r(), r()], true), trs([(sx * (w + 0.15)) / 2, 0.06, 0.025]), tone());
  frame.add(plank(w + 0.44, 0.16, 0.06, 0.015, [s, s], 2, [r(), r()]), trs([0, h / 2 + 0.08, 0.03]), tone());
  frame.add(plank(w + 0.56, 0.06, 0.13, 0.02, [s, s], 2, [r(), r()]), trs([0, h / 2 + 0.19, 0.06]), tone());
  // a brass knob on each casement by the mullion
  const fittings = new Merger();
  for (const sx of [-1, 1]) fittings.add(new THREE.SphereGeometry(0.022, 10, 8), trs([sx * (mw / 2 + st / 2 + 0.01), -0.05, zF + 0.09]));
  return {
    frame: shadeBy(frame.build(), (x, y, z) => 0.92 + 0.12 * fbm3(x * 2, y * 2, z * 2)),
    reveal: reveal.build(),
    sill: sill.build(),
    apron: apron.build(),
    fittings: fittings.build(),
    bars,
    pane: { w: iw, h: ih, z: zF },
  };
}

const VALANCE_DROP = 0.5;

function Valance({ w, h, m, seed }: { w: number; h: number; m: OMats; seed: number }) {
  const panels = useMemo(() => {
    const n = 5;
    const pw = (w + 0.3) / n;
    return Array.from({ length: n }, (_, i) => ({ x: -(w + 0.3) / 2 + pw * (i + 0.5), w: pw + 0.02 }));
  }, [w]);
  const span = useMemo<[number, number]>(() => [-(w + 0.3) / 2, (w + 0.3) / 2], [w]);
  const cloth = useCloth(panels, VALANCE_DROP, span, seed);
  useFrame(({ clock }) => swayCloth(cloth, clock.elapsedTime * 0.6, 0.012, VALANCE_DROP));
  const rod = useMemo(() => once(`ws:valance-rod:${w}`, () => tubeThrough([V(-(w + 0.4) / 2, 0, 0), V((w + 0.4) / 2, 0, 0)], () => 0.018, 2, 10).geometry), [w]);
  return (
    <group position={[0, h / 2 + 0.06, 0.14]}>
      <mesh geometry={rod} material={m.brass} />
      {cloth.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={m.cloth} position={[p.x, -0.02, 0.01 * (i % 2)]} castShadow />
      ))}
    </group>
  );
}

function RoomWindow({ at, yaw, w, h, seed, m }: { at: [number, number, number]; yaw: number; w: number; h: number; seed: number; m: OMats }) {
  const g = useMemo(() => once(`ws:window:${w}:${h}:${seed}`, () => windowGeometries(w, h, seed)), [w, h, seed]);
  return (
    <group position={at} rotation={[0, yaw, 0]}>
      <mesh geometry={g.frame} material={m.frame} castShadow receiveShadow />
      <mesh geometry={g.reveal} material={m.reveal} receiveShadow />
      <mesh geometry={g.sill} material={m.sill} castShadow receiveShadow userData={{ surface: 'sill' }} />
      <mesh geometry={g.apron} material={m.sill} receiveShadow />
      <mesh geometry={g.fittings} material={m.brass} />
      <mesh material={m.glass} position={[0, 0, g.pane.z - 0.03]} renderOrder={3}>
        <planeGeometry args={[g.pane.w, g.pane.h]} />
      </mesh>
      <group position={[0, 0, g.pane.z - 0.022]}>
        <WindowWeather width={g.pane.w} height={g.pane.h} bars={g.bars} warm="#ffc890" cool="#7f9cc8" />
      </group>
      <Valance w={w} h={h} m={m} seed={seed} />
    </group>
  );
}

export function Windows() {
  const m = openingMats();
  return (
    <group>
      <RoomWindow at={[(WIN_BACK.x0 + WIN_BACK.x1) / 2, (WIN_BACK.y0 + WIN_BACK.y1) / 2, BZ]} yaw={0} w={WIN_BACK.x1 - WIN_BACK.x0} h={WIN_BACK.y1 - WIN_BACK.y0} seed={3} m={m} />
      <RoomWindow at={[ROOM.x0, (WIN_SIDE.y0 + WIN_SIDE.y1) / 2, (WIN_SIDE.z0 + WIN_SIDE.z1) / 2]} yaw={Math.PI / 2} w={WIN_SIDE.z1 - WIN_SIDE.z0} h={WIN_SIDE.y1 - WIN_SIDE.y0} seed={5} m={m} />
      {/* the village outside can only be seen through the windows: skip it in the top shot */}
      <BelowCeiling>
        <OutsideViews />
      </BelowCeiling>
    </group>
  );
}

// ---------- the back door ----------

const LEAF = { w: DOORWAY.x1 - DOORWAY.x0 - 0.06, h: DOORWAY.top - 0.05, t: 0.07 };
/** How far the door stands open (it swings out into the storeroom). */
const OPEN = 1.68;

function doorFrameGeometry() {
  const m = new Merger();
  const r = rand(19);
  const { x0, x1, top } = DOORWAY;
  const tone = () => new THREE.Color().setScalar(0.85 + r() * 0.25);
  // heavy oak posts, a lintel with a chamfer, the reveal's linings and a worn threshold
  for (const x of [x0 - 0.11, x1 + 0.11]) m.add(plank(0.22, top + 0.1, 0.18, 0.025, [1 / 1.6, 1 / 1.6], 2, [r(), r()], true), trs([x, (top + 0.1) / 2, BZ + 0.07]), tone());
  m.add(plank(x1 - x0 + 0.7, 0.3, 0.22, 0.03), trs([(x0 + x1) / 2, top + 0.15, BZ + 0.09]), tone());
  for (const x of [x0 + 0.03, x1 - 0.03]) m.add(plank(0.06, top, REVEAL, 0.01, [1 / 1.6, 1 / 1.6], 1, [r(), r()], true), trs([x, top / 2, BZ - REVEAL / 2]), tone());
  m.add(plank(x1 - x0, 0.06, REVEAL, 0.01), trs([(x0 + x1) / 2, top - 0.03, BZ - REVEAL / 2]), tone());
  const sill = plank(x1 - x0 + 0.1, 0.045, REVEAL + 0.16, 0.015);
  paint(sill, (x, _y, _z, out) => out.setScalar(0.75 + 0.3 * smoothstep(0.7, 0.0, Math.abs(x))));
  m.add(sill, trs([(x0 + x1) / 2, 0.022, BZ - REVEAL / 2 + 0.06]));
  return m.build();
}

/** The door leaf, hinged at its left edge (x = 0), standing on y = 0, its face toward +z when shut. */
function leafGeometries() {
  const boards = new Merger();
  const r = rand(27);
  const n = 6;
  const bw = LEAF.w / n;
  for (let i = 0; i < n; i++) {
    const g = plank(bw - 0.008, LEAF.h, LEAF.t, 0.012, [1 / 2.4, 1 / 2.4], 1, [r() * 3, r() * 3], true);
    boards.add(g, trs([bw * (i + 0.5), LEAF.h / 2, 0]), new THREE.Color().setScalar(0.85 + r() * 0.25));
  }
  // ledges and a brace on the back face (toward -z when shut)
  for (const y of [0.45, LEAF.h / 2, LEAF.h - 0.45]) boards.add(plank(LEAF.w - 0.1, 0.2, 0.05, 0.015), trs([LEAF.w / 2, y, -LEAF.t / 2 - 0.025]));
  for (const [ya, yb] of [
    [0.45, LEAF.h / 2],
    [LEAF.h / 2, LEAF.h - 0.45],
  ]) {
    const dx = LEAF.w - 0.3;
    const dy = yb - ya;
    const len = Math.hypot(dx, dy);
    boards.add(plank(len, 0.17, 0.045, 0.015), trs([LEAF.w / 2, (ya + yb) / 2, -LEAF.t / 2 - 0.025], [0, 0, Math.atan2(dy, -dx)]));
  }
  const iron = new Merger();
  // long strap hinges on the face, a ring latch
  for (const y of [0.45, LEAF.h - 0.45]) {
    const strap = new THREE.Shape();
    strap.moveTo(0, -0.04);
    strap.lineTo(LEAF.w * 0.62, -0.025);
    strap.quadraticCurveTo(LEAF.w * 0.7, 0, LEAF.w * 0.62, 0.025);
    strap.lineTo(0, 0.04);
    strap.closePath();
    iron.add(new THREE.ExtrudeGeometry(strap, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 }), trs([0.02, y, LEAF.t / 2]));
    for (let k = 0; k < 4; k++) iron.add(new THREE.SphereGeometry(0.014, 8, 6), trs([0.12 + k * LEAF.w * 0.15, y, LEAF.t / 2 + 0.018]));
  }
  iron.add(new THREE.TorusGeometry(0.07, 0.012, 8, 24), trs([LEAF.w - 0.2, 1.75, LEAF.t / 2 + 0.03]));
  iron.add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16).rotateX(Math.PI / 2), trs([LEAF.w - 0.2, 1.84, LEAF.t / 2 + 0.015]));
  return { boards: shadeBy(boards.build(), (x, y) => 0.9 + 0.14 * fbm3(x * 2, y * 0.6, 1.3) - smoothstep(0.6, 0, y) * 0.1), iron: iron.build() };
}

/**
 * The storeroom behind the door, painted with its own light (it is beyond the
 * room's lamps): plank walls and floor, shelves of timber and boxes on the
 * left, a stair climbing away on the right toward a warm lamp upstairs.
 */
function storeGeometries() {
  const { x0, x1, top } = DOORWAY;
  const z0 = BZ - REVEAL;
  const z1 = z0 - STORE_DEPTH;
  const xl = x0 - 0.3;
  const xr = x1 + 1.3;
  const H = top + 1.4;
  const wood = new Merger();
  const flat = new Merger();
  // light: a lamp upstairs at the top of the stair, spilling down; dark by the door
  const lamp = new THREE.Vector3(xr - 0.5, H + 0.6, z1 + 0.8);
  // a wall lantern just inside the door, on the right, lights the near end
  const sconce = new THREE.Vector3(x1 + 0.75, 3.0, z0 - 0.9);
  const lit = (g: THREE.BufferGeometry, base: string) =>
    paint(g, (x, y, z, out) => {
      out.set(base);
      const d = Math.hypot(x - lamp.x, y - lamp.y, z - lamp.z);
      const e = Math.hypot(x - sconce.x, (y - sconce.y) * 0.8, z - sconce.z);
      const warm = 0.3 + 1.25 / (1 + d * d * 0.25) + 1.15 / (1 + e * e * 0.45);
      out.multiplyScalar(warm * (0.85 + 0.25 * noise3(x * 2, y * 2, z * 2)));
      out.r *= 1.1;
      out.b *= 0.82;
    });
  const plane = (w: number, h: number) => new THREE.PlaneGeometry(w, h, 6, 6);
  const leftWall = plane(STORE_DEPTH, H).rotateY(Math.PI / 2).translate(xl, H / 2, (z0 + z1) / 2);
  mapUV(leftWall, (_x, y, z) => [y / 2.2, z / 1.6]);
  wood.add(lit(leftWall, '#b49272'));
  const rightWall = plane(STORE_DEPTH, H + 3).rotateY(-Math.PI / 2).translate(xr, (H + 3) / 2, (z0 + z1) / 2);
  mapUV(rightWall, (_x, y, z) => [y / 2.2, z / 1.6]);
  wood.add(lit(rightWall, '#b49272'));
  const backWall = plane(xr - xl, H + 3).translate((xl + xr) / 2, (H + 3) / 2, z1);
  mapUV(backWall, (x, y) => [y / 2.2, x / 1.6]);
  wood.add(lit(backWall, '#a88664'));
  const floor = plane(xr - xl, STORE_DEPTH).rotateX(-Math.PI / 2).translate((xl + xr) / 2, 0.002, (z0 + z1) / 2);
  mapUV(floor, (x, _y, z) => [z / 2.4, x / 1.6]);
  wood.add(lit(floor, '#7a5a3c'));
  const ceil = plane(xr - xl - 1.3, STORE_DEPTH).rotateX(Math.PI / 2).translate((xl + xr - 1.3) / 2, H, (z0 + z1) / 2);
  flat.add(lit(ceil, '#3a2a1e'));
  // the stair: treads and risers climbing away along the right wall, a stringer and a handrail
  const steps = 9;
  const sw = 1.1;
  const sx = xr - sw / 2 - 0.02;
  for (let i = 0; i < steps; i++) {
    const y = (i + 1) * 0.5;
    const z = z0 - 0.6 - i * 0.36;
    const tread = plank(sw, 0.06, 0.4, 0.015, [1 / 1.6, 1 / 1.6]);
    wood.add(lit(tread.translate(sx, y, z), '#a07a52'));
    const riser = plank(sw - 0.02, 0.5, 0.03, 0.008);
    wood.add(lit(riser.translate(sx, y - 0.25, z + 0.19), '#6a4a30'));
  }
  const strLen = Math.hypot(steps * 0.36, steps * 0.5);
  const stringer = plank(strLen + 0.4, 0.28, 0.06, 0.02, [1 / 1.6, 1 / 1.6]);
  stringer.rotateX(0).rotateY(Math.PI / 2);
  wood.add(lit(stringer.rotateX(Math.atan2(steps * 0.5, steps * 0.36)).translate(sx - sw / 2 - 0.03, steps * 0.25 + 0.05, z0 - 0.6 - steps * 0.18), '#6a4a30'));
  const rail = tubeThrough([V(sx - sw / 2 + 0.05, 1.55, z0 - 0.45), V(sx - sw / 2 + 0.05, 1.55 + steps * 0.5, z0 - 0.6 - steps * 0.36)], () => 0.035, 2, 8).geometry;
  wood.add(lit(rail, '#8a5a32'));
  for (let i = 0; i < steps; i += 2) {
    const y = (i + 1) * 0.5;
    const z = z0 - 0.6 - i * 0.36;
    wood.add(lit(new THREE.CylinderGeometry(0.022, 0.022, 1.05, 6).translate(sx - sw / 2 + 0.05, y + 0.55, z), '#7a5232'));
  }
  // shelves on the left wall: long boards, boxes, a coil of rope, paint tins
  const r = rand(23);
  for (const y of [0.9, 1.75, 2.6, 3.45]) {
    wood.add(lit(plank(0.42, 0.05, STORE_DEPTH - 0.5, 0.01, [1 / 1.6, 1 / 1.6]).translate(xl + 0.21, y, (z0 + z1) / 2 - 0.1), '#8a6a48'));
    for (let k = 0; k < 4; k++) {
      const bz = z0 - 0.5 - k * 0.8 - r() * 0.2;
      const bh = 0.2 + r() * 0.35;
      const tones = ['#b08a5a', '#c8a678', '#8a4a32', '#4a6a8a', '#d8c8a0'];
      flat.add(lit(plank(0.34, bh, 0.36 + r() * 0.2, 0.02).translate(xl + 0.2, y + 0.025 + bh / 2, bz), tones[Math.floor(r() * tones.length)]));
    }
  }
  // boards leaning against the back wall
  for (let k = 0; k < 6; k++) {
    const bx = xl + 0.7 + k * 0.17;
    const len = 2.6 + r() * 1.2;
    wood.add(lit(plank(0.14, len, 0.04, 0.01, [1 / 1.6, 1 / 1.6], 1, [r(), r()], true).rotateX(-0.12).translate(bx, len / 2, z1 + 0.25), k % 2 ? '#c09a6a' : '#8a5a3a'));
  }
  // the lamp upstairs: a bright glow on the landing's wall
  const glow = plane(1.4, 1.2).translate(lamp.x - 0.1, lamp.y - 0.3, z1 + 0.02);
  paint(glow, (x, y, _z, out) => {
    const d = Math.hypot((x - lamp.x + 0.1) / 0.7, (y - lamp.y + 0.3) / 0.6);
    out.set('#ffd9a0').multiplyScalar(0.4 + 1.2 * smoothstep(1, 0, d));
  });
  flat.add(glow);
  // the wall lantern itself: a little glowing box on a bracket
  const lantern = plank(0.16, 0.24, 0.16, 0.02).translate(sconce.x + 0.4, sconce.y, sconce.z);
  paint(lantern, (_x, y, _z, out) => out.set('#ffd28a').multiplyScalar(1.4 - Math.abs(y - sconce.y) * 1.2));
  flat.add(lantern);
  const lgl = plane(0.9, 0.9).rotateY(-Math.PI / 2).translate(xr - 0.01, sconce.y, sconce.z);
  paint(lgl, (_x, y, z, out) => out.set('#ffcf8a').multiplyScalar(0.3 + 0.9 * smoothstep(0.45, 0, Math.hypot(y - sconce.y, z - sconce.z))));
  flat.add(lgl);
  return { wood: wood.build(), flat: flat.build() };
}

export function Doorway() {
  const m = openingMats();
  const frame = useMemo(() => once('ws:door-frame', doorFrameGeometry), []);
  const leaf = useMemo(() => once('ws:door-leaf', leafGeometries), []);
  const store = useMemo(() => once('ws:store', storeGeometries), []);
  return (
    <group>
      <mesh geometry={frame} material={m.oak} castShadow receiveShadow />
      {/* the door, standing open into the storeroom */}
      <group position={[DOORWAY.x0 + 0.04, 0, BZ - REVEAL + 0.02]} rotation={[0, OPEN, 0]}>
        <mesh geometry={leaf.boards} material={m.oak} castShadow receiveShadow />
        <mesh geometry={leaf.iron} material={m.iron} castShadow />
      </group>
      <BelowCeiling>
        <mesh geometry={store.wood} material={m.store} />
        <mesh geometry={store.flat} material={m.storeFlat} />
      </BelowCeiling>
    </group>
  );
}

