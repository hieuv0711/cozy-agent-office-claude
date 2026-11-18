import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { WindowWeather } from '../weather';
import { CEIL, DOORWAY, REVEAL, ROOM, SILL_OUT, WIN_BACK, WIN_SIDE } from './ramen-dims';
import { bumpTex, fbm3, mat, Merger, noise3, once, paint, plank, rand, smoothLathe, smoothstep, tex, trs, V, woodTex } from './ramen-kit';
import { OutsideViews } from './ramen-outside';
import { BelowCeiling } from './ramen-shell';

// The openings in the walls: two wooden sliding windows (the night street
// outside, the weather on the glass), the doorway to the back with its noren
// curtain and a dim passage beyond, and the short noren valance hung across
// the front of the kitchen from the beam over the counter.

const BZ = ROOM.back;

export function openingMats() {
  return {
    frame: mat('o:frame', () => new THREE.MeshStandardMaterial({ map: woodTex('window', { w: 512, h: 128, light: '#5e3b22', dark: '#1e0f06', planks: 1, rings: 6, seed: 7, joints: false, seams: 0 }), roughness: 0.5, vertexColors: true })),
    sill: mat('o:sill', () => new THREE.MeshStandardMaterial({ map: woodTex('sill', { w: 1024, h: 256, light: '#8f5e36', dark: '#3a1d0c', planks: 1, rings: 8, seed: 70, joints: false, seams: 0 }), roughness: 0.48, vertexColors: true })),
    reveal: mat('o:reveal', () => new THREE.MeshStandardMaterial({ color: '#c8b28c', roughness: 0.92, bumpMap: bumpTex('reveal', { scale: 3, contrast: 0.5 }), bumpScale: 0.4 })),
    glass: mat('o:glass', () => new THREE.MeshPhysicalMaterial({ color: '#a9bfd8', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false })),
    blind: mat('o:blind', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })),
    cloth: mat('o:noren', () => new THREE.MeshStandardMaterial({ map: norenTex(), bumpMap: bumpTex('cloth', { scale: 12, contrast: 0.5 }), bumpScale: 0.3, roughness: 0.92, side: THREE.DoubleSide })),
    valance: mat('o:valance', () => new THREE.MeshStandardMaterial({ map: valanceTex(), bumpMap: bumpTex('cloth', { scale: 12, contrast: 0.5 }), bumpScale: 0.3, roughness: 0.92, side: THREE.DoubleSide })),
    rod: mat('o:rod', () => new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: 0.5 })),
    passage: mat('o:passage', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })),
    shoji: mat('o:shoji', () => new THREE.MeshBasicMaterial({ map: shojiTex(), toneMapped: false, color: new THREE.Color(0.85, 0.8, 0.72) })),
  };
}
type OMats = ReturnType<typeof openingMats>;

// ---------- cloth textures ----------

