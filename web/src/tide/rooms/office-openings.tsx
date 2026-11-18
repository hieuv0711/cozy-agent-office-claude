import { useMemo } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { WindowWeather } from '../weather';
import { archOf, BACK_OPENINGS, DOORWAY, GLASS_IN, headAt, type Opening, ROOM, SIDE_OPENING, SILL_OUT, WALL_T } from './office-dims';
import { bumpTex, C, fbm3, Merger, mix, noise3, omat, once, paint, plank, rand, smoothLathe, smoothstep, steelRough, tex, trs, V, woodTex } from './office-kit';
import { OutsideViews } from './office-outside';
import { BelowCeiling } from './office-shell';

// The openings in the brick: three tall steel-framed windows in the back wall
// and one by the lounge, each under a segmental arch, glazed in small panes
// with a pale stone sill inside (the city and the weather beyond); and the
// door to the stair landing at the back right, standing open onto a warm lit
// hallway whose light spills across the floor.

const BZ = ROOM.back;

export function openingMats() {
  return {
    steel: omat('win-steel', () => new THREE.MeshStandardMaterial({ color: '#191a1b', roughnessMap: steelRough(), roughness: 0.62, metalness: 0.6, vertexColors: true })),
    sill: omat('win-sill', () => new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.78, bumpMap: bumpTex('o-stone', { scale: 6, contrast: 0.7 }), bumpScale: 0.6, vertexColors: true })),
    glass: omat('win-glass', () => new THREE.MeshPhysicalMaterial({ color: '#9fb6d2', transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false })),
    doorPaint: omat('door-paint', () => new THREE.MeshPhysicalMaterial({ color: '#23392f', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, bumpMap: bumpTex('o-paint', { scale: 10, contrast: 0.5 }), bumpScale: 0.25, vertexColors: true })),
    lining: omat('door-lining', () => new THREE.MeshStandardMaterial({ map: woodTex('o-lining', { w: 512, h: 128, light: '#5a3a24', dark: '#1c1008', planks: 1, rings: 7, seed: 5, joints: false, seams: 0 }), roughness: 0.55, vertexColors: true })),
    brass: omat('door-brass', () => new THREE.MeshStandardMaterial({ color: '#c39a52', metalness: 0.92, roughness: 0.3 })),
    reeded: omat('door-reeded', () => new THREE.MeshStandardMaterial({ map: reededTex(), emissiveMap: reededTex(), emissive: new THREE.Color('#ffc58a'), emissiveIntensity: 0.55, roughness: 0.25, transparent: true, opacity: 0.92 })),
    hall: omat('hall', () => new THREE.MeshBasicMaterial({ vertexColors: true })),
    sconce: omat('hall-sconce', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(2.2), toneMapped: false, side: THREE.DoubleSide })),
    spill: omat('hall-spill', () => new THREE.MeshBasicMaterial({ map: spillTex(), color: new THREE.Color('#ffb46a').multiplyScalar(0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
  };
}
type OMats = ReturnType<typeof openingMats>;

/** Pale limestone with fossil flecks and a few stains (window sills). */
function stoneTex() {
  return tex('o-stone', 512, 512, (g, w, h) => {
    const r = rand(66);
    g.fillStyle = '#c9bfae';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = r() * w;
      const y = r() * h;
      const rr = 10 + r() * 60;
      const b = g.createRadialGradient(x, y, 0, x, y, rr);
      b.addColorStop(0, `rgba(${r() < 0.5 ? '150,136,112' : '230,224,210'},${0.12 + r() * 0.12})`);
      b.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = b;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.6 ? `rgba(110,98,80,${0.15 + r() * 0.3})` : `rgba(245,240,230,${0.2 + r() * 0.3})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
  });
}

/** Reeded glass lit from behind: soft vertical ribs, warmer in the middle. */
function reededTex() {
  return tex('o-reeded', 256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.5, w * 0.75);
    grad.addColorStop(0, '#fff0d6');
    grad.addColorStop(1, '#c08850');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      const b = g.createLinearGradient(x, 0, x + 8, 0);
      b.addColorStop(0, 'rgba(60,30,10,0.25)');
      b.addColorStop(0.5, 'rgba(255,255,255,0.18)');
      b.addColorStop(1, 'rgba(60,30,10,0.25)');
      g.fillStyle = b;
      g.fillRect(x, 0, 8, h);
    }
  });
}

/** The light from the hallway on the floor: a soft-edged fan widening into the room. */
function spillTex() {
  return tex(
    'o-spill',
    256,
    256,
    (g, w, h) => {
      // the doorway is at the top edge; the light fans out and fades toward the bottom
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const half = (0.32 + t * 0.34) * w;
        const a = Math.pow(1 - t, 1.6) * 0.9;
        const grad = g.createLinearGradient(w / 2 - half, 0, w / 2 + half, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.18, `rgba(255,255,255,${a})`);
        grad.addColorStop(0.82, `rgba(255,255,255,${a})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, y, w, 1);
      }
    },
    { repeat: false },
  );
}

