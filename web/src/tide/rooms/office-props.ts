import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { C, Merger, mix, noise3, omat, once, paint, paintLathe, plank, rand, smoothLathe, smoothstep, trs, V } from './office-kit';

// Small things the office is furnished with, built from code and shared by the
// desks, the reception, the lounge and the catalog: cloth-bound books with
// banded spines and cream page edges (in rows, stacks and leaning), clay and
// glazed pots with soil, echeveria rosettes, ribbed cacti, pen cups full of
// pencils, sticky-note pads and lever-arch binders. Everything is vertex
// coloured, about 1.6x real size like the people's props, and stands on
// y = 0. Nothing carries words.

export function propMats() {
  return {
    vc: omat('p:vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66 })),
    glaze: omat('p:glaze', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 })),
    leaf: omat('p:leaf', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, side: THREE.DoubleSide })),
    metal: omat('p:metal', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.32 })),
    paper: omat('p:paper', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })),
  };
}
export type PropMats = ReturnType<typeof propMats>;

// ---------- books ----------

export const BOOK_COLOURS = ['#7a2a22', '#24405e', '#2f5a3e', '#8a6a2a', '#5a2e4a', '#2a2a2e', '#a8502a', '#3e6a78', '#c9b48a', '#6a3a22', '#46523a', '#b88a3a', '#8c3a3a', '#2e4a4a'];
const PAGES = C('#e9dfc6');

/**
 * One book standing on its foot: spine facing +z, w thick (x), h tall, d deep.
 * The boards overhang the page block a little; the spine carries two or three
 * bands (gilt or dark) and the page edges are cream with a faint shadow line.
 */
export function bookGeometry(w: number, h: number, d: number, colour: string, r: () => number) {
  const m = new Merger();
  const cover = C(colour).multiplyScalar(0.85 + r() * 0.3);
  const board = 0.012;
  // the page block, set in from the boards on the three open sides
  const pages = plank(w - board * 2, h - 0.02, d - 0.012, 0.004, 1, 1);
  paint(pages, (x, y, _z, out) => {
    out.copy(PAGES).multiplyScalar(0.9 + 0.08 * Math.sin(y * 900 + x * 40) * 0.5 + 0.05 * noise3(x * 60, y * 60, 1));
  });
  m.add(pages, trs([0, h / 2, -0.004]));
  // the two boards and the rounded spine
  for (const s of [-1, 1]) {
    const b = plank(board, h, d, 0.004, 1, 1);
    paint(b, (_x, y, z, out) => out.copy(cover).multiplyScalar(0.92 + 0.08 * noise3(y * 30, z * 30, s)));
    m.add(b, trs([(s * (w - board)) / 2, h / 2, 0]));
  }
  const spine = new THREE.CylinderGeometry(w / 2, w / 2, h, 10, 1, false, -Math.PI / 2, Math.PI);
  const bands = r() < 0.75;
  const gilt = r() < 0.55 ? C('#d8b060') : cover.clone().multiplyScalar(0.45);
  const bandYs = [0.12 + r() * 0.06, 0.2 + r() * 0.06, 0.78 + r() * 0.08];
  paint(spine, (_x, y, _z, out) => {
    out.copy(cover);
    const t = y / h + 0.5;
    if (bands && bandYs.some((b) => Math.abs(t - b) < 0.012)) out.copy(gilt);
    // a darker label panel on some, blank
    if (bands && gilt.r < 0.5 && t > 0.42 && t < 0.62) out.multiplyScalar(0.8);
  });
  m.add(spine, trs([0, h / 2, d / 2 - 0.004], [0, 0, 0], [1, 1, 0.45]));
  return m.build();
}

/** A row of books standing on a shelf, from x = 0 along +x for `len`, spines toward +z, some leaning at the end. */
export function bookRow(len: number, seed: number, o: { hMin?: number; hMax?: number; d?: number; lean?: boolean } = {}) {
  const r = rand(seed);
  const m = new Merger();
  const hMin = o.hMin ?? 0.3;
  const hMax = o.hMax ?? 0.44;
  const d = o.d ?? 0.26;
  let x = 0;
  while (x < len) {
    const w = 0.035 + r() * 0.05;
    const h = hMin + r() * (hMax - hMin);
    if (x + w > len) break;
    const leanNext = o.lean !== false && x + w > len - 0.25 && r() < 0.6;
    const g = bookGeometry(w, h, d - r() * 0.04, BOOK_COLOURS[Math.floor(r() * BOOK_COLOURS.length)], r);
    if (leanNext) {
      // the last one leans on its neighbour
      const a = 0.32;
      m.add(g, trs([x + w / 2 + Math.sin(a) * h * 0.5, 0, 0], [0, 0, -a]));
      break;
    }
    m.add(g, trs([x + w / 2, 0, (r() - 0.5) * 0.02]));
    x += w + 0.002;
  }
  return m.build();
}