/** Indigo noren for the doorway: a white wave band at the hem and a big pale ring motif split by the slits. */
function norenTex() {
  return tex('noren-door', 1024, 1024, (g, w, h) => {
    indigoGround(g, w, h, 11);
    // a wide pale circle (a moon over waves), cut by the two slits when hung
    g.strokeStyle = 'rgba(236,232,220,0.92)';
    g.lineWidth = 34;
    g.beginPath();
    g.arc(w / 2, h * 0.4, w * 0.26, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 10;
    g.beginPath();
    g.arc(w / 2, h * 0.4, w * 0.2, 0, Math.PI * 2);
    g.stroke();
    waves(g, w, h * 0.78, h * 0.2, 7, 'rgba(236,232,220,0.92)');
    clothFinish(g, w, h, 12);
  });
}

/** The valance: one long indigo cloth across the kitchen, a band of white waves along the hem and long drifting clouds above. */
function valanceTex() {
  return tex('noren-valance', 2048, 256, (g, w, h) => {
    indigoGround(g, w, h, 5);
    const r = rand(4);
    g.strokeStyle = 'rgba(236,232,220,0.9)';
    g.fillStyle = 'rgba(236,232,220,0.9)';
    g.lineCap = 'round';
    // a few long clouds of different lengths, drifting across
    const clouds: [number, number, number, number][] = [
      [0.06, 0.34, 0.16, 1],
      [0.31, 0.24, 0.1, -1],
      [0.5, 0.38, 0.2, 1],
      [0.77, 0.26, 0.12, -1],
      [0.93, 0.36, 0.08, 1],
    ];
    for (const [u, v, len, dir] of clouds) longCloud(g, u * w, v * h, len * w, h * (0.13 + r() * 0.03), dir);
    waves(g, w, h * 0.6, h * 0.4, 4, 'rgba(236,232,220,0.92)');
    g.fillStyle = 'rgba(10,14,30,0.55)';
    g.fillRect(0, 0, w, h * 0.07);
    clothFinish(g, w, h, 13);
  });
}

/** A drifting cloud: a cluster of round puffs with a long tapering tail that curls at its end. */
function longCloud(g: CanvasRenderingContext2D, x: number, y: number, len: number, s: number, dir: number) {
  g.lineWidth = s * 0.16;
  const puffs = [
    [0, 0, 0.55],
    [s * 0.75, -s * 0.18, 0.7],
    [s * 1.55, 0.02 * s, 0.5],
  ];
  for (const [dx, dy, k] of puffs) {
    g.beginPath();
    g.arc(x + dir * dx, y + dy, s * k, Math.PI * 1.02, Math.PI * 1.98);
    g.stroke();
  }
  // the base line and the tail
  g.beginPath();
  g.moveTo(x - dir * s * 0.7, y + s * 0.12);
  g.lineTo(x + dir * (len - s * 0.5), y + s * 0.12);
  g.stroke();
  g.lineWidth = s * 0.1;
  g.beginPath();
  g.moveTo(x + dir * s * 0.2, y + s * 0.42);
  g.lineTo(x + dir * len * 0.75, y + s * 0.42);
  g.stroke();
  g.beginPath();
  g.arc(x + dir * (len - s * 0.5), y - s * 0.1, s * 0.22, dir > 0 ? -Math.PI * 0.5 : Math.PI * 1.5, dir > 0 ? Math.PI * 1.1 : Math.PI * -0.1, dir < 0);
  g.stroke();
}

export function indigoGround(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a2a4a');
  grad.addColorStop(1, '#22365a');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const r = rand(seed);
  // uneven dye: soft blotches and vertical streaks
  for (let i = 0; i < 60; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 30 + r() * 120;
    const b = g.createRadialGradient(x, y, 0, x, y, rad);
    b.addColorStop(0, r() < 0.5 ? 'rgba(60,80,120,0.12)' : 'rgba(5,10,25,0.14)');
    b.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = b;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '80,100,140' : '8,12,30'},0.08)`;
    g.fillRect(r() * w, 0, 1 + r() * 3, h);
  }
}

/** Rows of overlapping wave arcs (seigaiha), white on the ground, in a band. */
export function waves(g: CanvasRenderingContext2D, w: number, y0: number, bandH: number, rows: number, col: string) {
  const R = bandH / (rows * 0.5 + 0.5);
  g.save();
  g.beginPath();
  g.rect(0, y0, w, bandH);
  g.clip();
  for (let row = rows; row >= 0; row--) {
    const cy = y0 + row * R * 0.5 + R * 0.5;
    const off = row % 2 ? R : 0;
    for (let x = -2 * R + off; x < w + 2 * R; x += 2 * R) {
      for (let k = 0; k < 4; k++) {
        const rr = R * (1 - k * 0.24);
        g.fillStyle = k % 2 === 0 ? col : '#1d2f52';
        g.beginPath();
        g.arc(x, cy, rr, Math.PI, 0);
        g.fill();
      }
    }
  }
  g.restore();
}

/** Weave texture and a faded, softer edge on top of a painted cloth. */
export function clothFinish(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const r = rand(seed);
  for (let y = 0; y < h; y += 3) {
    g.fillStyle = `rgba(255,255,255,${0.015 + r() * 0.02})`;
    g.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += 3) {
    g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`;
    g.fillRect(x, 0, 1, h);
  }
  // sun-faded toward the hem
  const fade = g.createLinearGradient(0, h * 0.7, 0, h);
  fade.addColorStop(0, 'rgba(200,210,230,0)');
  fade.addColorStop(1, 'rgba(200,210,230,0.08)');
  g.fillStyle = fade;
  g.fillRect(0, 0, w, h);
}

