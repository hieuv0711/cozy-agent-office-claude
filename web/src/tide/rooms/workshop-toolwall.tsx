import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { BACK_BENCH, ROOM } from '../workshop/plan';
import { PEG, WALL_SHELVES } from './workshop-dims';
import { benchMats } from './workshop-bench';
import { C, mapleTex, mapUV, Merger, noise3, once, paint, paintFlat, paintLathe, pegboardTex, plank, rand, shadeBy, smoothLathe, tex, trs, V, wmat, woodTex } from './workshop-kit';
import { placeUse } from '../crew/signals';
import { HANDLE_PAINT, TOOLS } from './workshop-tools';
import { ballGeometry, blocksGeometry, boatGeometries, dollGeometry, duckGeometry, furMat, PAINT, planeGeometries, robotGeometry, rockingHorseGeometries, soldierGeometry, teddyGeometries, topGeometry, toyMat, trainGeometry } from './workshop-toys';

// The tool wall along the back: the long tool bench (drawers, an open shelf
// of stock, a maple top) with a wood lathe at its left end, a paint table
// where freshly painted dolls dry, a chest of tiny drawers and a drill press at
// the right end; over it three painted pegboards hung with tools, each on its
// own shadow (one or two outlines stand empty: those tools are out on the
// benches), a rack of clamps and a rack of thread spools between them; and
// above, three long shelves: jars and tins, then two of finished toys.

const BZ = ROOM.back;
const TOP = BACK_BENCH.top;
const FZ = BACK_BENCH.front;
const BW = BACK_BENCH.x1 - BACK_BENCH.x0;
const BD = FZ - BZ;

// ---------- the bench ----------