// ---------- steel windows ----------

/** The outline of an arched opening (in its wall frame), inset by `d`, as points from the left springing over the arch. */
function archOutline(o: Opening, d: number, n = 28) {
  const a = archOf(o);
  const R = a.R - d;
  const half = Math.asin(Math.min(0.999, ((o.u1 - o.u0) / 2 - d) / R));
  const pts: THREE.Vector2[] = [new THREE.Vector2(o.u0 + d, o.y0 + d)];
  for (let i = 0; i <= n; i++) {
    const t = -half + (2 * half * i) / n;
    pts.push(new THREE.Vector2(a.cu + Math.sin(t) * R, a.cy + Math.cos(t) * R));
  }
  pts.push(new THREE.Vector2(o.u1 - d, o.y0 + d));
  return pts;
}

/**
 * A steel window filling an arched opening: an outer frame, a heavier
 * transom at the springing, slim T-bar glazing bars in a grid of small panes
 * (radial bars in the arched head), a centre-pivot vent with its stay, the
 * glass, the weather on it, and the stone sill. In the opening's wall frame;
 * the glass stands GLASS_IN back from the wall's face.
 */
function windowGeometries(o: Opening, cols: number, rows: number, seed: number) {
  const frame = new Merger();
  const zg = -GLASS_IN;
  const F = 0.075; // outer frame width
  const B = 0.034; // glazing bar width
  const BD = 0.055; // bar depth
  const outer = new THREE.Shape(archOutline(o, 0));
  outer.holes.push(new THREE.Path(archOutline(o, F).reverse()));
  const og = new THREE.ExtrudeGeometry(outer, { depth: 0.07, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 4 });
  og.translate(0, 0, zg - 0.035);
  frame.add(og);
  const iu0 = o.u0 + F;
  const iu1 = o.u1 - F;
  const iy0 = o.y0 + F;
  const iys = o.ys;
  const xs: number[] = [];
  const ys: number[] = [];
  // the transom at the springing line
  frame.add(plank(iu1 - iu0, 0.06, 0.08, 0.008, 1, 1), trs([(iu0 + iu1) / 2, iys, zg]));
  // horizontal bars below it
  for (let j = 1; j < rows; j++) {
    const y = iy0 + ((iys - 0.03 - iy0) * j) / rows;
    frame.add(plank(iu1 - iu0, B, BD, 0.006, 1, 1), trs([(iu0 + iu1) / 2, y, zg]));
    ys.push(y);
  }
  ys.push(iys);
  // vertical bars, through the head up to the arch
  for (let i = 1; i < cols; i++) {
    const u = iu0 + ((iu1 - iu0) * i) / cols;
    const top = headAt(o, u) - F + 0.01;
    frame.add(plank(B, top - iy0, BD, 0.006, 1, 1), trs([u, (iy0 + top) / 2, zg]));
    xs.push(u);
  }
  // the vent: a heavier frame round the two middle panes of the second row, pivoting open a crack
  const vi = Math.floor(cols / 2) - 1;
  const vu0 = iu0 + ((iu1 - iu0) * vi) / cols;
  const vu1 = iu0 + ((iu1 - iu0) * (vi + 2)) / cols;
  const vy0 = iy0 + ((iys - 0.03 - iy0) * 1) / rows;
  const vy1 = iy0 + ((iys - 0.03 - iy0) * 2) / rows;
  for (const y of [vy0, vy1]) frame.add(plank(vu1 - vu0, 0.05, 0.075, 0.008, 1, 1), trs([(vu0 + vu1) / 2, y, zg + 0.012]));
  for (const u of [vu0, vu1]) frame.add(plank(0.05, vy1 - vy0, 0.075, 0.008, 1, 1), trs([u, (vy0 + vy1) / 2, zg + 0.012]));
  // its stay arm and a small cam handle
  frame.add(plank(0.018, 0.018, 0.22, 0.004, 1, 1), trs([vu1 - 0.12, vy0 + 0.05, zg + 0.1], [0.35, 0, 0]));
  frame.add(new THREE.SphereGeometry(0.03, 12, 8), trs([(vu0 + vu1) / 2, vy0 + 0.06, zg + 0.07]));
  frame.add(plank(0.11, 0.025, 0.025, 0.008, 1, 1), trs([(vu0 + vu1) / 2 + 0.05, vy0 + 0.06, zg + 0.085], [0, 0, -0.5]));
  const frameG = paint(frame.build(), (x, y, z, out) => {
    out.setScalar(0.92 + 0.1 * noise3(x * 6, y * 6, z * 6 + seed));
    // old paint worn to bare steel and a little rust along the bottom
    mix(out, out, C('#5a3420'), smoothstep(0.5, 0.75, noise3(x * 3, y * 3 + seed, z)) * smoothstep(o.y0 + 0.5, o.y0, y) * 0.6);
  });
  // the glass and its shape (centred on the opening's rectangle for the weather)
  const cu = (o.u0 + o.u1) / 2;
  const cy = (o.y0 + o.y1) / 2;
  const paneShape = new THREE.Shape(archOutline(o, F * 0.5).map((p) => new THREE.Vector2(p.x - cu, p.y - cy)));
  const pane = new THREE.ShapeGeometry(paneShape, 24);
  // the stone sill: through the reveal to the glass, and standing out from the wall
  const sd = GLASS_IN + SILL_OUT;
  const sill = plank(o.u1 - o.u0 + 0.36, 0.1, sd, 0.025, [1 / 1.4, 1 / 1.4], 2);
  paint(sill, (x, _y, z, out) => {
    out.setScalar(0.92 + 0.12 * fbm3(x * 2 + seed, 1, z * 2));
    out.multiplyScalar(1 - smoothstep(0.0, -0.2, z) * 0.1);
  });
  sill.translate(cu, o.y0 - 0.05, -GLASS_IN + sd / 2);
  // the weather sees the transom and every other bar (snow on every one of them is too busy)
  const wy = ys.filter((_y, i) => i === ys.length - 1 || i % 2 === 1);
  return { frame: frameG, pane, sill, bars: { x: xs.map((u) => u - cu), y: wy.map((y) => y - cy) }, centre: [cu, cy, zg] as [number, number, number] };
}