/** A lit paper screen at the end of the passage: warm paper in a wooden lattice. */
function shojiTex() {
  return tex('shoji', 256, 512, (g, w, h) => {
    const grad = g.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.5, h * 0.6);
    grad.addColorStop(0, '#ffe2b0');
    grad.addColorStop(1, '#c98a4a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a2412';
    for (let x = 0; x <= w; x += w / 3) g.fillRect(x - 4, 0, 8, h);
    for (let y = 0; y <= h; y += h / 6) g.fillRect(0, y - 4, w, 8);
    g.fillRect(0, 0, w, 14);
    g.fillRect(0, h - 14, w, 14);
  });
}

// ---------- windows ----------

/** A wooden window in its own frame: the opening is w x h centred on the origin, the room is +z. */
function windowGeometries(w: number, h: number, seed: number) {
  const frame = new Merger();
  const r = rand(seed);
  const tone = () => new THREE.Color().setScalar(0.85 + r() * 0.3);
  const t = 0.12; // frame lumber
  const zF = -REVEAL + 0.1; // where the frame sits in the reveal
  // the box frame: head, sill rail, jambs
  frame.add(plank(w, t, 0.2, 0.02, [1 / 1.5, 1 / 1.5]), trs([0, h / 2 - t / 2, zF]), tone());
  frame.add(plank(w, t, 0.2, 0.02, [1 / 1.5, 1 / 1.5]), trs([0, -h / 2 + t / 2, zF]), tone());
  for (const s of [-1, 1]) frame.add(plank(t, h, 0.2, 0.02, [1 / 1.5, 1 / 1.5], 2, [0, 0], true), trs([(s * (w - t)) / 2, 0, zF]), tone());
  // two sliding sashes, overlapping in the middle, each 2 x 3 panes
  const iw = w - 2 * t;
  const ih = h - 2 * t;
  const sw = iw / 2 + 0.04;
  const st = 0.07;
  const bars: { x: number[]; y: number[] } = { x: [], y: [] };
  for (let k = 0; k < 2; k++) {
    const cx = (k === 0 ? -1 : 1) * (iw / 2 - sw / 2) + (k === 0 ? 0.0 : 0.0);
    const z = zF + (k === 0 ? 0.04 : -0.04);
    frame.add(plank(sw, st, 0.06, 0.01), trs([cx, ih / 2 - st / 2, z]), tone());
    frame.add(plank(sw, st, 0.06, 0.01), trs([cx, -ih / 2 + st / 2, z]), tone());
    for (const s of [-1, 1]) frame.add(plank(st, ih, 0.06, 0.01, [1 / 1.5, 1 / 1.5], 1, [0, 0], true), trs([cx + (s * (sw - st)) / 2, 0, z]), tone());
    // muntins: one upright, two cross bars
    frame.add(plank(0.035, ih - st * 2, 0.04, 0.008, [1 / 1.5, 1 / 1.5], 1, [0, 0], true), trs([cx, 0, z]), tone());
    for (const f of [-1 / 6, 1 / 6]) frame.add(plank(sw - st * 2, 0.035, 0.04, 0.008), trs([cx, f * (ih - st * 2) * 2, z]), tone());
    bars.x.push(cx - sw / 2 + st / 2, cx, cx + sw / 2 - st / 2);
  }
  bars.y.push(-(ih - st * 2) / 3, (ih - st * 2) / 3);
  // the reveal's four faces (plaster), from the wall face back to the frame
  const reveal = new Merger();
  const depth = REVEAL;
  reveal.add(new THREE.PlaneGeometry(depth, h).rotateY(Math.PI / 2), trs([-w / 2, 0, -depth / 2]));
  reveal.add(new THREE.PlaneGeometry(depth, h).rotateY(-Math.PI / 2), trs([w / 2, 0, -depth / 2]));
  reveal.add(new THREE.PlaneGeometry(w, depth).rotateX(Math.PI / 2), trs([0, h / 2, -depth / 2]));
  // the sill: a board running into the room with a bullnose, an apron under it
  const sill = new Merger();
  const apron = new Merger();
  const sd = depth + SILL_OUT;
  sill.add(plank(w + 0.5, 0.09, sd, 0.035, [1 / 2.2, 1 / 2.2]), trs([0, -h / 2 - 0.045, -depth + sd / 2]));
  apron.add(plank(w + 0.3, 0.26, 0.05, 0.015, [1 / 2.2, 1 / 2.2]), trs([0, -h / 2 - 0.22, 0.03]));
  // a casing round the opening on the wall
  for (const s of [-1, 1]) frame.add(plank(0.16, h + 0.16, 0.05, 0.015, [1 / 1.5, 1 / 1.5], 2, [0, 0], true), trs([(s * (w + 0.16)) / 2, 0.08, 0.025]), tone());
  frame.add(plank(w + 0.5, 0.16, 0.06, 0.015), trs([0, h / 2 + 0.08, 0.03]), tone());
  // a bamboo blind rolled up under the head, tied with two cords
  const blind = new Merger();
  const roll = new THREE.CylinderGeometry(0.075, 0.075, w - 0.1, 24, 1).rotateZ(Math.PI / 2);
  paint(roll, (x, y, z, out) => {
    const a = Math.atan2(y, z);
    out.set('#c9a86a').multiplyScalar(0.8 + 0.25 * (0.5 + 0.5 * Math.sin(a * 9 + x * 2)));
    out.multiplyScalar(0.9 + 0.1 * noise3(x * 30, 1, 2));
  });
  blind.add(roll, trs([0, h / 2 - 0.16, 0.08]));
  for (const x of [-w * 0.3, w * 0.3]) {
    const cord = tubeThrough([V(x, h / 2 - 0.02, 0.03), V(x, h / 2 - 0.16, 0.17), V(x, h / 2 - 0.28, 0.1), V(x + 0.02, h / 2 - 0.42, 0.11)], () => 0.009, 16, 5).geometry;
    paint(cord, (_x, _y, _z, out) => out.set('#7a2a1e'));
    blind.add(cord);
  }
  return { frame: frame.build(), reveal: reveal.build(), sill: sill.build(), apron: apron.build(), blind: blind.build(), bars, pane: { w: iw, h: ih, z: zF } };
}