function backTopTex() {
  const W = 2048;
  const H = Math.round((W * BD) / BW) * 2;
  return tex('ws-back-top', W, H, (g) => {
    const grain = mapleTex().image as HTMLCanvasElement;
    const tw = (2.4 / BW) * W;
    const th = (0.72 / BD) * H;
    for (let x = 0; x < W; x += tw) for (let y = 0; y < H; y += th) g.drawImage(grain, x, y, tw, th);
    const r = rand(77);
    const blob = (x: number, y: number, rad: number, colr: string, a: number) => {
      const b = g.createRadialGradient(x, y, 0, x, y, rad);
      b.addColorStop(0, `rgba(${colr},${a})`);
      b.addColorStop(1, `rgba(${colr},0)`);
      g.fillStyle = b;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    for (let k = 0; k < 40; k++) blob(r() * W, r() * H, 6 + r() * 30, r() < 0.5 ? '120,80,30' : '60,40,20', 0.08 + r() * 0.12);
    const paints = ['192,57,43', '44,93,156', '230,176,46', '58,131,80', '240,234,220'];
    // the paint table end is spattered
    for (let k = 0; k < 120; k++) {
      const c = paints[Math.floor(r() * paints.length)];
      const x = W * (0.3 + r() * 0.12);
      g.fillStyle = `rgba(${c},${0.5 + r() * 0.4})`;
      g.beginPath();
      g.arc(x, r() * H, 1 + r() * 4, 0, Math.PI * 2);
      g.fill();
    }
    for (let k = 0; k < 40; k++) {
      const c = paints[Math.floor(r() * paints.length)];
      g.fillStyle = `rgba(${c},${0.5 + r() * 0.4})`;
      g.beginPath();
      g.arc(r() * W, r() * H, 1 + r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function benchGeometries() {
  const oak = new Merger();
  const pine = new Merger();
  const brass = new Merger();
  const r = rand(61);
  const tone = () => new THREE.Color().setScalar(0.85 + r() * 0.25);
  const x0 = BACK_BENCH.x0;
  const x1 = BACK_BENCH.x1;
  const cx = (x0 + x1) / 2;
  const top = shadeBy(plank(BW, 0.09, BD, 0.02, [1 / 2.4, 1 / 0.72], 3), (x, y, z) => 0.9 + 0.12 * noise3(x * 0.7, y, z * 0.7));
  const face = new THREE.PlaneGeometry(BW - 0.03, BD - 0.03).rotateX(-Math.PI / 2);
  mapUV(face, (x, _y, z) => [(x + BW / 2) / BW, 1 - (z + BD / 2) / BD]);
  // posts down the front, a drawer rail under the top, a shelf near the floor and a kick board
  const posts = [x0 + 0.08, -5.15, -2.85, -1.15, 1.15, 2.85, 5.15, x1 - 0.08];
  for (const x of posts) oak.add(plank(0.11, TOP - 0.09, 0.11, 0.02, [1 / 1.4, 1 / 1.4], 2, [r() * 3, r() * 3], true), trs([x, (TOP - 0.09) / 2, FZ - 0.07]), tone());
  for (const x of [x0 + 0.08, x1 - 0.08]) oak.add(plank(0.11, TOP - 0.09, 0.11, 0.02, [1 / 1.4, 1 / 1.4], 2, [r(), r()], true), trs([x, (TOP - 0.09) / 2, BZ + 0.08]), tone());
  oak.add(plank(BW - 0.1, 0.05, 0.08, 0.012), trs([cx, TOP - 0.29, FZ - 0.06]), tone());
  oak.add(plank(BW - 0.1, 0.12, 0.04, 0.01), trs([cx, 0.06, FZ - 0.1]), tone());
  oak.add(plank(BW - 0.05, TOP - 0.09, 0.03), trs([cx, (TOP - 0.09) / 2, BZ + 0.02]), new THREE.Color().setScalar(0.5));
  // drawers between the posts: two per bay, with brass cup pulls
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i] + 0.055;
    const b = posts[i + 1] - 0.055;
    const n = b - a > 1.5 ? 2 : 1;
    const dw = (b - a) / n;
    for (let k = 0; k < n; k++) {
      const dx = a + dw * (k + 0.5);
      oak.add(plank(dw - 0.03, 0.16, 0.03, 0.01, [1 / 2.4, 1 / 2.4], 2, [r(), r()]), trs([dx, TOP - 0.175, FZ - 0.03]), tone());
      const cup = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16, 1, true, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI);
      brass.add(cup, trs([dx, TOP - 0.17, FZ - 0.005]));
      brass.add(plank(0.1, 0.03, 0.006, 0.002), trs([dx, TOP - 0.13, FZ - 0.012]));
    }
  }
  // the open shelf near the floor
  const nb = 4;
  for (let k = 0; k < nb; k++) pine.add(plank(BW - 0.2, 0.03, (BD - 0.25) / nb - 0.01, 0.008, [1 / 2.4, 1 / 1.2], 1, [r() * 3, r()]), trs([cx, 0.2, BZ + 0.08 + ((BD - 0.25) / nb) * (k + 0.5)]), tone());
  return { top, face, oak: oak.build(), pine: pine.build(), brass: brass.build() };
}

/** What's on the open shelf under the tool bench: boards, a basket of turned blanks, buckets and boxes. */
function underStock() {
  const m = new Merger();
  const r = rand(19);
  const y = 0.215;
  const tones = ['#d8b080', '#b07a48', '#e2c8a0', '#8a5a34', '#c49060'];
  for (let k = 0; k < 7; k++) {
    const len = 1.2 + r() * 1.2;
    const g = plank(len, 0.045, 0.22 + r() * 0.1, 0.008, [1 / 2.4, 1 / 1.2], 1, [r() * 3, r()]);
    paintFlat(g, tones[k % tones.length]);
    m.add(g, trs([-6.0 + (k % 2) * 0.3 + r() * 0.2, y + 0.025 + k * 0.047, BZ + 0.6], [0, (r() - 0.5) * 0.06, 0]));
  }
  // a stack of wooden crates with lids, a bucket of dowels, a sack of sawdust
  for (const [x, h] of [
    [-1.9, 0.32],
    [2.1, 0.28],
    [4.4, 0.34],
  ] as [number, number][]) {
    const g = plank(0.7, h, 0.6, 0.02, [1 / 1.2, 1 / 1.2], 2, [r(), r()]);
    paint(g, (px, py, pz, out) => {
      out.set('#b08a58');
      if (Math.abs(py) < 0.012 || Math.abs(px) > 0.33) out.set('#8a6438');
      out.multiplyScalar(0.9 + 0.15 * noise3(px * 20, py * 20, pz * 20));
    });
    m.add(g, trs([x, y + h / 2, BZ + 0.55], [0, (r() - 0.5) * 0.2, 0]));
  }
  const bucket = smoothLathe(
    [
      [0, 0],
      [0.15, 0],
      [0.155, 0.01],
      [0.18, 0.3],
      [0.185, 0.31],
      [0.17, 0.3],
      [0.15, 0.03],
      [0, 0.025],
    ],
    24,
    28,
  );
  paintLathe(bucket, 24, (px, py, pz, along, out) => {
    out.set('#8a9298');
    if (Math.abs(py - 0.08) < 0.012 || Math.abs(py - 0.24) < 0.012) out.set('#5a6064');
    if (along > 0.6) out.multiplyScalar(0.55);
    out.multiplyScalar(0.9 + 0.15 * noise3(px * 20, py * 20, pz * 20));
  });
  m.add(bucket, trs([0.4, y, BZ + 0.6]));
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const g = new THREE.CylinderGeometry(0.014, 0.014, 0.75 + r() * 0.2, 8);
    paintFlat(g, '#e2c8a0');
    m.add(g, trs([0.4 + Math.cos(a) * 0.08, y + 0.4, BZ + 0.6 + Math.sin(a) * 0.08], [(r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25]));
  }
  return m.build();
}

// ---------- the pegboards ----------

type Hang = { kind: keyof typeof TOOLS; x: number; y: number; rot: number; colour?: number; missing?: boolean };

const PANELS: Hang[][] = [
  [
    { kind: 'saw', x: 0.18, y: 1.8, rot: 0 },
    { kind: 'coping', x: 1.25, y: 1.45, rot: 0 },
    { kind: 'chisel', x: 0.28, y: 1.32, rot: -Math.PI / 2 },
    { kind: 'chisel', x: 0.44, y: 1.32, rot: -Math.PI / 2 },
    { kind: 'chisel', x: 0.6, y: 1.32, rot: -Math.PI / 2 },
    { kind: 'chisel', x: 0.76, y: 1.32, rot: -Math.PI / 2 },
    { kind: 'square', x: 1.25, y: 0.95, rot: 0 },
    { kind: 'hammer', x: 2.25, y: 0.72, rot: Math.PI / 2 },
    { kind: 'hammer', x: 2.62, y: 0.72, rot: Math.PI / 2, missing: true },
    { kind: 'mallet', x: 2.4, y: 1.45, rot: Math.PI / 2 },
    { kind: 'spanner', x: 2.0, y: 1.95, rot: 0 },
  ],
  [
    { kind: 'brace', x: 0.16, y: 1.7, rot: 0 },
    { kind: 'saw', x: 1.0, y: 1.92, rot: 0, missing: true },
    { kind: 'driver', x: 0.25, y: 1.3, rot: -Math.PI / 2, colour: 0 },
    { kind: 'driver', x: 0.4, y: 1.3, rot: -Math.PI / 2, colour: 1 },
    { kind: 'driver', x: 0.55, y: 1.3, rot: -Math.PI / 2, colour: 2 },
    { kind: 'driver', x: 0.7, y: 1.3, rot: -Math.PI / 2, colour: 3 },
    { kind: 'pliers', x: 1.05, y: 1.36, rot: -Math.PI / 2, colour: 0 },
    { kind: 'pliers', x: 1.3, y: 1.36, rot: -Math.PI / 2, colour: 2 },
    { kind: 'rule', x: 1.65, y: 1.45, rot: 0 },
    { kind: 'mallet', x: 2.6, y: 0.75, rot: Math.PI / 2 },
    { kind: 'spanner', x: 1.75, y: 0.95, rot: -Math.PI / 2 },
    { kind: 'spanner', x: 1.9, y: 0.95, rot: -Math.PI / 2 },
    { kind: 'spanner', x: 2.05, y: 0.95, rot: -Math.PI / 2 },
  ],
  [
    { kind: 'saw', x: 2.1, y: 1.85, rot: Math.PI, missing: false },
    { kind: 'hammer', x: 0.3, y: 0.75, rot: Math.PI / 2 },
    { kind: 'chisel', x: 0.75, y: 1.45, rot: -Math.PI / 2 },
    { kind: 'chisel', x: 0.9, y: 1.45, rot: -Math.PI / 2 },
    { kind: 'chisel', x: 1.05, y: 1.45, rot: -Math.PI / 2, missing: true },
    { kind: 'driver', x: 1.45, y: 1.4, rot: -Math.PI / 2, colour: 4 },
    { kind: 'driver', x: 1.6, y: 1.4, rot: -Math.PI / 2, colour: 1 },
    { kind: 'coping', x: 2.1, y: 1.02, rot: 0 },
    { kind: 'square', x: 0.25, y: 1.9, rot: 0 },
    { kind: 'pliers', x: 2.85, y: 1.3, rot: -Math.PI / 2, colour: 3 },
  ],
];

/** Draw a tool's silhouette (grown a little) at its place on the panel. */
function outline(h: Hang, grow = 0.016) {
  return (g: CanvasRenderingContext2D) => {
    g.save();
    g.translate(h.x, h.y);
    g.rotate(h.rot);
    for (const s of TOOLS[h.kind].sil) {
      g.beginPath();
      if ('r' in s) {
        const [x, y, w, hh] = s.r;
        g.roundRect(x - w / 2 - grow, y - hh / 2 - grow, w + grow * 2, hh + grow * 2, grow * 1.5);
      } else {
        const [x, y, rr] = s.c;
        g.arc(x, y, rr + grow, 0, Math.PI * 2);
      }
      g.fill();
    }
    g.restore();
  };
}

function pegboardGeometries(i: number) {
  const hangs = PANELS[i];
  const cx = PEG.xs[i];
  const x0 = cx - PEG.w / 2;
  const zb = BZ + 0.06;
  const steel = new Merger();
  const wood = new Merger();
  const painted = new Merger();
  const pegs = new Merger();
  for (const h of hangs) {
    const tool = TOOLS[h.kind];
    const place = trs([x0 + h.x, PEG.y0 + h.y, zb + 0.02], [0, 0, h.rot]);
    // the pegs it hangs on (even when the tool is out): little J-hooks out of the holes
    for (const [px, py] of tool.pegs) {
      const p = new THREE.Vector3(px, py, 0).applyMatrix4(trs([x0 + h.x, PEG.y0 + h.y, 0], [0, 0, h.rot]));
      const sx = Math.round((p.x - x0) / 0.055 - 0.5) * 0.055 + 0.0275 + x0;
      const sy = Math.round((p.y - PEG.y0) / 0.055 - 0.5) * 0.055 + 0.0275 + PEG.y0 + 0.03;
      pegs.add(tubeThrough([V(sx, sy, zb), V(sx, sy, zb + 0.06), V(sx, sy + 0.025, zb + 0.075)], () => 0.005, 6, 5).geometry);
    }
    if (h.missing) continue;
    const parts = tool.parts();
    for (const g of parts.steel) steel.add(g, place);
    for (const g of parts.wood) wood.add(g, place);
    const hc = C(HANDLE_PAINT[(h.colour ?? 0) % HANDLE_PAINT.length]);
    for (const g of parts.paint) painted.add(g, place, h.kind === 'rule' ? undefined : hc);
  }
  // the panel and its frame of battens
  const panel = new THREE.PlaneGeometry(PEG.w, PEG.y1 - PEG.y0).translate(cx, (PEG.y0 + PEG.y1) / 2, zb);
  const frame = new Merger();
  const fw = 0.06;
  frame.add(plank(PEG.w + fw * 2, fw, 0.04, 0.012), trs([cx, PEG.y1 + fw / 2, zb + 0.005]));
  frame.add(plank(PEG.w + fw * 2, fw, 0.04, 0.012), trs([cx, PEG.y0 - fw / 2, zb + 0.005]));
  for (const s of [-1, 1]) frame.add(plank(fw, PEG.y1 - PEG.y0, 0.04, 0.012, [1 / 1.4, 1 / 1.4], 2, [0, 0], true), trs([cx + s * (PEG.w / 2 + fw / 2), (PEG.y0 + PEG.y1) / 2, zb + 0.005]));
  return { panel, frame: frame.build(), steel: steel.build(), wood: wood.build(), painted: painted.build(), pegs: pegs.build() };
}

/** Between the pegboards: F-clamps hung on a rail (left), spools of coloured thread on pegs (right). */
function rackGeometries() {
  const wood = new Merger();
  const steel = new Merger();
  const vc = new Merger();
  const zb = BZ + 0.06;
  const lx = (PEG.xs[0] + PEG.xs[1]) / 2;
  const rx = (PEG.xs[1] + PEG.xs[2]) / 2;
  // the clamp rail and three clamps hanging from it, jaws up
  wood.add(plank(0.8, 0.08, 0.1, 0.015), trs([lx, 2.75, zb + 0.05]));
  for (let k = 0; k < 3; k++) {
    const x = lx - 0.25 + k * 0.25;
    const len = 0.9 - k * 0.12;
    steel.add(plank(0.035, len, 0.012, 0.004), trs([x, 2.75 - len / 2 + 0.06, zb + 0.13]));
    steel.add(plank(0.16, 0.035, 0.03, 0.008), trs([x + 0.06, 2.72, zb + 0.13]));
    steel.add(plank(0.16, 0.035, 0.03, 0.008), trs([x + 0.06, 2.75 - len + 0.2, zb + 0.13]));
    steel.add(tubeThrough([V(x + 0.12, 2.75 - len + 0.2, zb + 0.13), V(x + 0.12, 2.75 - len + 0.05, zb + 0.13)], () => 0.007, 2, 6).geometry);
    wood.add(
      smoothLathe(
        [
          [0, 0],
          [0.017, 0],
          [0.022, 0.03],
          [0.02, 0.1],
          [0, 0.1],
        ],
        12,
        14,
      ),
      trs([x + 0.12, 2.75 - len - 0.05, zb + 0.13], [Math.PI, 0, 0]),
    );
  }
  // the spool rack: a board of pegs, a spool of thread on each
  wood.add(plank(0.72, 0.9, 0.04, 0.015, [1 / 1.4, 1 / 1.4], 2, [0, 0], true), trs([rx, 2.25, zb + 0.02]));
  const threads = ['#c0392b', '#e6b02e', '#2c5d9c', '#3a8350', '#e2899a', '#efe3c8', '#7a4a28', '#2d8686', '#dc6f2a'];
  let t = 0;
  for (let row = 0; row < 3; row++)
    for (let c = 0; c < 3; c++) {
      const x = rx - 0.22 + c * 0.22;
      const y = 2.55 - row * 0.28;
      steel.add(tubeThrough([V(x, y, zb + 0.04), V(x, y + 0.02, zb + 0.2)], () => 0.006, 2, 6).geometry);
      const n = 24;
      const sp = smoothLathe(
        [
          [0.012, -0.065],
          [0.05, -0.065],
          [0.052, -0.055],
          [0.04, -0.048],
          [0.044, 0.048],
          [0.052, 0.055],
          [0.05, 0.065],
          [0.012, 0.065],
        ],
        n,
        20,
      ).rotateX(Math.PI / 2);
      const thread = threads[t++ % threads.length];
      paintLathe(sp, n, (px, py, _pz, along, out) => {
        out.set(along > 0.2 && along < 0.8 && Math.hypot(px, py) > 0.041 ? thread : '#e2c294');
        if (along > 0.2 && along < 0.8) out.multiplyScalar(0.9 + 0.12 * Math.sin(Math.atan2(py, px) * 40));
      });
      vc.add(sp, trs([x, y + 0.012, zb + 0.13], [-0.12, 0, 0]));
    }
  return { wood: wood.build(), steel: steel.build(), vc: vc.build() };
}

/** Over the lathe: a rack of long turning gouges; over the drill press: a bow saw hung on the wall. */
function endRacks() {
  const wood = new Merger();
  const steel = new Merger();
  const zb = BZ + 0.06;
  wood.add(plank(1.6, 0.07, 0.14, 0.015), trs([-6.6, 2.35, zb + 0.07]));
  wood.add(plank(1.6, 0.05, 0.1, 0.012), trs([-6.6, 1.75, zb + 0.05]));
  for (let k = 0; k < 7; k++) {
    const x = -7.25 + k * 0.21;
    const len = 0.35 + (k % 3) * 0.06;
    wood.add(
      smoothLathe(
        [
          [0, 0],
          [0.018, 0],
          [0.026, 0.04],
          [0.028, len * 0.6],
          [0.022, len],
          [0, len],
        ],
        14,
        14,
      ),
      trs([x, 2.38, zb + 0.07]),
    );
    steel.add(new THREE.CylinderGeometry(0.019, 0.019, 0.03, 12), trs([x, 2.375, zb + 0.07]));
    steel.add(tubeThrough([V(x, 2.36, zb + 0.07), V(x, 1.78, zb + 0.07), V(x, 1.7, zb + 0.08)], (s) => 0.011 - s * 0.004, 4, 8).geometry);
  }
  // a bow saw: two uprights, a stretcher, a twisted cord, the blade
  const sx = 6.6;
  const sy = 2.05;
  for (const s of [-1, 1]) wood.add(plank(0.05, 0.6, 0.03, 0.012, [1 / 1.4, 1 / 1.4], 2, [0, 0], true), trs([sx + s * 0.38, sy, zb + 0.06], [0, 0, -s * 0.05]));
  wood.add(plank(0.72, 0.035, 0.028, 0.01), trs([sx, sy, zb + 0.06]));
  wood.add(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6).rotateZ(Math.PI / 2), trs([sx - 0.18, sy + 0.24, zb + 0.07], [0, 0, 0.04]));
  wood.add(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6).rotateZ(Math.PI / 2), trs([sx + 0.18, sy + 0.245, zb + 0.07], [0, 0, -0.04]));
  wood.add(plank(0.03, 0.12, 0.012, 0.004), trs([sx, sy + 0.2, zb + 0.08]));
  steel.add(plank(0.8, 0.03, 0.003, 0.001), trs([sx, sy - 0.27, zb + 0.06]));
  return { wood: wood.build(), steel: steel.build() };
}

// ---------- machines ----------

/** A small wood lathe with a peg doll half turned between its centres. Parts by material. */
function latheGeometries() {
  const iron = new Merger();
  const steel = new Merger();
  const work = new Merger();
  const green = C('#4a6a5a');
  const z = -5.78;
  const y = TOP;
  const xa = -7.42;
  const xb = -5.42;
  // feet and the twin bed
  for (const x of [xa + 0.12, xb - 0.12]) iron.add(plank(0.14, 0.16, 0.36, 0.02), trs([x, y + 0.08, z]), green);
  for (const dz of [-0.07, 0.07]) iron.add(plank(xb - xa, 0.05, 0.05, 0.01), trs([(xa + xb) / 2, y + 0.18, z + dz]), green);
  // the headstock with its step pulley and spur centre
  iron.add(plank(0.3, 0.28, 0.28, 0.03), trs([xa + 0.2, y + 0.35, z]), green);
  const cy = y + 0.4;
  for (let k = 0; k < 3; k++) iron.add(new THREE.CylinderGeometry(0.11 - k * 0.025, 0.11 - k * 0.025, 0.035, 24).rotateZ(Math.PI / 2), trs([xa - 0.0 + k * 0.035, cy, z]), C('#8a8f94'));
  steel.add(tubeThrough([V(xa + 0.35, cy, z), V(xa + 0.43, cy, z)], () => 0.03, 2, 14).geometry);
  steel.add(new THREE.ConeGeometry(0.028, 0.05, 12).rotateZ(-Math.PI / 2), trs([xa + 0.455, cy, z]));
  // the motor behind, with its belt up to the pulley
  iron.add(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 20).rotateZ(Math.PI / 2), trs([xa + 0.2, y + 0.12, z - 0.32]), C('#3a4a42'));
  steel.add(tubeThrough([V(xa + 0.05, cy + 0.09, z - 0.02), V(xa + 0.05, y + 0.2, z - 0.25), V(xa + 0.05, y + 0.05, z - 0.36)], () => 0.012, 10, 6).geometry);
  // the tool rest and the tailstock with its handwheel
  iron.add(plank(0.08, 0.2, 0.08, 0.015), trs([-6.5, y + 0.3, z + 0.15]), green);
  steel.add(plank(0.6, 0.025, 0.03, 0.008), trs([-6.5, cy - 0.03, z + 0.11]));
  iron.add(plank(0.24, 0.2, 0.2, 0.025), trs([xb - 0.25, y + 0.31, z]), green);
  steel.add(tubeThrough([V(xb - 0.38, cy, z), V(xb - 0.45, cy, z)], () => 0.025, 2, 12).geometry);
  steel.add(new THREE.ConeGeometry(0.024, 0.05, 12).rotateZ(Math.PI / 2), trs([xb - 0.47, cy, z]));
  steel.add(new THREE.TorusGeometry(0.075, 0.012, 8, 24).rotateY(Math.PI / 2), trs([xb - 0.08, cy, z]));
  steel.add(tubeThrough([V(xb - 0.12, cy, z), V(xb - 0.07, cy, z)], () => 0.012, 2, 8).geometry);
  steel.add(new THREE.SphereGeometry(0.018, 8, 6), trs([xb - 0.08, cy + 0.075, z + 0.02]));
  // the work: a peg doll, turned at the headstock end, still a square blank at the other
  const n = 30;
  const turned = smoothLathe(
    [
      [0.0, 0],
      [0.055, 0.0],
      [0.06, 0.06],
      [0.05, 0.14],
      [0.038, 0.19],
      [0.05, 0.22],
      [0.058, 0.26],
      [0.05, 0.3],
      [0.045, 0.32],
      [0.05, 0.34],
      [0, 0.345],
    ],
    n,
    28,
  )
    .rotateZ(-Math.PI / 2)
    .translate(xa + 0.47, cy, z);
  paint(turned, (_x, _y, _z, out) => out.set('#ecd2a6'));
  work.add(turned);
  const blank = plank(0.5, 0.11, 0.11, 0.008, [3, 3]);
  paint(blank, (_x, _y, _z, out) => out.set('#e0c294'));
  work.add(blank, trs([xa + 0.47 + 0.345 + 0.25, cy, z], [0.3, 0, 0]));
  const ironG = iron.build();
  shadeBy(ironG, (px, py, pz) => 0.85 + 0.25 * noise3(px * 25, py * 25, pz * 25));
  return { iron: ironG, steel: steel.build(), work: work.build() };
}

