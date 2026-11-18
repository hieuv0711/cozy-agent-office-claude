import { useMemo } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { BENCH, STATIONS } from '../workshop/plan';
import { BENCHES, TOP_T } from './workshop-dims';
import { C, fbm3, mapleTex, mapUV, Merger, noise3, once, paint, paintFlat, paintLathe, plank, rand, shadeBy, smoothLathe, smoothstep, tex, trs, V, wmat, woodTex } from './workshop-kit';
import { PAINT, toyMat } from './workshop-toys';

// The front workbenches, where the makers stand facing the camera: three
// solid benches end to end, each with a laminated maple top worn by years of
// work (glue and paint spots, pencil marks, saw nicks along the front, a row
// of bench-dog holes), square oak legs, drawers in the apron with turned
// knobs, low stretchers carrying a shelf of timber and tins, a wooden face
// vise at each outer end and an engineer's vise in the middle. The station
// zones stay clear; the clutter keeps to the front edge between them.

export function benchMats() {
  return {
    maple: wmat('b:maple', () => new THREE.MeshStandardMaterial({ map: mapleTex(), roughness: 0.55, vertexColors: true })),
    oak: wmat('b:oak', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-bench-oak', { w: 512, h: 256, light: '#9a6c40', dark: '#3a2212', planks: 1, rings: 9, seed: 5, joints: false, seams: 0, figure: 0.3 }), roughness: 0.55, vertexColors: true })),
    pine: wmat('b:pine', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-bench-pine', { w: 512, h: 256, light: '#d8b080', dark: '#8a6038', planks: 2, rings: 6, seed: 9, joints: false, seams: 0.4 }), roughness: 0.6, vertexColors: true })),
    steel: wmat('b:steel', () => new THREE.MeshStandardMaterial({ color: '#a8aeb4', metalness: 0.85, roughness: 0.38, vertexColors: true })),
    iron: wmat('b:iron', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.5 })),
    brass: wmat('b:brass', () => new THREE.MeshStandardMaterial({ color: '#c49a50', metalness: 0.9, roughness: 0.32 })),
    vc: wmat('b:vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })),
    glaze: wmat('b:glaze', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.18 })),
    bulb: wmat('b:bulb', () => new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: new THREE.Color('#ffcf88'), emissiveIntensity: 1.8, roughness: 0.3 })),
  };
}
export type BenchMats = ReturnType<typeof benchMats>;

const LEG = 0.13;
const UNDER = BENCH.top - TOP_T;
const FRONT = BENCH.front;
const BACKZ = BENCH.back;
const DEPTH = FRONT - BACKZ;

// ---------- the top's worn face ----------

/**
 * A bench top's face, painted once per bench: the maple grain at its true
 * size, glue and oil stains, dabs of toy paint, pencil lines and ticks, a mug
 * ring, saw nicks and dents along the front edge, and the bench-dog holes.
 * The canvas covers the top from x0 to x1 (u) and from the back edge to the
 * front (v).
 */