function RoomWindow({ placement, w, h, seed, m }: { placement: THREE.Matrix4; w: number; h: number; seed: number; m: OMats }) {
  const g = useMemo(() => once(`ramen:window:${w}:${h}:${seed}`, () => windowGeometries(w, h, seed)), [w, h, seed]);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  useMemo(() => placement.decompose(pos, quat, new THREE.Vector3()), [placement, pos, quat]);
  return (
    <group position={pos} quaternion={quat}>
      <mesh geometry={g.frame} material={m.frame} castShadow receiveShadow />
      <mesh geometry={g.reveal} material={m.reveal} receiveShadow />
      <mesh geometry={g.sill} material={m.sill} castShadow receiveShadow userData={{ surface: 'sill' }} />
      <mesh geometry={g.apron} material={m.sill} receiveShadow />
      <mesh geometry={g.blind} material={m.blind} castShadow />
      {/* the glass between the two sashes' muntins, the weather just inside it */}
      <mesh material={m.glass} position={[0, 0, g.pane.z - 0.075]} renderOrder={3}>
        <planeGeometry args={[g.pane.w, g.pane.h]} />
      </mesh>
      <group position={[0, 0, g.pane.z - 0.068]}>
        <WindowWeather width={g.pane.w} height={g.pane.h} bars={g.bars} warm="#ffc890" cool="#7f9cc8" />
      </group>
    </group>
  );
}