/** A bench drill press in old machine green. */
function drillGeometries() {
  const iron = new Merger();
  const steel = new Merger();
  const green = C('#4a6a5a');
  const x = 6.55;
  const z = -5.9;
  const y = TOP;
  iron.add(plank(0.42, 0.06, 0.4, 0.02), trs([x, y + 0.03, z + 0.05]), green);
  steel.add(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 18), trs([x, y + 0.66, z - 0.08]));
  iron.add(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 18), trs([x, y + 0.48, z - 0.08]), green);
  iron.add(plank(0.1, 0.05, 0.18, 0.015), trs([x, y + 0.48, z + 0.02]), green);
  iron.add(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 28), trs([x, y + 0.5, z + 0.12]), green);
  // the head: a rounded housing, a belt guard on top, a motor at the back
  iron.add(plank(0.3, 0.26, 0.42, 0.06), trs([x, y + 1.12, z + 0.02]), green);
  iron.add(plank(0.34, 0.12, 0.5, 0.05), trs([x, y + 1.31, z - 0.02]), green);
  iron.add(new THREE.CylinderGeometry(0.11, 0.11, 0.28, 20), trs([x, y + 1.17, z - 0.32]), C('#3a4a42'));
  // the quill and chuck with a bit, the three feed handles
  steel.add(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 16), trs([x, y + 0.93, z + 0.12]));
  steel.add(
    smoothLathe(
      [
        [0, 0],
        [0.012, 0],
        [0.035, 0.03],
        [0.038, 0.08],
        [0.03, 0.1],
        [0, 0.1],
      ],
      12,
      18,
    ),
    trs([x, y + 0.75, z + 0.12]),
  );
  steel.add(new THREE.CylinderGeometry(0.007, 0.004, 0.12, 8), trs([x, y + 0.69, z + 0.12]));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    const end = V(x + 0.17 + Math.cos(a) * 0.0, y + 1.1 + Math.sin(a) * 0.2, z + 0.06 + Math.cos(a) * 0.2);
    steel.add(tubeThrough([V(x + 0.17, y + 1.1, z + 0.06), end], () => 0.009, 2, 8).geometry);
    steel.add(new THREE.SphereGeometry(0.024, 10, 8), trs([end.x, end.y, end.z]));
  }
  const ironG = iron.build();
  shadeBy(ironG, (px, py, pz) => 0.85 + 0.25 * noise3(px * 25, py * 25, pz * 25));
  return { iron: ironG, steel: steel.build() };
}