function SteelWindow({ o, place, cols, rows, seed, m }: { o: Opening; place: THREE.Matrix4; cols: number; rows: number; seed: number; m: OMats }) {
  const g = useMemo(() => once(`office:window:${seed}`, () => windowGeometries(o, cols, rows, seed)), [o, cols, rows, seed]);
  const { pos, quat } = useMemo(() => {
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    place.decompose(p, q, new THREE.Vector3());
    return { pos: p, quat: q };
  }, [place]);
  const [cu, cy, zg] = g.centre;
  return (
    <group position={pos} quaternion={quat}>
      <mesh geometry={g.frame} material={m.steel} castShadow receiveShadow />
      <mesh geometry={g.sill} material={m.sill} castShadow receiveShadow userData={{ surface: 'sill' }} />
      <mesh geometry={g.pane} material={m.glass} position={[cu, cy, zg - 0.03]} renderOrder={3} />
      <group position={[cu, cy, zg + 0.035]}>
        <WindowWeather width={o.u1 - o.u0} height={o.y1 - o.y0} geometry={g.pane} bars={g.bars} warm="#ffc890" cool="#7f9cc8" />
      </group>
    </group>
  );
}

export function Windows() {
  const m = openingMats();
  const back = useMemo(() => trs([0, 0, BZ]), []);
  const side = useMemo(() => trs([ROOM.x0, 0, 0], [0, Math.PI / 2, 0]), []);
  return (
    <group>
      {BACK_OPENINGS.map((o, i) => (
        <SteelWindow key={i} o={o} place={back} cols={4} rows={5} seed={11 + i} m={m} />
      ))}
      <SteelWindow o={SIDE_OPENING} place={side} cols={4} rows={4} seed={19} m={m} />
      {/* the city can only be seen through the windows: skip it in the top shot */}
      <BelowCeiling>
        <OutsideViews />
      </BelowCeiling>
    </group>
  );
}