/** Where the window centres are, and the matrices that put a window's own frame there. */
export const WINDOW_PLACES = {
  back: trs([(WIN_BACK.x0 + WIN_BACK.x1) / 2, (WIN_BACK.y0 + WIN_BACK.y1) / 2, BZ]),
  side: trs([ROOM.x0, (WIN_SIDE.y0 + WIN_SIDE.y1) / 2, (WIN_SIDE.z0 + WIN_SIDE.z1) / 2], [0, Math.PI / 2, 0]),
};

export function Windows() {
  const m = openingMats();
  return (
    <group>
      <RoomWindow placement={WINDOW_PLACES.back} w={WIN_BACK.x1 - WIN_BACK.x0} h={WIN_BACK.y1 - WIN_BACK.y0} seed={3} m={m} />
      <RoomWindow placement={WINDOW_PLACES.side} w={WIN_SIDE.z1 - WIN_SIDE.z0} h={WIN_SIDE.y1 - WIN_SIDE.y0} seed={5} m={m} />
      {/* the street outside can only be seen through the windows: skip it in the top shot */}
      <BelowCeiling>
        <OutsideViews />
      </BelowCeiling>
    </group>
  );
}

// ---------- cloth that sways ----------

export type Panel = { geo: THREE.PlaneGeometry; rest: Float32Array; x: number; ph: number };

/** Panels of cloth hung from a rod along x at y = 0, `drop` long, swaying a little. UVs span the whole curtain. */
export function useCloth(panels: { x: number; w: number }[], drop: number, uvSpan: [number, number], seed: number) {
  return useMemo(() => {
    const r = rand(seed);
    const total = uvSpan[1] - uvSpan[0];
    return panels.map((p): Panel => {
      const geo = new THREE.PlaneGeometry(p.w, drop, 10, 14);
      geo.translate(0, -drop / 2, 0);
      const uv = geo.attributes.uv;
      const pos = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (p.x + pos.getX(i) - uvSpan[0]) / total);
      // a little fullness: soft vertical folds
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / p.w) * Math.PI * 3 + p.x) * 0.018);
      geo.computeVertexNormals();
      return { geo, rest: Float32Array.from(pos.array as Float32Array), x: p.x, ph: r() * 6 };
    });
  }, [panels, drop, uvSpan, seed]);
}

let swayCalls = 0;
export function swayCloth(panels: Panel[], t: number, amount: number, drop: number) {
  // the sway is small: its shading only needs a fresh look every few frames
  const normals = swayCalls++ % 6 === 0;
  for (const p of panels) {
    const pos = p.geo.attributes.position;
    const a = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const x = p.rest[i * 3];
      const y = p.rest[i * 3 + 1];
      const k = Math.max(0, -y / drop) ** 1.6;
      a[i * 3 + 2] = p.rest[i * 3 + 2] + k * amount * (Math.sin(t * 0.7 + p.ph + x * 0.8) * 0.7 + Math.sin(t * 1.9 + p.ph * 2 + x * 3) * 0.3);
      a[i * 3] = x + k * amount * 0.3 * Math.sin(t * 0.5 + p.ph);
    }
    pos.needsUpdate = true;
    if (normals) p.geo.computeVertexNormals();
  }
}

// ---------- the doorway ----------