/** A stack of books lying flat, the biggest at the bottom, each turned a little. */
export function bookStack(n: number, seed: number, size = 1) {
  const r = rand(seed);
  const m = new Merger();
  let y = 0;
  for (let i = 0; i < n; i++) {
    const w = (0.07 + r() * 0.05) * size;
    const h = (0.42 - i * 0.03 - r() * 0.05) * size;
    const d = (0.3 - i * 0.015 - r() * 0.03) * size;
    const g = bookGeometry(w, h, d, BOOK_COLOURS[Math.floor(r() * BOOK_COLOURS.length)], r);
    // lay it on its side: spine toward +z still, cover up
    m.add(g, trs([(r() - 0.5) * 0.04 * size, y + w / 2, (r() - 0.5) * 0.04 * size], [0, (r() - 0.5) * 0.35, Math.PI / 2], 1, 'YXZ'));
    y += w;
  }
  return m.build();
}

// ---------- pots and small plants ----------

export const POT_GLAZES = ['#c06a3e', '#e8dfcc', '#2e4a3e', '#3a4a6a', '#a8522e', '#d8b45a'];

/** A pot with a rolled rim and soil, radius R and height H. Terracotta (bare clay) or glazed. */
export function potGeometry(R: number, H: number, glaze: string | null, seed: number) {
  const n = 40;
  const pot = smoothLathe(
    [
      [0, 0],
      [R * 0.72, 0],
      [R * 0.76, 0.01],
      [R * 0.86, H * 0.45],
      [R * 0.95, H * 0.84],
      [R * 1.06, H * 0.87],
      [R * 1.07, H],
      [R * 0.99, H + 0.004],
      [R * 0.95, H * 0.9],
      [0, H * 0.86],
    ],
    n,
    40,
  );
  const base = glaze ? C(glaze) : C('#b4643c');
  paintLathe(pot, n, (x, y, z, along, out) => {
    out.copy(base);
    if (glaze) {
      mix(out, out, base.clone().multiplyScalar(0.62), smoothstep(H * 0.5, 0.02, y) * 0.45);
      mix(out, out, C('#f2ead8'), smoothstep(H * 0.9, H, y) * 0.35 * (along < 0.7 ? 1 : 0));
      if (y < 0.02 && along < 0.3) out.set('#9a6a4a');
    } else {
      // bare clay: mineral bloom near the rim, darker damp low down
      mix(out, out, C('#e6d6c0'), smoothstep(0.2, 0.7, noise3(x * 18 + seed, y * 18, z * 18)) * 0.35);
      mix(out, out, C('#6a3420'), smoothstep(H * 0.3, 0.0, y) * 0.3);
    }
    out.multiplyScalar(0.92 + 0.1 * noise3(x * 40, y * 40, z * 40));
  });
  const soil = paint(new THREE.CircleGeometry(R * 0.93, 24).rotateX(-Math.PI / 2).translate(0, H * 0.84, 0), (x, _y, z, out) => out.set('#2a1c12').multiplyScalar(0.75 + 0.45 * noise3(x * 70, 0, z * 70)));
  return { pot, soil };
}

/** An echeveria rosette: fleshy pointed leaves in tightening rings, blue-green blushing pink at the tips. */
export function rosette(scale: number, seed: number) {
  const r = rand(seed);
  const m = new Merger();
  const leaf = smoothLathe(
    [
      [0, 0],
      [0.02, 0.01],
      [0.032, 0.04],
      [0.028, 0.075],
      [0.012, 0.1],
      [0, 0.108],
    ],
    12,
    10,
  );
  leaf.scale(1, 1, 0.45);
  const rings = 5;
  for (let k = 0; k < rings; k++) {
    const count = 6 + k * 2;
    const tilt = 1.25 - k * 0.22;
    const s = 1 - k * 0.15;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + k * 0.4 + r() * 0.1;
      const g = leaf.clone();
      const tipCol = C('#c87a8a');
      const body = C(k < 2 ? '#7a9a8a' : '#8aac96');
      paint(g, (_x, y, _z, out) => {
        mix(out.copy(body), body, tipCol, smoothstep(0.06, 0.105, y) * 0.75);
        out.multiplyScalar(0.9 + 0.15 * smoothstep(0, 0.06, y));
      });
      m.add(g, trs([Math.cos(a) * 0.01 * k, 0.012 * k, Math.sin(a) * 0.01 * k], [tilt, -a + Math.PI / 2, 0], s * scale, 'YXZ'));
    }
  }
  return m.build();
}