/** The paint table: pots of paint with drips, a palette, and peg dolls drying on a board. */
function paintTable() {
  const vc = new Merger();
  const toys = new Merger();
  const r = rand(15);
  const x0 = -2.75;
  const z = -6.0;
  const y = TOP;
  const colours = [PAINT.red, PAINT.blue, PAINT.yellow, PAINT.green, PAINT.cream, PAINT.pink];
  colours.forEach((c, i) => {
    const n = 24;
    const pot = smoothLathe(
      [
        [0, 0],
        [0.055, 0],
        [0.058, 0.008],
        [0.058, 0.085],
        [0.052, 0.095],
        [0.045, 0.09],
        [0, 0.088],
      ],
      n,
      24,
    );
    paintLathe(pot, n, (px, py, pz, along, out) => {
      out.set('#c8ccd0');
      if (along > 0.62) out.set(c);
      // drips down the side
      const a = Math.atan2(pz, px);
      if (Math.abs(Math.sin(a * 3 + i)) > 0.9 && py > 0.04) out.set(c);
      if (py > 0.08) out.set(c);
    });
    vc.add(pot, trs([x0 + 0.1 + (i % 3) * 0.14, y, z + 0.06 + Math.floor(i / 3) * 0.14]));
  });
  // a palette board with blobs of colour
  const pal = plank(0.36, 0.015, 0.24, 0.01);
  paintFlat(pal, '#d8b888');
  vc.add(pal, trs([x0 + 0.95, y + 0.008, z + 0.28], [0, 0.25, 0]));
  // blobs of paint on the palette, and a brush across it
  for (let k = 0; k < 6; k++) {
    const blob = new THREE.SphereGeometry(0.03, 12, 8);
    paintFlat(blob, colours[k]);
    const bx = -0.11 + (k % 3) * 0.11;
    const bz = -0.05 + Math.floor(k / 3) * 0.1;
    const c = Math.cos(0.25);
    const sn = Math.sin(0.25);
    vc.add(blob, trs([x0 + 0.95 + bx * c + bz * sn, y + 0.017, z + 0.28 - bx * sn + bz * c], [0, r() * 3, 0], [1 + r() * 0.4, 0.28, 1 + r() * 0.3]));
  }
  vc.add(paintFlat(tubeThrough([V(x0 + 0.8, y + 0.03, z + 0.36), V(x0 + 1.12, y + 0.03, z + 0.22)], () => 0.008, 2, 8).geometry, '#7a4a28'));
  // the drying board: freshly painted dolls in a row
  const board = plank(0.75, 0.04, 0.16, 0.01);
  paintFlat(board, '#b08a58');
  vc.add(board, trs([x0 + 0.95, y + 0.02, z - 0.05]));
  for (let k = 0; k < 5; k++) toys.add(dollGeometry(k), trs([x0 + 0.65 + k * 0.15, y + 0.04, z - 0.05], [0, (r() - 0.5) * 0.4, 0], 0.62));
  // the chest of little drawers and a glue pot on the other side of the middle station
  const chest = new Merger();
  chest.add(plank(0.5, 0.42, 0.3, 0.02), trs([0, 0.21, 0]), C('#8a5a34'));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      chest.add(plank(0.14, 0.11, 0.02, 0.006), trs([-0.155 + i * 0.155, 0.08 + j * 0.13, 0.155]), C('#b07a48'));
      chest.add(new THREE.SphereGeometry(0.012, 8, 6), trs([-0.155 + i * 0.155, 0.08 + j * 0.13, 0.172]), C(PAINT.gold));
    }
  vc.add(chest.build(), trs([1.9, y, -6.05], [0, -0.15, 0]));
  const glue = smoothLathe(
    [
      [0, 0],
      [0.07, 0],
      [0.075, 0.01],
      [0.075, 0.12],
      [0.085, 0.13],
      [0.07, 0.135],
      [0.065, 0.11],
      [0, 0.1],
    ],
    20,
    24,
  );
  paintLathe(glue, 20, (_px, py, _pz, along, out) => out.set(along > 0.6 ? '#c89a50' : py > 0.1 ? '#2a2a2a' : '#e8e2d6'));
  vc.add(glue, trs([2.45, y, -5.9]));
  const brush = tubeThrough([V(2.45, y + 0.06, -5.9), V(2.5, y + 0.28, -5.86)], () => 0.009, 2, 8).geometry;
  vc.add(paintFlat(brush, '#7a4a28'));
  return { vc: vc.build(), toys: toys.build() };
}