function doorFrameGeometry() {
  const m = new Merger();
  const r = rand(19);
  const { x0, x1, top } = DOORWAY;
  const tone = () => new THREE.Color().setScalar(0.85 + r() * 0.3);
  for (const x of [x0 - 0.09, x1 + 0.09]) m.add(plank(0.18, top + 0.05, 0.16, 0.02, [1 / 1.5, 1 / 1.5], 2, [r(), r()], true), trs([x, (top + 0.05) / 2, BZ + 0.06]), tone());
  m.add(plank(x1 - x0 + 0.6, 0.24, 0.2, 0.025), trs([(x0 + x1) / 2, top + 0.12, BZ + 0.08]), tone());
  // the reveal's jambs (the wall's thickness) and a wooden threshold
  for (const x of [x0 + 0.03, x1 - 0.03]) m.add(plank(0.06, top, 0.42, 0.01, [1 / 1.5, 1 / 1.5], 1, [r(), r()], true), trs([x, top / 2, BZ - 0.21]), tone());
  m.add(plank(x1 - x0, 0.04, 0.5, 0.012), trs([(x0 + x1) / 2, 0.02, BZ - 0.15]), tone());
  return m.build();
}

/** A short dim passage behind the doorway: a lit paper screen at its end, shelves on one side. */
function passageGeometry() {
  const { x0, x1, top } = DOORWAY;
  const depth = 3.2;
  const m = new Merger();
  const z0 = BZ - 0.42;
  const z1 = z0 - depth;
  const shade = (g: THREE.BufferGeometry, base: string) =>
    paint(g, (x, y, z, out) => {
      out.set(base);
      // brighter toward the lit screen at the end, a soft warm falloff
      const k = smoothstep(z0, z1, z);
      out.multiplyScalar(0.25 + 0.75 * k * k);
      out.multiplyScalar(0.85 + 0.2 * noise3(x * 2, y * 2, z * 2));
    });
  const w = x1 - x0;
  const side = new THREE.PlaneGeometry(depth, top + 0.4, 8, 6);
  m.add(shade(side.clone().rotateY(Math.PI / 2).translate(x0 - 0.2, (top + 0.4) / 2, (z0 + z1) / 2), '#7a6450'));
  m.add(shade(side.clone().rotateY(-Math.PI / 2).translate(x1 + 0.2, (top + 0.4) / 2, (z0 + z1) / 2), '#7a6450'));
  m.add(shade(new THREE.PlaneGeometry(w + 0.4, depth, 6, 8).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2), '#4a2f22'));
  m.add(shade(new THREE.PlaneGeometry(w + 0.4, depth, 6, 8).rotateX(Math.PI / 2).translate((x0 + x1) / 2, top + 0.4, (z0 + z1) / 2), '#3a2a1e'));
  // shelves of boxes and a hanging apron on the left side
  const r = rand(23);
  for (const y of [1.1, 2.0, 2.9]) {
    m.add(shade(plank(0.36, 0.05, depth - 0.6).translate(x0 - 0.02, y, (z0 + z1) / 2), '#6a4a30'));
    for (let k = 0; k < 3; k++) {
      const bz = z0 - 0.5 - k * 0.8 - r() * 0.2;
      const bh = 0.25 + r() * 0.3;
      m.add(shade(plank(0.3, bh, 0.4 + r() * 0.2, 0.02).translate(x0 - 0.02, y + 0.025 + bh / 2, bz), r() < 0.5 ? '#9a7a54' : '#c8b08a'));
    }
  }
  const apron = new THREE.PlaneGeometry(0.5, 1.0, 2, 4).rotateY(-Math.PI / 2 + 0.2).translate(x1 + 0.1, 2.4, z0 - 1.1);
  m.add(shade(apron, '#2d4a6a'));
  return { walls: m.build(), screen: { x: (x0 + x1) / 2, y: top / 2 + 0.2, z: z1 + 0.02, w: w + 0.3, h: top + 0.2 } };
}

const NOREN_DROP = 1.95;