// ---------- the door and the hallway ----------

const HALL = { depth: 3.4, width: 4.6 };

function doorGeometries() {
  const { x0, x1, top } = DOORWAY;
  const r = rand(29);
  const lining = new Merger();
  const tone = () => new THREE.Color().setScalar(0.85 + r() * 0.3);
  // the lining in the reveal (jambs and head) and a moulded architrave on the room side
  for (const x of [x0 + 0.02, x1 - 0.02]) lining.add(plank(0.04, top, WALL_T, 0.01, [1 / 1.5, 1 / 1.5], 1, [r(), r()], true), trs([x, top / 2, BZ - WALL_T / 2]), tone());
  lining.add(plank(x1 - x0, 0.04, WALL_T, 0.01), trs([(x0 + x1) / 2, top - 0.02, BZ - WALL_T / 2]), tone());
  for (const x of [x0 - 0.1, x1 + 0.1]) {
    lining.add(plank(0.2, top + 0.2, 0.05, 0.015, [1 / 1.5, 1 / 1.5], 2, [r(), r()], true), trs([x, (top + 0.2) / 2, BZ + 0.025]), tone());
    // a plinth block at the foot of each side
    lining.add(plank(0.24, 0.3, 0.07, 0.015), trs([x, 0.15, BZ + 0.035]), tone());
  }
  lining.add(plank(x1 - x0 + 0.64, 0.22, 0.07, 0.02), trs([(x0 + x1) / 2, top + 0.11, BZ + 0.035]), tone());
  lining.add(plank(x1 - x0 + 0.74, 0.05, 0.1, 0.02), trs([(x0 + x1) / 2, top + 0.245, BZ + 0.05]), tone());
  // a worn oak threshold
  lining.add(plank(x1 - x0, 0.035, WALL_T + 0.08, 0.012), trs([(x0 + x1) / 2, 0.017, BZ - WALL_T / 2 + 0.02]), tone());

  // the door leaf: four glazed panes over a fielded panel, opened outward against the hallway's right wall
  const w = x1 - x0 - 0.02;
  const h = top - 0.03;
  const leaf = new Merger();
  const st = 0.13;
  leaf.add(plank(st, h, 0.06, 0.012, 1, 2), trs([-w + st / 2, h / 2, 0]));
  leaf.add(plank(st, h, 0.06, 0.012, 1, 2), trs([-st / 2, h / 2, 0]));
  for (const y of [st / 2 + 0.06, h * 0.42, h - st / 2]) leaf.add(plank(w - 2 * st, y < 0.3 ? 0.3 : st, 0.06, 0.012, 1, 2), trs([-w / 2, y < 0.3 ? 0.17 : y, 0]));
  // the fielded lower panel
  leaf.add(plank(w - 2 * st - 0.04, h * 0.42 - 0.38, 0.04, 0.03, 1, 3), trs([-w / 2, (0.32 + h * 0.42 - 0.06) / 2, 0]));
  // glazing bars in the upper half
  const gy0 = h * 0.42 + st / 2;
  const gy1 = h - st;
  leaf.add(plank(0.04, gy1 - gy0, 0.05, 0.008, 1, 1), trs([-w / 2, (gy0 + gy1) / 2, 0]));
  leaf.add(plank(w - 2 * st, 0.04, 0.05, 0.008, 1, 1), trs([-w / 2, (gy0 + gy1) / 2, 0]));
  const leafG = paint(leaf.build(), (x, y, z, out) => {
    out.setScalar(0.92 + 0.1 * noise3(x * 4, y * 4, z * 4));
    // the paint rubbed thin round the handle
    out.multiplyScalar(1 - smoothstep(0.5, 0.0, Math.hypot(x + w - 0.16, y - 1.95)) * 0.15);
  });
  const glass = new THREE.PlaneGeometry(w - 2 * st, gy1 - gy0).translate(-w / 2, (gy0 + gy1) / 2, 0);
  const brass = new Merger();
  // lever handles on both faces, a kick plate, three hinges on the hinge stile
  for (const s of [-1, 1]) {
    brass.add(smoothLathe([[0, 0], [0.05, 0], [0.055, 0.01], [0.04, 0.03], [0, 0.035]], 10, 20).rotateX((s * Math.PI) / 2), trs([-w + 0.13, 1.95, s * 0.03]));
    brass.add(tubeThrough([V(-w + 0.13, 1.95, s * 0.075), V(-w + 0.2, 1.95, s * 0.09), V(-w + 0.32, 1.94, s * 0.09)], () => 0.016, 8, 8).geometry);
  }
  brass.add(plank(w - 0.1, 0.24, 0.006, 0.003), trs([-w / 2, 0.15, 0.033]));
  for (const y of [0.4, h / 2, h - 0.4]) brass.add(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 12), trs([0.005, y, 0]));
  return { lining: lining.build(), leaf: leafG, glass, brass: brass.build(), w, h };
}