// ---------- the wall shelves ----------

const IRON = new THREE.Color('#231f1c');

function shelfGeometries() {
  const wood = new Merger();
  const iron = new Merger();
  const { x0, x1, y, depth } = WALL_SHELVES;
  const r = rand(4);
  for (const sy of y) {
    wood.add(plank(x1 - x0, 0.05, depth, 0.015, [1 / 2.4, 1 / 1.2], 2, [r(), r()]), trs([(x0 + x1) / 2, sy - 0.025, BZ + depth / 2 + 0.01]), new THREE.Color().setScalar(0.85 + r() * 0.2));
    // a little lip along the front
    wood.add(plank(x1 - x0, 0.035, 0.025, 0.01), trs([(x0 + x1) / 2, sy + 0.012, BZ + depth + 0.0]));
    // scrolled iron brackets
    for (let bx = x0 + 0.5; bx < x1; bx += 2.32) {
      const pts = [V(bx, sy - 0.05, BZ + 0.02), V(bx, sy - 0.3, BZ + 0.03), V(bx, sy - 0.33, BZ + 0.08), V(bx, sy - 0.2, BZ + 0.2), V(bx, sy - 0.08, BZ + 0.34), V(bx, sy - 0.05, BZ + 0.38)];
      iron.add(tubeThrough(pts, () => 0.012, 20, 6).geometry, undefined, IRON);
      iron.add(plank(0.03, 0.012, depth - 0.04, 0.004), trs([bx, sy - 0.056, BZ + depth / 2]), IRON);
      const curl = [];
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * Math.PI * 1.6;
        curl.push(V(bx, sy - 0.2 + Math.sin(a) * 0.05, BZ + 0.12 + Math.cos(a) * 0.05));
      }
      iron.add(tubeThrough(curl, () => 0.008, 16, 5).geometry, undefined, IRON);
    }
  }
  return { wood: wood.build(), iron: iron.build() };
}