export function Doorway() {
  const m = openingMats();
  const frame = useMemo(() => once('ramen:door-frame', doorFrameGeometry), []);
  const passage = useMemo(() => once('ramen:passage', passageGeometry), []);
  const { x0, x1, top } = DOORWAY;
  const w = x1 - x0;
  const panels = useMemo(() => {
    const n = 3;
    const pw = (w + 0.1) / n;
    return Array.from({ length: n }, (_, i) => ({ x: x0 - 0.05 + pw * (i + 0.5), w: pw - 0.03 }));
  }, [x0, w]);
  const span = useMemo<[number, number]>(() => [x0 - 0.05, x1 + 0.05], [x0, x1]);
  const cloth = useCloth(panels, NOREN_DROP, span, 2);
  useFrame(({ clock }) => swayCloth(cloth, clock.elapsedTime, 0.035, NOREN_DROP));
  const rod = useMemo(() => once('ramen:door-rod', () => tubeThrough([V(x0 - 0.15, 0, 0), V(x1 + 0.15, 0, 0)], () => 0.028, 2, 12).geometry), [x0, x1]);
  return (
    <group>
      <mesh geometry={frame} material={m.frame} castShadow receiveShadow />
      <BelowCeiling>
        <mesh geometry={passage.walls} material={m.passage} />
        <mesh material={m.shoji} position={[passage.screen.x, passage.screen.y, passage.screen.z]}>
          <planeGeometry args={[passage.screen.w, passage.screen.h]} />
        </mesh>
      </BelowCeiling>
      <group position={[0, top - 0.08, BZ + 0.14]}>
        <mesh geometry={rod} material={m.rod} castShadow />
        {cloth.map((p, i) => (
          <mesh key={i} geometry={p.geo} material={m.cloth} position={[p.x, -0.03, 0]} castShadow receiveShadow />
        ))}
      </group>
    </group>
  );
}

// ---------- the valance over the counter ----------

/** The beam over the customers' side that carries the valance. */
export const HEADER = { z: 1.75, h: 0.5, drop: 1.15 };