/** A ribbed barrel cactus with tufts of spines, slightly lumpy. */
export function cactus(h: number, R: number, seed: number) {
  const n = 30;
  const g = smoothLathe(
    [
      [0, 0],
      [R * 0.85, 0.0],
      [R, h * 0.3],
      [R * 0.95, h * 0.7],
      [R * 0.6, h * 0.95],
      [0, h],
    ],
    n,
    48,
  );
  const p = g.attributes.position;
  const ribs = 12;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.08 * Math.cos(a * ribs) + 0.03 * noise3(x * 10 + seed, y * 10, z * 10);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  paint(g, (x, y, z, out) => {
    const a = Math.atan2(z, x);
    out.set('#3e6a3a').multiplyScalar(0.8 + 0.2 * (0.5 + 0.5 * Math.cos(a * ribs)));
    // pale areoles along the rib crests
    if (Math.cos(a * ribs) > 0.92 && Math.sin(y * 70) > 0.7) out.set('#e8e0c8');
    mix(out, out, C('#7a8a4a'), smoothstep(h * 0.8, h, y) * 0.4);
  });
  return g;
}

/** A pot of something small for a desk: a rosette or a cactus. */
export function smallPlant(seed: number) {
  return once(`office:small-plant:${seed % 6}`, () => {
    const v = seed % 6;
    const r = rand(v * 7 + 5);
    const R = 0.075 + r() * 0.02;
    const H = 0.1 + r() * 0.03;
    const glaze = v % 3 === 0 ? null : POT_GLAZES[v % POT_GLAZES.length];
    const { pot, soil } = potGeometry(R, H, glaze, v);
    const plant = new Merger();
    if (v % 2 === 0) plant.add(rosette(1.0 + r() * 0.3, v), trs([0, H * 0.84, 0]));
    else plant.add(cactus(0.16 + r() * 0.08, R * 0.75, v), trs([0, H * 0.84, 0]));
    // pebbles on the soil
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const d = R * (0.5 + r() * 0.35);
      const s = new THREE.SphereGeometry(0.008 + r() * 0.006, 6, 4).scale(1, 0.6, 1);
      plant.add(paint(s, (_x, _y, _z, out) => out.set(r() < 0.5 ? '#d8d0c0' : '#8a8478')), trs([Math.cos(a) * d, H * 0.85, Math.sin(a) * d]));
    }
    return { pot, soil, plant: plant.build(), glazed: !!glaze };
  });
}

// ---------- desk things ----------

/** A glazed cup of pencils and pens, the pencils hexagonal with sharpened tips. */
export function penCup(seed: number) {
  return once(`office:pen-cup:${seed % 4}`, () => {
    const v = seed % 4;
    const r = rand(v + 41);
    const n = 24;
    const cup = smoothLathe(
      [
        [0, 0],
        [0.05, 0],
        [0.054, 0.006],
        [0.056, 0.16],
        [0.06, 0.165],
        [0.052, 0.168],
        [0.05, 0.16],
        [0.048, 0.012],
        [0, 0.012],
      ],
      n,
      32,
    );
    const col = C(['#d8cdb4', '#2e4a3e', '#b4643c', '#3a4a6a'][v]);
    paintLathe(cup, n, (x, y, z, _a, out) => out.copy(col).multiplyScalar(0.9 + 0.12 * noise3(x * 40, y * 40, z * 40)));
    const sticks = new Merger();
    const colours = ['#e8b030', '#c8402a', '#2a5a8a', '#2a2a2a', '#3a7a4a', '#e8e0d0'];
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 0.03;
      const len = 0.26 + r() * 0.08;
      const pencil = r() < 0.6;
      const body = new THREE.CylinderGeometry(0.008, 0.008, len, pencil ? 6 : 10).translate(0, len / 2, 0);
      const c = C(colours[Math.floor(r() * colours.length)]);
      paint(body, (_x, y, _z, out) => out.copy(y > len - 0.03 && !pencil ? C('#1a1a1a') : c));
      const tip = new THREE.ConeGeometry(0.008, 0.035, pencil ? 6 : 10).translate(0, len + 0.0175, 0);
      paint(tip, (_x, y, _z, out) => out.set(pencil ? (y > len + 0.025 ? '#2a2a2a' : '#e6c8a0') : '#1a1a1a'));
      const tilt: [number, number, number] = [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3];
      sticks.add(body, trs([Math.cos(a) * d, 0.015, Math.sin(a) * d], tilt));
      sticks.add(tip, trs([Math.cos(a) * d, 0.015, Math.sin(a) * d], tilt));
    }
    return { cup, sticks: sticks.build() };
  });
}