function benchTopTex(i: number, w: number) {
  const W = 2048;
  const H = Math.round((W * DEPTH) / w);
  return tex(`ws-bench-top:${i}`, W, H, (g) => {
    const grain = mapleTex().image as HTMLCanvasElement;
    // the grain tile covers 2.4 x 0.72 units
    const tw = (2.4 / w) * W;
    const th = (0.72 / DEPTH) * H;
    for (let x = 0; x < W; x += tw) for (let y = 0; y < H; y += th) g.drawImage(grain, x, y, tw, th);
    const r = rand(40 + i);
    const pxu = W / w;
    const X = (x: number) => x * pxu;
    const Z = (z: number) => ((z - BACKZ) / DEPTH) * H;
    // a darker, handled band along the front edge, a paler scrubbed middle
    const band = g.createLinearGradient(0, Z(FRONT - 0.3), 0, Z(FRONT));
    band.addColorStop(0, 'rgba(90,56,24,0)');
    band.addColorStop(1, 'rgba(90,56,24,0.22)');
    g.fillStyle = band;
    g.fillRect(0, 0, W, H);
    const blob = (x: number, y: number, rad: number, colr: string, a: number) => {
      const b = g.createRadialGradient(x, y, 0, x, y, rad);
      b.addColorStop(0, `rgba(${colr},${a})`);
      b.addColorStop(0.7, `rgba(${colr},${a * 0.5})`);
      b.addColorStop(1, `rgba(${colr},0)`);
      g.fillStyle = b;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    // glue and oil stains
    for (let k = 0; k < 26; k++) blob(r() * W, r() * H, 10 + r() * 50, r() < 0.5 ? '150,96,30' : '70,44,20', 0.08 + r() * 0.12);
    // glue drips: little glossy amber beads
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(200,140,50,${0.3 + r() * 0.3})`;
      g.beginPath();
      g.ellipse(r() * W, r() * H, 2 + r() * 5, 2 + r() * 4, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // dabs and drips of toy paint
    const paints = ['192,57,43', '44,93,156', '230,176,46', '58,131,80', '240,234,220', '220,111,42'];
    for (let k = 0; k < 34; k++) {
      const c = paints[Math.floor(r() * paints.length)];
      const x = r() * W;
      const y = r() * H;
      g.fillStyle = `rgba(${c},${0.55 + r() * 0.35})`;
      g.beginPath();
      g.ellipse(x, y, 2 + r() * 7, 2 + r() * 6, r() * 3, 0, Math.PI * 2);
      g.fill();
      if (r() < 0.5)
        for (let j = 0; j < 5; j++) {
          g.beginPath();
          g.arc(x + (r() - 0.5) * 40, y + (r() - 0.5) * 30, 0.8 + r() * 2, 0, Math.PI * 2);
          g.fill();
        }
    }
    // pencil: lines, ticks, a little sum-less tally, a circle
    g.strokeStyle = 'rgba(60,58,62,0.55)';
    g.lineCap = 'round';
    for (let k = 0; k < 22; k++) {
      g.lineWidth = 1 + r() * 0.8;
      const x = r() * W;
      const y = r() * H;
      g.beginPath();
      if (r() < 0.5) {
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 300, y + (r() - 0.5) * 30);
      } else {
        for (let t = 0; t < 6; t++) {
          g.moveTo(x + t * 9, y);
          g.lineTo(x + t * 9, y + (t % 5 === 0 ? 18 : 10));
        }
      }
      g.stroke();
    }
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(r() * W, H * 0.4, 30, 0, Math.PI * 2);
    g.stroke();
    // a mug ring
    g.strokeStyle = 'rgba(80,44,20,0.35)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(X(w * (0.2 + r() * 0.6)), Z(FRONT - 0.12), 0.07 * pxu, 0.3, Math.PI * 1.85);
    g.stroke();
    // saw nicks and dents along the front edge
    for (let k = 0; k < 70; k++) {
      const x = r() * W;
      g.strokeStyle = `rgba(40,24,10,${0.25 + r() * 0.35})`;
      g.lineWidth = 1 + r() * 1.5;
      g.beginPath();
      g.moveTo(x, H - 1);
      g.lineTo(x + (r() - 0.5) * 6, H - 6 - r() * 26);
      g.stroke();
    }
    for (let k = 0; k < 60; k++) blob(r() * W, r() * H, 2 + r() * 4, '40,24,10', 0.35);
    // a row of bench-dog holes near the front edge
    for (let x = 0.35; x < w - 0.2; x += 0.42) {
      const cx = X(x);
      const cy = Z(FRONT - 0.09);
      const rad = 0.022 * pxu;
      g.fillStyle = 'rgba(20,12,6,0.92)';
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,236,200,0.25)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, rad + 2, Math.PI * 0.1, Math.PI * 0.9);
      g.stroke();
    }
  });
}

// ---------- one bench ----------

/** The legs, aprons, stretchers and the lower shelf of one bench, in world coordinates. */
function benchFrame(x0: number, x1: number, seed: number) {
  const oak = new Merger();
  const pine = new Merger();
  const r = rand(seed);
  const tone = () => new THREE.Color().setScalar(0.86 + r() * 0.24);
  const mid = (x0 + x1) / 2;
  const legsX = [x0 + 0.16, mid, x1 - 0.16];
  const legsZ = [FRONT - 0.13, BACKZ + 0.13];
  for (const x of legsX)
    for (const z of legsZ) {
      const g = plank(LEG, UNDER, LEG, 0.022, [1 / 1.4, 1 / 1.4], 2, [r() * 4, r() * 4], true);
      // scuffed low down
      paint(g, (_x, y, _z, out) => out.setScalar(1 - smoothstep(-0.2, -0.4, y) * 0.15));
      oak.add(g, trs([x, UNDER / 2, z]), tone());
    }
  // the aprons under the top: front (with drawers), back, ends
  const apH = 0.16;
  oak.add(plank(x1 - x0 - 0.06, apH, 0.035, 0.01, [1 / 2.4, 1 / 2.4], 2, [r(), r()]), trs([mid, UNDER - apH / 2, FRONT - 0.12]), tone());
  oak.add(plank(x1 - x0 - 0.06, apH, 0.035, 0.01, [1 / 2.4, 1 / 2.4], 2, [r(), r()]), trs([mid, UNDER - apH / 2, BACKZ + 0.12]), tone());
  for (const x of [x0 + 0.16, x1 - 0.16]) oak.add(plank(0.035, apH, DEPTH - 0.3, 0.01, [1 / 2.4, 1 / 2.4], 2, [r(), r()]), trs([x, UNDER - apH / 2, (FRONT + BACKZ) / 2]), tone());
  // stretchers low down, front to back at the ends and along both sides
  const sy = 0.2;
  for (const x of legsX) oak.add(plank(0.06, 0.09, DEPTH - 0.26, 0.012, [1 / 2.4, 1 / 2.4], 2, [r(), r()]), trs([x, sy, (FRONT + BACKZ) / 2]), tone());
  for (const z of legsZ) oak.add(plank(x1 - x0 - 0.3, 0.09, 0.06, 0.012, [1 / 2.4, 1 / 2.4], 2, [r(), r()]), trs([mid, sy, z]), tone());
  // the shelf of boards resting on the stretchers
  const nb = 6;
  const bw = (DEPTH - 0.32) / nb;
  for (let k = 0; k < nb; k++) pine.add(plank(x1 - x0 - 0.42, 0.03, bw - 0.012, 0.008, [1 / 2.4, 1 / 1.2], 1, [r() * 3, r()]), trs([mid, sy + 0.06, BACKZ + 0.16 + bw * (k + 0.5)]), tone());
  return { oak: oak.build(), pine: pine.build(), legsX };
}

/** Drawer fronts in the front apron between the legs, with turned knobs. */
function drawers(x0: number, x1: number, seed: number) {
  const fronts = new Merger();
  const knobs = new Merger();
  const r = rand(seed + 3);
  const mid = (x0 + x1) / 2;
  const bays: [number, number][] = [
    [x0 + 0.16 + LEG / 2, mid - LEG / 2],
    [mid + LEG / 2, x1 - 0.16 - LEG / 2],
  ];
  const knob = smoothLathe(
    [
      [0, 0],
      [0.018, 0],
      [0.012, 0.012],
      [0.012, 0.022],
      [0.028, 0.035],
      [0.03, 0.045],
      [0.02, 0.055],
      [0, 0.057],
    ],
    16,
    18,
  ).rotateX(Math.PI / 2);
  for (const [a, b] of bays) {
    const w = Math.min(0.8, (b - a) * 0.42);
    for (const c of [a + (b - a) * 0.28, a + (b - a) * 0.72]) {
      fronts.add(plank(w, 0.128, 0.03, 0.01, [1 / 2.4, 1 / 2.4], 2, [r(), r()]), trs([c, UNDER - 0.08, FRONT - 0.09]), new THREE.Color().setScalar(0.8 + r() * 0.3));
      knobs.add(knob, trs([c, UNDER - 0.08, FRONT - 0.075]));
    }
  }
  return { fronts: fronts.build(), knobs: knobs.build() };
}

// ---------- vises ----------

/** A wooden face vise hung under the front edge: a thick outer jaw, a steel screw and two guide bars, a sliding T-handle. */
function faceVise(x: number, open: number) {
  const wood = new Merger();
  const steel = new Merger();
  const jw = 0.6;
  const jz = FRONT + 0.05 + open;
  wood.add(plank(jw, 0.3, 0.09, 0.02, [1 / 1.4, 1 / 1.4], 2, [0.3, 0.1]), trs([x, BENCH.top - 0.15, jz]));
  // the screw's hub and a T-handle through it
  wood.add(
    smoothLathe(
      [
        [0, 0],
        [0.06, 0],
        [0.065, 0.02],
        [0.05, 0.07],
        [0.045, 0.1],
        [0, 0.1],
      ],
      16,
      24,
    ).rotateX(Math.PI / 2),
    trs([x, BENCH.top - 0.16, jz + 0.045]),
  );
  wood.add(tubeThrough([V(x - 0.26, BENCH.top - 0.16, jz + 0.12), V(x + 0.18, BENCH.top - 0.16, jz + 0.12)], () => 0.018, 2, 10).geometry);
  for (const ex of [x - 0.27, x + 0.19]) wood.add(new THREE.SphereGeometry(0.03, 12, 8), trs([ex, BENCH.top - 0.16, jz + 0.12]));
  steel.add(tubeThrough([V(x, BENCH.top - 0.16, jz + 0.03), V(x, BENCH.top - 0.16, FRONT - 0.2)], () => 0.022, 2, 12).geometry);
  for (const gx of [x - 0.2, x + 0.2]) steel.add(tubeThrough([V(gx, BENCH.top - 0.19, jz), V(gx, BENCH.top - 0.19, FRONT - 0.2)], () => 0.012, 2, 8).geometry);
  return { wood: wood.build(), steel: steel.build() };
}

/** A cast-iron engineer's vise in machine blue, bolted over the front edge, its jaws facing along x. */
function engineerVise(x: number) {
  const iron = new Merger();
  const steel = new Merger();
  const blue = C('#3c5a6e');
  const y0 = BENCH.top;
  const z = FRONT - 0.12;
  iron.add(plank(0.24, 0.04, 0.22, 0.015), trs([x, y0 + 0.02, z]), blue);
  iron.add(
    smoothLathe(
      [
        [0, 0],
        [0.08, 0],
        [0.085, 0.015],
        [0.07, 0.03],
        [0, 0.03],
      ],
      10,
      24,
    ),
    trs([x, y0 + 0.04, z]),
    blue,
  );
  // the fixed jaw body and the sliding jaw on its bar
  iron.add(plank(0.13, 0.15, 0.14, 0.03), trs([x - 0.05, y0 + 0.14, z]), blue);
  iron.add(plank(0.12, 0.13, 0.13, 0.03), trs([x + 0.11, y0 + 0.145, z]), blue);
  iron.add(plank(0.2, 0.06, 0.08, 0.015), trs([x + 0.06, y0 + 0.1, z]), blue);
  // steel jaw plates, the screw and its tommy bar
  steel.add(plank(0.012, 0.06, 0.15, 0.003), trs([x + 0.022, y0 + 0.19, z]));
  steel.add(plank(0.012, 0.06, 0.15, 0.003), trs([x + 0.045, y0 + 0.19, z]));
  steel.add(tubeThrough([V(x + 0.17, y0 + 0.12, z), V(x + 0.27, y0 + 0.12, z)], () => 0.016, 2, 10).geometry);
  steel.add(tubeThrough([V(x + 0.27, y0 + 0.12, z - 0.16), V(x + 0.27, y0 + 0.12, z + 0.16)], () => 0.009, 2, 8).geometry);
  for (const ez of [z - 0.17, z + 0.17]) steel.add(new THREE.SphereGeometry(0.018, 10, 8), trs([x + 0.27, y0 + 0.12, ez]));
  // chipped paint showing the iron, a little rust
  const ironG = iron.build();
  shadeBy(ironG, (px, py, pz) => 0.85 + 0.25 * noise3(px * 30, py * 30, pz * 30));
  return { iron: ironG, steel: steel.build() };
}

// ---------- bench clutter (outside the stations' zones) ----------

/** An earthenware crock of paintbrushes and pencils. */
function brushCrock() {
  const m = new Merger();
  const n = 40;
  const crock = smoothLathe(
    [
      [0, 0],
      [0.07, 0],
      [0.078, 0.01],
      [0.082, 0.1],
      [0.078, 0.18],
      [0.084, 0.195],
      [0.076, 0.2],
      [0.07, 0.19],
      [0.068, 0.04],
      [0, 0.035],
    ],
    n,
    32,
  );
  paintLathe(crock, n, (x, y, z, along, out) => {
    out.set('#3e6e6a');
    if (y < 0.035 && along < 0.4) out.set('#8a6a4a');
    out.multiplyScalar(0.85 + 0.2 * noise3(x * 40, y * 40, z * 40));
    if (along > 0.6) out.multiplyScalar(0.5);
  });
  m.add(crock);
  const r = rand(5);
  const handles = [PAINT.red, PAINT.yellow, PAINT.black, PAINT.beech, PAINT.blue, '#2a6a3a', PAINT.beech, PAINT.red];
  handles.forEach((hc, i) => {
    const a = (i / handles.length) * Math.PI * 2 + r();
    const rr = 0.03 + r() * 0.025;
    const tilt = 0.12 + r() * 0.12;
    const base = V(Math.cos(a) * rr * 0.4, 0.05, Math.sin(a) * rr * 0.4);
    const top = V(Math.cos(a) * (rr + tilt * 0.3), 0.32 + r() * 0.08, Math.sin(a) * (rr + tilt * 0.3));
    const dir = top.clone().sub(base).normalize();
    const handle = tubeThrough([base, top], (t) => 0.009 - t * 0.003, 2, 8).geometry;
    paintFlat(handle, hc);
    m.add(handle);
    // a ferrule and the bristles (or a sharpened pencil point)
    const fer = tubeThrough([top, top.clone().addScaledVector(dir, 0.03)], () => 0.0075, 2, 8).geometry;
    paintFlat(fer, '#b8bcc0');
    m.add(fer);
    const tip = tubeThrough([top.clone().addScaledVector(dir, 0.03), top.clone().addScaledVector(dir, 0.075)], (t) => 0.008 * (1 - t * 0.85), 4, 8).geometry;
    paintFlat(tip, i % 3 === 0 ? '#e8d2a8' : i % 3 === 1 ? '#3a2a1e' : '#c0392b');
    m.add(tip);
  });
  return m.build();
}

/** A smoothing plane: a cast-iron body on a ground sole, the iron and its lever cap, a rosewood tote and knob, a brass wheel. Along x, sole on y = 0. */
function benchPlane() {
  const iron = new Merger();
  const steel = new Merger();
  const wood = new Merger();
  const brass = new Merger();
  const L = 0.42;
  const W = 0.11;
  steel.add(plank(L, 0.014, W, 0.004), trs([0, 0.007, 0]));
  // the body's sides: low walls rising toward the middle, japanned black with ground edges
  const side = new THREE.Shape();
  side.moveTo(-L / 2, 0);
  side.lineTo(L / 2, 0);
  side.quadraticCurveTo(L / 2 - 0.01, 0.03, L / 2 - 0.06, 0.035);
  side.quadraticCurveTo(0.05, 0.075, 0, 0.078);
  side.quadraticCurveTo(-0.08, 0.075, -L / 2 + 0.05, 0.035);
  side.quadraticCurveTo(-L / 2 + 0.01, 0.03, -L / 2, 0);
  const sideG = new THREE.ExtrudeGeometry(side, { depth: 0.01, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1, curveSegments: 8 });
  for (const s of [-1, 1]) iron.add(sideG, trs([0, 0.012, s * (W / 2 - 0.006) - 0.005]), C('#1c1c22'));
  iron.add(plank(L - 0.08, 0.02, W - 0.02, 0.004), trs([0, 0.022, 0]), C('#1c1c22'));
  // the iron (blade) bedded at 45 degrees, its lever cap in nickel over it
  steel.add(plank(0.2, 0.004, W - 0.03, 0.002), trs([0.0, 0.085, 0], [0, 0, -Math.PI / 4]));
  const cap = new THREE.Shape();
  cap.moveTo(-0.035, 0);
  cap.lineTo(0.035, 0);
  cap.lineTo(0.04, 0.09);
  cap.quadraticCurveTo(0, 0.11, -0.04, 0.09);
  cap.closePath();
  steel.add(new THREE.ExtrudeGeometry(cap, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 8 }).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4), trs([0.0, 0.1, 0.035]));
  // the tote: a pistol grip with a hole for the fingers
  const tote = new THREE.Shape();
  tote.moveTo(-0.02, 0);
  tote.lineTo(0.06, 0);
  tote.quadraticCurveTo(0.03, 0.06, 0.05, 0.13);
  tote.quadraticCurveTo(0.04, 0.17, 0.0, 0.16);
  tote.quadraticCurveTo(-0.04, 0.1, -0.02, 0);
  const hole = new THREE.Path();
  hole.moveTo(0.0, 0.03);
  hole.lineTo(0.03, 0.03);
  hole.quadraticCurveTo(0.012, 0.08, 0.025, 0.12);
  hole.quadraticCurveTo(-0.005, 0.1, 0.0, 0.03);
  tote.holes.push(hole);
  wood.add(new THREE.ExtrudeGeometry(tote, { depth: 0.03, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 10 }), trs([-0.17, 0.03, -0.015]), C('#6a2e1a'));
  wood.add(
    smoothLathe(
      [
        [0, 0],
        [0.025, 0],
        [0.032, 0.03],
        [0.03, 0.06],
        [0.02, 0.075],
        [0, 0.078],
      ],
      14,
      18,
    ),
    trs([0.14, 0.03, 0]),
    C('#6a2e1a'),
  );
  brass.add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 18).rotateZ(Math.PI / 2), trs([-0.06, 0.06, 0]));
  return { iron: iron.build(), steel: steel.build(), wood: wood.build(), brass: brass.build() };
}

/** A little heap of offcuts: blocks, a round, a triangle of plywood, a dowel stub. */
function offcuts(seed: number) {
  const m = new Merger();
  const r = rand(seed);
  const tones = ['#e2c294', '#c89a64', '#a8703e', '#e8d2a8', '#7a4a28'];
  for (let i = 0; i < 6; i++) {
    const w = 0.05 + r() * 0.12;
    const h = 0.03 + r() * 0.05;
    const d = 0.05 + r() * 0.08;
    const g = plank(w, h, d, 0.006, [6, 6], 1, [r(), r()]);
    paintFlat(g, tones[i % tones.length]);
    m.add(g, trs([(r() - 0.5) * 0.3, h / 2 + (i > 3 ? 0.04 : 0), (r() - 0.5) * 0.16], [0, r() * 3, i > 3 ? 0.3 : 0]));
  }
  const round = new THREE.CylinderGeometry(0.05, 0.05, 0.035, 20);
  paintFlat(round, '#e2c294');
  m.add(round, trs([0.17, 0.018, 0.02]));
  const dowel = new THREE.CylinderGeometry(0.014, 0.014, 0.22, 10).rotateZ(Math.PI / 2);
  paintFlat(dowel, '#e8d2a8');
  m.add(dowel, trs([-0.05, 0.014, 0.1], [0, 0.4, 0]));
  return m.build();
}

/** An articulated bench lamp clamped at the end of the bench, its shade bent down over the work. Parts: dark iron, the shade, the bulb. */
function benchLampGeometries() {
  const iron = new Merger();
  const base = smoothLathe(
    [
      [0, 0],
      [0.12, 0],
      [0.125, 0.012],
      [0.1, 0.03],
      [0.03, 0.04],
      [0.025, 0.06],
      [0, 0.06],
    ],
    14,
    28,
  );
  iron.add(base);
  const p0 = V(0, 0.06, 0);
  const p1 = V(-0.05, 0.52, 0.02);
  const p2 = V(-0.38, 0.72, 0.03);
  iron.add(tubeThrough([p0, p1], () => 0.012, 2, 8).geometry);
  iron.add(tubeThrough([p1, p2], () => 0.011, 2, 8).geometry);
  for (const p of [p1, p2]) iron.add(new THREE.SphereGeometry(0.024, 12, 8), trs([p.x, p.y, p.z]));
  // a spring along each arm
  for (const [a, b] of [
    [p0, p1],
    [p1, p2],
  ]) {
    const pts: THREE.Vector3[] = [];
    const d = b.clone().sub(a);
    const side = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= 60; i++) {
      const t = 0.15 + (i / 60) * 0.7;
      const q = a.clone().addScaledVector(d, t).addScaledVector(side, 0.03);
      const ang = i * 1.1;
      q.x += Math.cos(ang) * 0.008;
      q.y += Math.sin(ang) * 0.008;
      pts.push(q);
    }
    iron.add(tubeThrough(pts, () => 0.003, 120, 4).geometry);
  }
  const n = 40;
  const shade = smoothLathe(
    [
      [0.03, 0.06],
      [0.04, 0.05],
      [0.05, 0.0],
      [0.09, -0.05],
      [0.12, -0.11],
      [0.125, -0.12],
      [0.115, -0.115],
      [0.085, -0.055],
      [0.045, -0.005],
      [0.03, 0.04],
    ],
    n,
    36,
  );
  paintLathe(shade, n, (_x, _y, _z, along, out) => out.set(along < 0.55 ? '#2c4a3a' : '#f4efe2'));
  const bulb = new THREE.SphereGeometry(0.045, 16, 12);
  // the shade tipped down toward the bench, at the end of the upper arm
  return { iron: iron.build(), shade, bulb, shadeAt: [p2.x - 0.02, p2.y - 0.03, p2.z] as [number, number, number] };
}

// ---------- things on the lower shelves ----------

/** Short boards stacked flat, a box of wheels, paint tins: what lives under a bench. */
function shelfStock(x0: number, x1: number, seed: number) {
  const wood = new Merger();
  const vc = new Merger();
  const r = rand(seed);
  const y = 0.275;
  const zc = (FRONT + BACKZ) / 2 + 0.05;
  const tones = ['#d8b080', '#b07a48', '#e2c8a0', '#8a5a34', '#c49060'];
  const kind = seed % 3;
  // a stack of short boards toward one end
  const sx = kind === 1 ? x1 - 0.95 : x0 + 0.95;
  for (let k = 0; k < 5; k++) {
    const len = 0.9 + r() * 0.5;
    const g = plank(len, 0.045, 0.2 + r() * 0.12, 0.008, [1 / 2.4, 1 / 1.2], 1, [r() * 3, r()]);
    paintFlat(g, tones[k % tones.length]);
    wood.add(g, trs([sx + (r() - 0.5) * 0.12, y + 0.025 + k * 0.047, zc - 0.25 + (r() - 0.5) * 0.08], [0, (r() - 0.5) * 0.08, 0]));
  }
  // a wooden box of turned wheels
  const bx = (x0 + x1) / 2 + (kind === 2 ? -0.3 : 0.25);
  const box = new Merger();
  box.add(plank(0.5, 0.025, 0.34, 0.006), trs([0, 0.0125, 0]));
  for (const s of [-1, 1]) {
    box.add(plank(0.5, 0.16, 0.025, 0.006), trs([0, 0.08, s * 0.16]));
    box.add(plank(0.025, 0.16, 0.34, 0.006), trs([s * 0.24, 0.08, 0]));
  }
  const boxG = box.build();
  paint(boxG, (_x, _y, _z, out) => out.set('#b48a5a'));
  wood.add(boxG, trs([bx, y, zc]));
  for (let k = 0; k < 9; k++) {
    const wr = 0.045 + r() * 0.02;
    const wheel = new THREE.CylinderGeometry(wr, wr, 0.03, 18);
    paintFlat(wheel, k % 3 === 0 ? PAINT.red : '#e2c294');
    vc.add(wheel, trs([bx + (r() - 0.5) * 0.36, y + 0.07 + r() * 0.07, zc + (r() - 0.5) * 0.2], [r() * 1.4, r(), r() * 1.4]));
  }
  // paint tins: coloured bands and a drip, lids on
  const tx = kind === 1 ? x0 + 0.7 : x1 - 0.7;
  for (let k = 0; k < (kind === 0 ? 3 : 2); k++) {
    const n = 20;
    const c = [PAINT.red, PAINT.blue, PAINT.yellow, PAINT.green][(seed + k) % 4];
    const tin = smoothLathe(
      [
        [0, 0],
        [0.075, 0],
        [0.078, 0.008],
        [0.078, 0.15],
        [0.072, 0.158],
        [0.06, 0.162],
        [0, 0.162],
      ],
      n,
      24,
    );
    paintLathe(tin, n, (px, py, pz, _a, out) => {
      out.set('#9aa0a6');
      if (py > 0.04 && py < 0.12) out.set(c);
      if (py > 0.155) out.set(c);
      const a = Math.atan2(pz, px);
      if (Math.abs(a - 1.2) < 0.15 && py > 0.06 && py < 0.16) out.set(c);
    });
    vc.add(tin, trs([tx + k * 0.18, y, zc + 0.1 - k * 0.12]));
  }
  return { wood: wood.build(), vc: vc.build() };
}

// ---------- assembled ----------

export function FrontBenches() {
  const m = benchMats();
  const toy = toyMat();
  const geo = useMemo(
    () =>
      once('ws:benches', () => {
        const frames = BENCHES.map((b, i) => benchFrame(b.x0, b.x1, 10 + i));
        const tops = BENCHES.map((b, i) => {
          const w = b.x1 - b.x0;
          const body = plank(w, TOP_T, DEPTH, 0.02, [1 / 2.4, 1 / 0.72], 3, [i * 0.37, i * 0.21]);
          shadeBy(body, (x, y, z) => 0.92 + 0.12 * fbm3(x * 0.8 + i, y, z * 0.8));
          // the worn face: a plane just over the top, inset by the rounded edge
          const face = new THREE.PlaneGeometry(w - 0.03, DEPTH - 0.03, 1, 1).rotateX(-Math.PI / 2);
          mapUV(face, (x, _y, z) => [(x + w / 2) / w, 1 - (z + DEPTH / 2) / DEPTH]);
          return { body, face, w, i };
        });
        const draw = BENCHES.map((b, i) => drawers(b.x0, b.x1, 20 + i));
        const stock = BENCHES.map((b, i) => shelfStock(b.x0, b.x1, 30 + i));
        const viseL = faceVise(BENCHES[0].x0 + 0.62, 0.06);
        const viseR = faceVise(BENCHES[2].x1 - 0.62, 0.03);
        const eng = engineerVise(0);
        return { frames, tops, draw, stock, viseL, viseR, eng, crock: brushCrock(), plane: benchPlane(), offcuts: [offcuts(3), offcuts(8)], lamp: benchLampGeometries() };
      }),
    [],
  );
  const faces = useMemo(() => geo.tops.map((t) => wmat(`b:top-face:${t.i}`, () => new THREE.MeshStandardMaterial({ map: benchTopTex(t.i, t.w), roughness: 0.52, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))), [geo]);
  // the clutter sits on the front strip, between the stations
  const between = (a: number, b: number) => (STATIONS[a].x + STATIONS[b].x) / 2;
  const stripZ = FRONT - 0.17;
  return (
    <group>
      {BENCHES.map((b, i) => {
        const t = geo.tops[i];
        const cx = (b.x0 + b.x1) / 2;
        return (
          <group key={i}>
            <mesh geometry={t.body} material={m.maple} position={[cx, BENCH.top - TOP_T / 2, (FRONT + BACKZ) / 2]} castShadow receiveShadow />
            <mesh geometry={t.face} material={faces[i]} position={[cx, BENCH.top + 0.0005, (FRONT + BACKZ) / 2]} receiveShadow userData={{ surface: 'top' }} />
            <mesh geometry={geo.frames[i].oak} material={m.oak} castShadow receiveShadow />
            <mesh geometry={geo.frames[i].pine} material={m.pine} castShadow receiveShadow />
            <mesh geometry={geo.draw[i].fronts} material={m.oak} castShadow receiveShadow />
            <mesh geometry={geo.draw[i].knobs} material={m.oak} castShadow />
            <mesh geometry={geo.stock[i].wood} material={m.pine} castShadow receiveShadow />
            <mesh geometry={geo.stock[i].vc} material={m.glaze} castShadow receiveShadow />
          </group>
        );
      })}
      <mesh geometry={geo.viseL.wood} material={m.oak} castShadow receiveShadow />
      <mesh geometry={geo.viseL.steel} material={m.steel} castShadow />
      <mesh geometry={geo.viseR.wood} material={m.oak} castShadow receiveShadow />
      <mesh geometry={geo.viseR.steel} material={m.steel} castShadow />
      <mesh geometry={geo.eng.iron} material={m.iron} castShadow receiveShadow />
      <mesh geometry={geo.eng.steel} material={m.steel} castShadow />
      {/* a crock of brushes at the left end, a plane and offcuts between stations, a lamp at the right end */}
      <mesh geometry={geo.crock} material={m.glaze} position={[BENCH.x0 + 0.17, BENCH.top, stripZ - 0.02]} castShadow receiveShadow />
      <group position={[between(4, 2), BENCH.top, stripZ + 0.03]} rotation={[0, 0.25, 0]}>
        <mesh geometry={geo.plane.iron} material={m.iron} castShadow />
        <mesh geometry={geo.plane.steel} material={m.steel} castShadow />
        <mesh geometry={geo.plane.wood} material={m.glaze} castShadow />
        <mesh geometry={geo.plane.brass} material={m.brass} />
      </group>
      <mesh geometry={geo.offcuts[0]} material={toy} position={[between(3, 5), BENCH.top, stripZ + 0.02]} rotation={[0, 0.5, 0]} castShadow receiveShadow />
      <mesh geometry={geo.offcuts[1]} material={toy} position={[between(2, 0) - 0.05, BENCH.top, stripZ + 0.04]} rotation={[0, -0.3, 0]} castShadow receiveShadow />
      <group position={[BENCH.x1 - 0.13, BENCH.top, stripZ - 0.05]} rotation={[0, 0.35, 0]}>
        <mesh geometry={geo.lamp.iron} material={m.iron} castShadow />
        <group position={geo.lamp.shadeAt} rotation={[0, 0, 0.75]}>
          <mesh geometry={geo.lamp.shade} material={m.glaze} castShadow />
          <mesh geometry={geo.lamp.bulb} material={m.bulb} position={[0, -0.06, 0]} />
        </group>
      </group>
    </group>
  );
}