/** Two big red paper lanterns hung from the header beam, framing the counter. They glow; the room's lights do the lighting. */
export function HeaderLanterns() {
  const g = useMemo(
    () =>
      once('ramen:header-lanterns', () => {
        const n = 48;
        const globe = smoothLathe(
          [
            [0.16, -0.48],
            [0.3, -0.42],
            [0.38, -0.24],
            [0.4, 0],
            [0.38, 0.24],
            [0.3, 0.42],
            [0.16, 0.48],
          ],
          n,
          44,
        );
        const uv = globe.attributes.uv;
        const p = globe.attributes.position;
        for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) + 0.48) / 0.96);
        const caps = new Merger();
        for (const y of [0.48, -0.48])
          caps.add(
            smoothLathe(
              [
                [0.12, y - 0.05],
                [0.19, y - 0.05],
                [0.2, y],
                [0.19, y + 0.05],
                [0.12, y + 0.05],
              ],
              10,
              32,
            ),
          );
        caps.add(tubeThrough([V(0, -0.53, 0), V(0, -0.7, 0.004)], () => 0.012, 4, 5).geometry);
        caps.add(new THREE.ConeGeometry(0.045, 0.16, 12).translate(0, -0.76, 0));
        return { globe, caps: caps.build() };
      }),
    [],
  );
  const paper = mat('header-lantern', () => new THREE.MeshStandardMaterial({ map: headerLanternTex(), emissiveMap: headerLanternTex(), emissive: new THREE.Color('#ff6a3a'), emissiveIntensity: 1.35, roughness: 0.85, side: THREE.DoubleSide }));
  const lacquer = mat('lacquer', () => new THREE.MeshPhysicalMaterial({ color: '#1a1412', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }));
  const cord = mat('pendant-cord', () => new THREE.MeshStandardMaterial({ color: '#1d1a17', roughness: 0.75 }));
  const y = CEIL - HEADER.h - 1.05;
  return (
    <group>
      {[-10.0, 10.0].map((x) => (
        <group key={x} position={[x, y, HEADER.z + 0.45]}>
          <mesh geometry={g.globe} material={paper} />
          <mesh geometry={g.caps} material={lacquer} />
          <mesh material={cord} position={[0, 0.5 + (CEIL - HEADER.h - y - 0.5) / 2, 0]}>
            <cylinderGeometry args={[0.012, 0.012, CEIL - HEADER.h - y - 0.5, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Red paper with black bands and a loose wave pattern (no words). */
function headerLanternTex() {
  return tex('header-lantern', 512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#5e100a');
    grad.addColorStop(0.2, '#c82a1a');
    grad.addColorStop(0.5, '#ee4a28');
    grad.addColorStop(0.8, '#c82a1a');
    grad.addColorStop(1, '#5e100a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let k = 1; k < 16; k++) {
      g.fillStyle = 'rgba(50,6,4,0.32)';
      g.fillRect(0, (k / 16) * h - 1.5, w, 3);
    }
    g.fillStyle = 'rgba(16,6,4,0.92)';
    g.fillRect(0, 0, w, h * 0.08);
    g.fillRect(0, h * 0.92, w, h * 0.08);
    g.strokeStyle = 'rgba(24,6,4,0.78)';
    g.lineCap = 'round';
    for (const [yy, amp, lw, ph] of [
      [0.42, 0.08, 9, 0],
      [0.6, 0.06, 5, 1.2],
    ] as [number, number, number, number][]) {
      g.lineWidth = lw;
      g.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const py = h * yy + Math.sin((x / w) * Math.PI * 8 + ph) * h * amp;
        if (x === 0) g.moveTo(x, py);
        else g.lineTo(x, py);
      }
      g.stroke();
    }
  });
}

export function Valance() {
  const m = openingMats();
  const x0 = ROOM.x0;
  const x1 = ROOM.x1;
  const n = 12;
  const panels = useMemo(() => {
    const pw = (x1 - x0) / n;
    return Array.from({ length: n }, (_, i) => ({ x: x0 + pw * (i + 0.5), w: pw - 0.05 }));
  }, [x0, x1]);
  // one texture across the whole valance
  const span = useMemo<[number, number]>(() => [x0, x1], [x0, x1]);
  const cloth = useCloth(panels, HEADER.drop, span, 6);
  useFrame(({ clock }) => swayCloth(cloth, clock.elapsedTime * 0.8, 0.02, HEADER.drop));
  const beam = useMemo(
    () =>
      once('ramen:header', () => {
        const g = plank(x1 - x0, HEADER.h, 0.4, 0.04, [1 / 5, 1 / 5]);
        return paint(g, (x, y, z, out) => out.setScalar(0.8 + 0.25 * fbm3(x * 0.4, y, z)));
      }),
    [x0, x1],
  );
  const rod = useMemo(() => once('ramen:valance-rod', () => tubeThrough([V(x0, 0, 0), V(x1, 0, 0)], () => 0.03, 2, 12).geometry), [x0, x1]);
  const beamMat = mat('beam', () => new THREE.MeshStandardMaterial({ map: woodTex('beam', { w: 1024, h: 256, light: '#5a3a24', dark: '#160c06', planks: 2, rings: 9, seed: 33, joints: false, seams: 0.2 }), roughness: 0.62, vertexColors: true }));
  const y = CEIL - HEADER.h;
  return (
    <group>
      <mesh geometry={beam} material={beamMat} position={[(x0 + x1) / 2, CEIL - HEADER.h / 2, HEADER.z]} castShadow />
      <group position={[0, y - 0.04, HEADER.z + 0.24]}>
        <mesh geometry={rod} material={m.rod} />
        {cloth.map((p, i) => (
          <mesh key={i} geometry={p.geo} material={m.valance} position={[p.x, -0.02, 0]} castShadow />
        ))}
      </group>
    </group>
  );
}