/** The hallway beyond the door: plastered walls warm in the light of a sconce, a dark floor, a coat on a hook, a framed print. */
function hallGeometry() {
  const { x0, x1, top } = DOORWAY;
  const z0 = BZ - WALL_T;
  const z1 = z0 - HALL.depth;
  const cx = (x0 + x1) / 2;
  const hx0 = cx - HALL.width / 2;
  const hx1 = cx + HALL.width / 2;
  const H = top + 1.4;
  const lamp = V(cx - 0.9, 3.0, z1 + 0.05);
  const m = new Merger();
  const lit = (g: THREE.BufferGeometry, base: string, k = 1) =>
    paint(g, (x, y, z, out) => {
      out.set(base);
      // warm light falling off from the sconce, darker toward the room
      const d = Math.hypot(x - lamp.x, (y - lamp.y) * 1.2, z - lamp.z);
      out.multiplyScalar((0.22 + 1.1 * Math.exp(-d * 0.75)) * k);
      out.multiplyScalar(0.55 + 0.45 * smoothstep(z0, z1 + 1.2, z));
      out.multiplyScalar(0.9 + 0.15 * noise3(x * 2, y * 2, z * 2));
    });
  m.add(lit(new THREE.PlaneGeometry(HALL.width, H, 12, 10).translate(cx, H / 2, z1), '#c79a74'));
  m.add(lit(new THREE.PlaneGeometry(HALL.depth, H, 8, 10).rotateY(Math.PI / 2).translate(hx0, H / 2, (z0 + z1) / 2), '#b88a66'));
  m.add(lit(new THREE.PlaneGeometry(HALL.depth, H, 8, 10).rotateY(-Math.PI / 2).translate(hx1, H / 2, (z0 + z1) / 2), '#b88a66'));
  m.add(lit(new THREE.PlaneGeometry(HALL.width, HALL.depth, 10, 8).rotateX(-Math.PI / 2).translate(cx, 0, (z0 + z1) / 2), '#5a3a26', 0.8));
  m.add(lit(new THREE.PlaneGeometry(HALL.width, HALL.depth, 6, 6).rotateX(Math.PI / 2).translate(cx, H, (z0 + z1) / 2), '#6a5040', 0.7));
  // a skirting along the far wall, a framed print beside the lamp, a coat and a scarf on hooks
  m.add(lit(plank(HALL.width, 0.18, 0.03, 0.01).translate(cx, 0.09, z1 + 0.015), '#2a2420'));
  m.add(lit(plank(0.95, 1.2, 0.04, 0.012).translate(cx + 0.55, 2.4, z1 + 0.02), '#1e1814'));
  m.add(lit(new THREE.PlaneGeometry(0.75, 1.0).translate(cx + 0.55, 2.4, z1 + 0.042), '#d8cbb0'));
  m.add(lit(new THREE.CircleGeometry(0.22, 24).translate(cx + 0.5, 2.5, z1 + 0.045), '#b8583a'));
  m.add(lit(new THREE.PlaneGeometry(0.5, 0.06).translate(cx + 0.58, 2.05, z1 + 0.045), '#3a5a6a'));
  m.add(lit(plank(1.2, 0.08, 0.06, 0.02).translate(hx0 + 0.04, 3.1, z0 - 1.2).rotateY(0), '#3a2818'));
  const coat = new THREE.CylinderGeometry(0.16, 0.34, 1.5, 14, 4).translate(0, -0.75, 0);
  m.add(lit(coat.scale(0.6, 1, 1).translate(hx0 + 0.2, 3.05, z0 - 1.0), '#3a4450'));
  const scarf = new THREE.CylinderGeometry(0.06, 0.09, 1.1, 10, 3).translate(0, -0.55, 0);
  m.add(lit(scarf.translate(hx0 + 0.12, 3.05, z0 - 1.55), '#a8402a'));
  return { walls: m.build(), lamp };
}