/** Jars of buttons and screws, tins, little boxes, twine and a sanding block on the first shelf. */
function jarShelf() {
  const solid = new Merger();
  const glass = new Merger();
  const r = rand(23);
  const y = WALL_SHELVES.y[0];
  const z = BZ + 0.22;
  let x = WALL_SHELVES.x0 + 0.25;
  let k = 0;
  const fills = [
    ['#c0392b', '#e6b02e', '#2c5d9c', '#efe3c8'],
    ['#8a9096', '#b8bcc0', '#5a6064'],
    ['#e0bd8c', '#c89a64', '#a8703e'],
    ['#2d8686', '#e2899a', '#e6b02e', '#3a8350'],
  ];
  while (x < WALL_SHELVES.x1 - 0.2) {
    const kind = k % 5;
    if (kind === 0 || kind === 3) {
      // a glass jar with a lid, full of small things
      const jr = 0.075 + r() * 0.02;
      const jh = 0.2 + r() * 0.08;
      const n = 24;
      const shell = smoothLathe(
        [
          [0, 0],
          [jr, 0],
          [jr + 0.004, 0.01],
          [jr + 0.004, jh * 0.85],
          [jr * 0.82, jh * 0.95],
          [jr * 0.82, jh],
          [0, jh],
        ],
        n,
        24,
      );
      glass.add(shell, trs([x, y, z]));
      const fill = fills[Math.floor(r() * fills.length)];
      const content = new THREE.CylinderGeometry(jr - 0.006, jr - 0.006, jh * (0.5 + r() * 0.3), 36, 18);
      content.translate(0, (content.parameters.height as number) / 2 + 0.005, 0);
      // a jumble of small things: each vertex takes a colour of its own
      paint(content, (px, py, pz, out) => {
        const h = Math.abs(Math.sin(px * 1271.3 + py * 3117.1 + pz * 911.7) * 43758.5);
        out.set(fill[Math.floor((h - Math.floor(h)) * fill.length)]).multiplyScalar(0.75 + 0.35 * noise3(px * 90, py * 90, pz * 90));
      });
      solid.add(content, trs([x, y, z]));
      const lid = new THREE.CylinderGeometry(jr * 0.86, jr * 0.86, 0.03, 20);
      paintFlat(lid, ['#b8322a', '#c8a050', '#2c5d9c'][k % 3]);
      solid.add(lid, trs([x, y + jh + 0.012, z]));
      x += jr * 2 + 0.06;
    } else if (kind === 1) {
      // a painted tin (no lettering, just bands)
      const tr = 0.065;
      const th = 0.14 + r() * 0.06;
      const c = ['#2c5d9c', '#b8322a', '#3a8350', '#e6b02e'][Math.floor(r() * 4)];
      const n = 18;
      const tin = smoothLathe(
        [
          [0, 0],
          [tr, 0],
          [tr + 0.003, 0.008],
          [tr + 0.003, th],
          [tr - 0.004, th + 0.006],
          [0, th + 0.006],
        ],
        n,
        22,
      );
      paintLathe(tin, n, (_px, py, _pz, _a, out) => out.set(py > th * 0.25 && py < th * 0.75 ? c : py > th * 0.85 ? '#c8a050' : '#9aa0a6'));
      solid.add(tin, trs([x, y, z]));
      x += tr * 2 + 0.07;
    } else if (kind === 2) {
      // a little wooden box with a sliding lid
      const bw = 0.2 + r() * 0.1;
      const g = plank(bw, 0.12, 0.16, 0.012);
      paint(g, (_px, py, _pz, out) => out.set(py > 0.05 ? '#c49060' : '#a8703e'));
      solid.add(g, trs([x + bw / 2 - 0.05, y + 0.06, z], [0, (r() - 0.5) * 0.2, 0]));
      x += bw + 0.06;
    } else {
      // a ball of twine
      const ball = new THREE.SphereGeometry(0.07, 18, 12);
      paint(ball, (px, py, pz, out) => out.set('#d8c49a').multiplyScalar(0.8 + 0.25 * Math.abs(Math.sin((px * 3 + py * 7 + pz * 5) * 30))));
      solid.add(ball, trs([x, y + 0.07, z]));
      x += 0.2;
    }
    k++;
    if (k % 7 === 0) x += 0.35;
  }
  return { solid: solid.build(), glass: glass.build() };
}