/** A square pad of sticky notes, the top sheet curling up at one corner. */
export function stickyPad(colour: string, seed: number) {
  return once(`office:sticky:${colour}:${seed}`, () => {
    const m = new Merger();
    const c = C(colour);
    const block = plank(0.12, 0.035, 0.12, 0.003, 1, 1);
    paint(block, (_x, y, _z, out) => out.copy(c).multiplyScalar(y > 0.016 ? 1 : 0.85 + 0.1 * Math.sin(y * 2000)));
    m.add(block, trs([0, 0.0175, 0]));
    const top = new THREE.PlaneGeometry(0.12, 0.12, 6, 6).rotateX(-Math.PI / 2);
    const p = top.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const k = Math.max(0, x + z - 0.04);
      p.setY(i, k * k * 2.2);
    }
    top.computeVertexNormals();
    paint(top, (_x, _y, _z, out) => out.copy(c).multiplyScalar(1.05));
    m.add(top, trs([0, 0.036, 0]));
    return m.build();
  });
}

/** A lever-arch binder standing on end: board covers, a finger hole in the spine, a blank label frame. */
export function binderGeometry(colour: string, h = 0.5) {
  return once(`office:binder:${colour}:${h}`, () => {
    const m = new Merger();
    const c = C(colour);
    const w = 0.1;
    const d = 0.4;
    const body = plank(w, h, d, 0.008, 1, 2);
    paint(body, (x, y, z, out) => {
      out.copy(c).multiplyScalar(0.92 + 0.08 * noise3(x * 30, y * 30, z * 30));
      // the spine face: a pale blank label and the dark finger hole
      if (z > d / 2 - 0.01) {
        if (y > h * 0.55 && y < h * 0.85 && Math.abs(x) < w * 0.32) out.set('#e8e0cc');
        if (Math.hypot(x, y - h * 0.22) < 0.022) out.set('#141414');
      }
    });
    m.add(body, trs([0, h / 2, 0]));
    return m.build();
  });
}

/** A small brass bookend (an L with a rounded top). */
export function bookend() {
  return once('office:bookend', () => {
    const m = new Merger();
    m.add(plank(0.1, 0.012, 0.18, 0.004, 1, 1), trs([0, 0.006, 0]));
    const s = new THREE.Shape();
    s.moveTo(-0.08, 0);
    s.lineTo(0.08, 0);
    s.lineTo(0.08, 0.2);
    s.quadraticCurveTo(0.08, 0.27, 0, 0.27);
    s.quadraticCurveTo(-0.08, 0.27, -0.08, 0.2);
    s.closePath();
    const up = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 }).rotateY(Math.PI / 2).translate(-0.05, 0, 0);
    m.add(up);
    return paint(m.build(), (_x, _y, _z, out) => out.set('#c09a52'));
  });
}

/** A ceramic mug for decor shelves (not the people's): glazed, with a handle. */
export function mugGeometry(colour: string) {
  return once(`office:mug:${colour}`, () => {
    const n = 24;
    const body = smoothLathe(
      [
        [0, 0],
        [0.055, 0],
        [0.062, 0.01],
        [0.064, 0.14],
        [0.066, 0.15],
        [0.058, 0.152],
        [0.056, 0.14],
        [0.054, 0.016],
        [0, 0.016],
      ],
      n,
      28,
    );
    const c = C(colour);
    paintLathe(body, n, (_x, y, _z, along, out) => out.copy(along > 0.62 ? C('#efe6d4') : c).multiplyScalar(y < 0.012 ? 0.75 : 1));
    const handle = tubeThrough([V(0.06, 0.12, 0), V(0.105, 0.11, 0), V(0.11, 0.06, 0), V(0.06, 0.04, 0)], () => 0.011, 12, 6).geometry;
    paint(handle, (_x, _y, _z, out) => out.copy(c));
    return new Merger().add(body).add(handle).build();
  });
}