export function Doorway() {
  const m = openingMats();
  const g = useMemo(() => once('office:door', doorGeometries), []);
  const hall = useMemo(() => once('office:hall', hallGeometry), []);
  const { x0, x1 } = DOORWAY;
  const shade = useMemo(
    () =>
      once('office:hall-sconce', () =>
        smoothLathe(
          [
            [0.05, 0.16],
            [0.12, 0.14],
            [0.17, 0.05],
            [0.18, -0.06],
            [0.15, -0.12],
            [0.06, -0.14],
          ],
          16,
          28,
        ),
      ),
    [],
  );
  // the leaf hangs from the right jamb, swung out into the hallway against its right wall
  const hinge: [number, number, number] = [x1 - 0.01, 0, BZ - WALL_T];
  const spillZ = BZ + 1.15;
  return (
    <group>
      <mesh geometry={g.lining} material={m.lining} castShadow receiveShadow />
      <BelowCeiling>
        <mesh geometry={hall.walls} material={m.hall} />
        <mesh geometry={shade} material={m.sconce} position={hall.lamp} />
        <mesh position={[hall.lamp.x, hall.lamp.y, hall.lamp.z + 0.1]} material={m.spill} scale={[2.6, 2.6, 1]}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </BelowCeiling>
      <group position={hinge} rotation={[0, -1.72, 0]}>
        <mesh geometry={g.leaf} material={m.doorPaint} castShadow receiveShadow />
        <mesh geometry={g.glass} material={m.reeded} />
        <mesh geometry={g.brass} material={m.brass} />
      </group>
      {/* the hallway's light spilling in across the floor */}
      <mesh geometry={floorSpill()} material={m.spill} position={[(x0 + x1) / 2, 0.006, spillZ]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} />
    </group>
  );
}

function floorSpill() {
  return once('office:spill-floor', () => new THREE.PlaneGeometry(2.6, 2.6));
}