type Put = { x: number; g: () => THREE.BufferGeometry; s: number; ry?: number; dz?: number; fur?: boolean };

/** The two shelves of finished toys. Merged per shelf: painted wood, and the teddies' fur. */
function toyShelves() {
  const toys = new Merger();
  const fur = new Merger();
  const shelf = (y: number, puts: Put[]) => {
    for (const p of puts) (p.fur ? fur : toys).add(p.g(), trs([p.x, y, BZ + 0.24 + (p.dz ?? 0)], [0, p.ry ?? 0, 0], p.s));
  };
  const horse = (seed: number) => () => {
    const h = rockingHorseGeometries(seed, 0.024);
    return new Merger().add(h.horse).add(h.hair).add(h.reins).add(h.rockers).build();
  };
  const plane = (seed: number) => () => {
    const p = planeGeometries(seed);
    return new Merger().add(p.body).add(p.prop, trs(p.hub)).build();
  };
  const boat = (seed: number) => () => {
    const b = boatGeometries(seed);
    return new Merger().add(b.body).add(b.sail).build();
  };
  const teddy = (seed: number) => () => teddyGeometries(seed, 0.012).fur;
  const teddyBits = (seed: number) => () => {
    const t = teddyGeometries(seed, 0.012);
    return new Merger().add(t.shiny).add(t.bow).build();
  };
  const [, y1, y2] = WALL_SHELVES.y;
  shelf(y1, [
    { x: -6.75, g: () => trainGeometry(0), s: 0.62 },
    { x: -5.65, g: () => dollGeometry(0), s: 1.1 },
    { x: -5.42, g: () => dollGeometry(1), s: 1.0 },
    { x: -5.2, g: () => dollGeometry(2), s: 0.9 },
    { x: -4.45, g: () => robotGeometry(0), s: 0.85, ry: 0.15 },
    { x: -3.65, g: () => topGeometry(0, 0), s: 1.2 },
    { x: -3.4, g: () => topGeometry(1, 1), s: 1.2 },
    { x: -3.15, g: () => topGeometry(2, 2), s: 1.2 },
    { x: -2.25, g: horse(0), s: 0.42 },
    { x: -1.2, g: boat(0), s: 1.0, ry: 0.3 },
    { x: -0.45, g: () => soldierGeometry(0), s: 1.05 },
    { x: -0.2, g: () => soldierGeometry(1), s: 1.05 },
    { x: 0.05, g: () => soldierGeometry(2), s: 1.05 },
    { x: 0.85, g: () => duckGeometry(0), s: 1.1, ry: -0.3 },
    { x: 1.75, g: () => blocksGeometry(0), s: 1.0 },
    { x: 2.75, g: teddy(0), s: 0.95, fur: true },
    { x: 2.75, g: teddyBits(0), s: 0.95 },
    { x: 3.65, g: () => ballGeometry(0), s: 1.2 },
    { x: 4.05, g: () => topGeometry(0, 3), s: 1.1 },
    { x: 4.95, g: () => robotGeometry(1), s: 0.85, ry: -0.2 },
    { x: 6.35, g: () => trainGeometry(1), s: 0.62 },
  ]);
  shelf(y2, [
    { x: -6.9, g: plane(0), s: 0.62, ry: 0.4 },
    { x: -5.8, g: () => soldierGeometry(1), s: 1.1 },
    { x: -5.55, g: () => soldierGeometry(1), s: 1.1 },
    { x: -5.3, g: () => soldierGeometry(1), s: 1.1 },
    { x: -4.35, g: teddy(1), s: 0.9, fur: true },
    { x: -4.35, g: teddyBits(1), s: 0.9 },
    { x: -3.4, g: () => duckGeometry(1), s: 1.05, ry: 0.25 },
    { x: -2.4, g: () => blocksGeometry(1), s: 1.0 },
    { x: -1.25, g: horse(2), s: 0.42 },
    { x: -0.2, g: () => robotGeometry(2), s: 0.85 },
    { x: 0.55, g: () => dollGeometry(3), s: 1.05 },
    { x: 0.78, g: () => dollGeometry(0), s: 0.92 },
    { x: 1.65, g: boat(1), s: 0.95, ry: -0.3 },
    { x: 2.55, g: () => trainGeometry(2), s: 0.55 },
    { x: 3.65, g: () => topGeometry(1, 2), s: 1.2 },
    { x: 3.9, g: () => topGeometry(2, 0), s: 1.2 },
    { x: 4.7, g: plane(2), s: 0.58, ry: -0.4 },
    { x: 5.75, g: () => ballGeometry(1), s: 1.2 },
    { x: 6.55, g: horse(1), s: 0.4 },
  ]);
  return { toys: toys.build(), fur: fur.build() };
}

// ---------- assembled ----------

/** The workpiece on the lathe turns slowly, as if the lathe were idling. */
function LatheWork({ geo, mat }: { geo: THREE.BufferGeometry; mat: THREE.Material }) {
  const ref = useRef<THREE.Mesh>(null);
  const pivot = useMemo(() => new THREE.Vector3(BACK_BENCH.x0 + 0.18, TOP + 0.4, -5.78), []);
  const spin = useRef(0);
  useFrame((_, dt) => {
    // it runs while a maker works it (crew/signals), and winds down after
    const on = placeUse.get('lathe')?.act === 'lathe';
    spin.current += ((on ? 16 : 0) - spin.current) * (1 - Math.exp(-Math.min(0.1, dt) * (on ? 3 : 0.8)));
    if (ref.current) ref.current.rotation.x += dt * spin.current;
  });
  return (
    <group position={pivot}>
      <mesh ref={ref} geometry={geo} material={mat} castShadow />
    </group>
  );
}

export function ToolWall() {
  const m = benchMats();
  const toy = toyMat();
  const fur = furMat();
  const geo = useMemo(
    () =>
      once('ws:toolwall', () => {
        const lathe = latheGeometries();
        // the workpiece turns about the lathe's axis: re-centre it there
        lathe.work.translate(-(BACK_BENCH.x0 + 0.18), -(TOP + 0.4), 5.78);
        return {
          bench: benchGeometries(),
          under: underStock(),
          pegs: PEG.xs.map((_, i) => pegboardGeometries(i)),
          racks: rackGeometries(),
          ends: endRacks(),
          lathe,
          drill: drillGeometries(),
          paint: paintTable(),
          shelves: shelfGeometries(),
          jars: jarShelf(),
          toys: toyShelves(),
        };
      }),
    [],
  );
  const pegMats = useMemo(
    () =>
      PEG.xs.map((_, i) =>
        wmat(`b:pegboard:${i}`, () => {
          const panel = PANELS[i];
          const t = pegboardTex(`p${i}`, PEG.w, PEG.y1 - PEG.y0, 0.055, panel.map((h) => outline(h)), 70 + i);
          return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
        }),
      ),
    [],
  );
  const topFace = wmat('b:back-top-face', () => new THREE.MeshStandardMaterial({ map: backTopTex(), roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const handles = wmat('b:handles', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.6 }));
  const glass = wmat('b:jar-glass', () => new THREE.MeshPhysicalMaterial({ color: '#dfe8e4', transparent: true, opacity: 0.22, roughness: 0.06, clearcoat: 1, depthWrite: false }));
  const shelfWood = wmat('b:shelf', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-shelf', { w: 1024, h: 256, light: '#b48454', dark: '#5a3418', planks: 1, rings: 8, seed: 51, joints: false, seams: 0 }), roughness: 0.55, vertexColors: true }));
  const cx = (BACK_BENCH.x0 + BACK_BENCH.x1) / 2;
  return (
    <group>
      <mesh geometry={geo.bench.top} material={m.maple} position={[cx, TOP - 0.045, (BZ + FZ) / 2]} castShadow receiveShadow />
      <mesh geometry={geo.bench.face} material={topFace} position={[cx, TOP + 0.0005, (BZ + FZ) / 2]} receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={geo.bench.oak} material={m.oak} castShadow receiveShadow />
      <mesh geometry={geo.bench.pine} material={m.pine} receiveShadow userData={{ surface: 'shelf' }} />
      <mesh geometry={geo.bench.brass} material={m.brass} />
      <mesh geometry={geo.under} material={m.glaze} castShadow receiveShadow />
      {geo.pegs.map((p, i) => (
        <group key={i}>
          <mesh geometry={p.panel} material={pegMats[i]} receiveShadow userData={{ surface: 'wall' }} />
          <mesh geometry={p.frame} material={m.oak} castShadow receiveShadow />
          <mesh geometry={p.steel} material={m.steel} castShadow />
          <mesh geometry={p.wood} material={m.oak} castShadow />
          <mesh geometry={p.painted} material={handles} castShadow />
          <mesh geometry={p.pegs} material={m.steel} />
        </group>
      ))}
      <mesh geometry={geo.racks.wood} material={m.oak} castShadow receiveShadow />
      <mesh geometry={geo.racks.steel} material={m.steel} castShadow />
      <mesh geometry={geo.racks.vc} material={m.glaze} castShadow />
      <mesh geometry={geo.ends.wood} material={m.oak} castShadow />
      <mesh geometry={geo.ends.steel} material={m.steel} castShadow />
      <mesh geometry={geo.lathe.iron} material={m.iron} castShadow receiveShadow />
      <mesh geometry={geo.lathe.steel} material={m.steel} castShadow />
      <LatheWork geo={geo.lathe.work} mat={toy} />
      <mesh geometry={geo.drill.iron} material={m.iron} castShadow receiveShadow />
      <mesh geometry={geo.drill.steel} material={m.steel} castShadow />
      <mesh geometry={geo.paint.vc} material={m.glaze} castShadow receiveShadow />
      <mesh geometry={geo.paint.toys} material={toy} castShadow />
      <mesh geometry={geo.shelves.wood} material={shelfWood} castShadow receiveShadow userData={{ surface: 'shelf' }} />
      <mesh geometry={geo.shelves.iron} material={m.iron} castShadow />
      <mesh geometry={geo.jars.solid} material={m.glaze} castShadow receiveShadow />
      <mesh geometry={geo.jars.glass} material={glass} renderOrder={2} />
      <mesh geometry={geo.toys.toys} material={toy} castShadow receiveShadow />
      <mesh geometry={geo.toys.fur} material={fur} castShadow receiveShadow />
    </group>
  );
}

