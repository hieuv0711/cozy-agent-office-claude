import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { smoothLathe } from '../../tank/kitchenware';
import { getFlash, tickWeather, viewColor, viewValue } from '../weather';
import { Garden } from './greenhouse-garden';
import { C, canvasTexture, Merger, mix, noise3, once, paint, plank, repeated, rng, smoothstep, trs, woodTexture } from './greenhouse-kit';
import { BAY, BENCH_BACK, BENCH_X, CILL_FRONT, CILL_Y, EAVE, END_Z, FLOOR, FRONT_Z, LOW_Y, RAIL_Y, RIDGE, roofY, SHELF_X0, SHELF_X1, SHELF_Y, SHELF_Z, SIDE, TOP, WALL_Z } from './greenhouse-plan';

// The greenhouse at night: a white-painted timber glasshouse on a brick dwarf
// wall, the weather on the glass and the garden beyond (see greenhouse-garden). The tank stands on a
// long oak potting bench; festoon lights hang under the transom and across the
// house. Only the fixed architecture lives here; everything movable is an item.

// ---------- materials ----------

function useShellMaterials() {
  return useMemo(() => {
    const oak = woodTexture('gh-oak', '#94704f', '#3b281a', 3);
    return {
      frame: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
      bench: new THREE.MeshStandardMaterial({ map: oak, vertexColors: true, roughness: 0.62 }),
      iron: new THREE.MeshStandardMaterial({ color: '#1d1f1e', roughness: 0.5, metalness: 0.6 }),
      brass: new THREE.MeshStandardMaterial({ color: '#c09350', roughness: 0.32, metalness: 0.9 }),
      // faint and unlit: at night the glass shows the dark garden, not the studio reflections
      glass: new THREE.MeshBasicMaterial({ color: '#9fc2bd', transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide }),
      wire: new THREE.MeshStandardMaterial({ color: '#15130f', roughness: 0.55 }),
    };
  }, []);
}
type Mats = ReturnType<typeof useShellMaterials>;

// ---------- textures ----------

/** Old red brick in stretcher bond (4.3 x 5.2 units per tile). */
function brickTexture() {
  return canvasTexture('gh-brick', 480, 576, (g, w, h) => {
    g.fillStyle = '#3b332b';
    g.fillRect(0, 0, w, h);
    const r = rng(41);
    const reds = ['#6e3b2e', '#7a4433', '#5f3226', '#835040', '#6a3d30', '#55302a', '#74493a'];
    const bw = 240;
    const bh = 72;
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < 3; col++) {
        const x = col * bw + off + 3;
        const y = row * bh + 3;
        const base = new THREE.Color(reds[Math.floor(r() * reds.length)]).multiplyScalar(0.85 + r() * 0.3);
        const grad = g.createLinearGradient(x, y, x, y + bh);
        grad.addColorStop(0, `#${base.clone().multiplyScalar(1.08).getHexString()}`);
        grad.addColorStop(1, `#${base.clone().multiplyScalar(0.86).getHexString()}`);
        g.fillStyle = grad;
        g.beginPath();
        g.roundRect(x, y, bw - 6, bh - 6, 5);
        g.fill();
        // pits and lighter flecks in the fired clay
        for (let k = 0; k < 26; k++) {
          g.fillStyle = r() < 0.5 ? 'rgba(40,18,10,0.35)' : 'rgba(225,170,130,0.25)';
          g.fillRect(x + r() * (bw - 10), y + r() * (bh - 10), 1 + r() * 3, 1 + r() * 2);
        }
      }
    }
    // damp and moss creeping up from the floor
    const damp = g.createLinearGradient(0, h * 0.55, 0, h);
    damp.addColorStop(0, 'rgba(20,30,18,0)');
    damp.addColorStop(1, 'rgba(32,48,24,0.45)');
    g.fillStyle = damp;
    g.fillRect(0, 0, w, h);
  });
}

/** Basketweave brick pavers with moss in the joints (4.3 units per tile). */
function floorTexture() {
  return canvasTexture('gh-floor', 512, 512, (g, w) => {
    g.fillStyle = '#2c2a1c';
    g.fillRect(0, 0, w, w);
    const r = rng(77);
    const reds = ['#6b4033', '#76493a', '#5e392d', '#7f5644', '#6a4436', '#584034'];
    const S = w / 2;
    for (let sy = 0; sy < 2; sy++)
      for (let sx = 0; sx < 2; sx++) {
        const vertical = (sx + sy) % 2 === 1;
        for (let b = 0; b < 2; b++) {
          const x = sx * S + (vertical ? b * (S / 2) : 0) + 3;
          const y = sy * S + (vertical ? 0 : b * (S / 2)) + 3;
          const bw = (vertical ? S / 2 : S) - 6;
          const bh = (vertical ? S : S / 2) - 6;
          const base = new THREE.Color(reds[Math.floor(r() * reds.length)]).multiplyScalar(0.8 + r() * 0.35);
          g.fillStyle = `#${base.getHexString()}`;
          g.beginPath();
          g.roundRect(x, y, bw, bh, 8);
          g.fill();
          // worn, darker wet patches and grit
          for (let k = 0; k < 60; k++) {
            g.fillStyle = r() < 0.6 ? `rgba(30,18,12,${0.08 + r() * 0.15})` : `rgba(200,150,110,${0.06 + r() * 0.1})`;
            g.beginPath();
            g.arc(x + r() * bw, y + r() * bh, 1 + r() * 6, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    // moss along the joints
    for (let k = 0; k < 900; k++) {
      const onX = r() < 0.5;
      const line = Math.floor(r() * 5) * (S / 2);
      const x = onX ? r() * w : line;
      const y = onX ? line : r() * w;
      g.fillStyle = `rgba(${60 + r() * 40},${86 + r() * 40},${34 + r() * 20},${0.35 + r() * 0.45})`;
      g.beginPath();
      g.arc(x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, 1 + r() * 3.5, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** A little card in a brass label holder. */
function labelTexture(text: string) {
  return canvasTexture(
    `gh-label-${text}`,
    256,
    96,
    (g, w, h) => {
      g.fillStyle = '#efe4c8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,90,50,0.15)';
      for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      g.fillStyle = '#3b2c22';
      g.font = 'italic 600 54px Georgia, "Times New Roman", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 4);
    },
    { wrap: false },
  );
}

// ---------- the glasshouse frame ----------

const paintWhite = C('#d9dccb');
const grime = C('#6f7559');

function frameGeometry() {
  const m = new Merger();
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, r = 0.035, rot: [number, number, number] = [0, 0, 0]) => m.add(plank(w, h, d, r), trs([x, y, z], rot));
  const slope = Math.atan2(RIDGE - EAVE, SIDE);
  const slopeLen = Math.hypot(SIDE, RIDGE - EAVE);
  const xAt = (y: number) => (SIDE * (RIDGE - y)) / (RIDGE - EAVE);

  // the back (gable) wall: posts up to the roof line, the transom rail, the eave tie
  for (let k = 0; k <= 8; k++) {
    const x = -SIDE + k * BAY;
    const corner = k === 0 || k === 8;
    const top = roofY(x);
    const h = top - CILL_Y;
    box(corner ? 0.44 : 0.2, h, corner ? 0.44 : 0.32, x, CILL_Y + h / 2, WALL_Z);
  }
  box(SIDE * 2, 0.26, 0.38, 0, RAIL_Y, WALL_Z, 0.04);
  box(SIDE * 2, 0.4, 0.44, 0, EAVE, WALL_Z, 0.05);
  for (const s of [-1, 1]) box(slopeLen + 0.5, 0.42, 0.44, (s * SIDE) / 2, (EAVE + RIDGE) / 2, WALL_Z, 0.05, [0, 0, -s * slope]);
  // glazing laps across each bay, and the vent sashes between the rail and the eave tie
  for (let k = 0; k < 8; k++) {
    const x0 = -SIDE + k * BAY + 0.1;
    const x1 = x0 + BAY - 0.2;
    box(x1 - x0, 0.045, 0.09, (x0 + x1) / 2, 1.3, WALL_Z, 0.01);
    for (const y of [12.6, 16.8]) {
      const lim = xAt(y) - 0.15;
      const a = Math.max(x0, -lim);
      const b = Math.min(x1, lim);
      if (b - a > 0.2) box(b - a, 0.045, 0.09, (a + b) / 2, y, WALL_Z, 0.01);
    }
    const open = k === 5;
    const y0 = RAIL_Y + 0.17;
    const y1 = EAVE - 0.24;
    const sash = new Merger();
    const sb = (w: number, h: number, x: number, y: number) => sash.add(plank(w, h, 0.12, 0.02), trs([x, y, 0]));
    const cx = (x0 + x1) / 2;
    sb(x1 - x0 - 0.06, 0.12, 0, y0 + 0.06 - y1);
    sb(x1 - x0 - 0.06, 0.12, 0, -0.06);
    sb(0.12, y1 - y0, -(x1 - x0 - 0.18) / 2, (y0 - y1) / 2);
    sb(0.12, y1 - y0, (x1 - x0 - 0.18) / 2, (y0 - y1) / 2);
    // hinged at the top; the open one swings out at the bottom
    m.add(sash.build(), trs([cx, y1, WALL_Z - (open ? 0.12 : 0.02)], [open ? 0.28 : 0, 0, 0]));
  }

  // the side walls
  for (const s of [-1, 1]) {
    for (let z = WALL_Z + BAY; z <= END_Z + 0.01; z += BAY) box(0.32, EAVE - CILL_Y, 0.2, s * SIDE, (EAVE + CILL_Y) / 2, z);
    const len = END_Z - WALL_Z;
    const zc = (END_Z + WALL_Z) / 2;
    box(0.38, 0.26, len, s * SIDE, RAIL_Y, zc, 0.04);
    box(0.44, 0.4, len, s * SIDE, EAVE, zc, 0.05);
    for (let z = WALL_Z; z < END_Z - 0.1; z += BAY) box(0.09, 0.045, BAY - 0.2, s * SIDE, 1.3, z + BAY / 2, 0.01);
    // the roof: rafters, two purlins and the eave gutter board
    for (let z = WALL_Z + BAY; z <= END_Z + 0.01; z += BAY) box(slopeLen + 0.3, 0.36, 0.22, (s * SIDE) / 2, (EAVE + RIDGE) / 2 - 0.05, z, 0.04, [0, 0, -s * slope]);
    for (const f of [0.34, 0.67]) {
      box(0.3, 0.22, len, s * SIDE * (1 - f), EAVE + (RIDGE - EAVE) * f - 0.26, zc, 0.03, [0, 0, -s * slope]);
    }
  }
  box(0.36, 0.5, END_Z - WALL_Z, 0, RIDGE + 0.06, (END_Z + WALL_Z) / 2, 0.05);

  const g = m.build();
  return paint(g, (x, y, z, out) => {
    out.copy(paintWhite).multiplyScalar(0.93 + 0.1 * noise3(x * 0.6, y * 0.6, z * 0.6));
    // weathering: grime and a little green algae low down, cleaner up high
    mix(out, out, grime, smoothstep(-0.5, -2.9, y) * 0.4 + smoothstep(0.6, 1, noise3(x * 2.1, y * 2.1, z * 2.1) * 0.5 + 0.5) * 0.18);
  });
}

function glassGeometries() {
  const back = new THREE.Shape();
  back.moveTo(-SIDE, CILL_Y);
  back.lineTo(SIDE, CILL_Y);
  back.lineTo(SIDE, EAVE);
  back.lineTo(0, RIDGE);
  back.lineTo(-SIDE, EAVE);
  back.closePath();
  const len = END_Z - WALL_Z;
  const slopeLen = Math.hypot(SIDE, RIDGE - EAVE);
  const slope = Math.atan2(RIDGE - EAVE, SIDE);
  const roof = new Merger();
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(slopeLen, len).rotateX(-Math.PI / 2);
    roof.add(g, trs([(s * SIDE) / 2, (EAVE + RIDGE) / 2 + 0.16, (END_Z + WALL_Z) / 2], [0, 0, -s * slope]));
  }
  const sides = new Merger();
  for (const s of [-1, 1]) sides.add(new THREE.PlaneGeometry(len, EAVE - CILL_Y), trs([s * SIDE, (EAVE + CILL_Y) / 2, (END_Z + WALL_Z) / 2], [0, Math.PI / 2, 0]));
  return { back: new THREE.ShapeGeometry(back), sides: sides.build(), roof: roof.build() };
}

function Glasshouse({ m }: { m: Mats }) {
  const frame = useMemo(() => once('gh-frame', frameGeometry), []);
  const glass = useMemo(() => once('gh-glass', glassGeometries), []);
  const brick = useMemo(() => {
    const t = brickTexture();
    return { back: repeated(t, (SIDE * 2 + 1) / 4.3, (CILL_Y - FLOOR) / 5.2, 'gh-brick-back'), side: repeated(t, (END_Z - WALL_Z) / 4.3, (CILL_Y - FLOOR) / 5.2, 'gh-brick-side') };
  }, []);
  const floor = useMemo(() => repeated(floorTexture(), (SIDE * 2) / 4.3, (END_Z - WALL_Z) / 4.3, 'gh-floor'), []);
  const wallH = CILL_Y - 0.42 - FLOOR;
  return (
    <group>
      <mesh geometry={frame} material={m.frame} castShadow receiveShadow />
      {/* the glass: the back wall is where hanging things go */}
      <mesh geometry={glass.back} material={m.glass} position={[0, 0, WALL_Z]} renderOrder={2} userData={{ surface: 'wall' }} />
      <mesh geometry={glass.sides} material={m.glass} renderOrder={2} />
      <mesh geometry={glass.roof} material={m.glass} renderOrder={2} />
      {/* brick dwarf walls under the cills */}
      <mesh position={[0, FLOOR + wallH / 2, WALL_Z - 0.05]} receiveShadow>
        <boxGeometry args={[SIDE * 2 + 0.8, wallH, 0.8]} />
        <meshStandardMaterial map={brick.back} roughness={0.9} color="#b8aca2" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * SIDE, FLOOR + wallH / 2, (END_Z + WALL_Z) / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
          <boxGeometry args={[END_Z - WALL_Z, wallH, 0.8]} />
          <meshStandardMaterial map={brick.side} roughness={0.9} color="#b8aca2" />
        </mesh>
      ))}
      {/* the timber cills: a narrow ledge along the back, just above the bench */}
      <Cill m={m} />
      {/* the floor */}
      <mesh position={[0, FLOOR, (END_Z + WALL_Z) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ surface: 'floor' }}>
        <planeGeometry args={[SIDE * 2, END_Z - WALL_Z]} />
        <meshStandardMaterial map={floor} roughness={0.72} color="#b3a89e" />
      </mesh>
    </group>
  );
}

function Cill({ m }: { m: Mats }) {
  const geo = useMemo(
    () =>
      once('gh-cill', () => {
        const d = CILL_FRONT - (WALL_Z - 0.46);
        const g = new Merger().add(plank(SIDE * 2 + 0.6, 0.42, d, 0.05), trs([0, CILL_Y - 0.21, CILL_FRONT - d / 2])).build();
        return paint(g, (x, y, z, out) => {
          out.copy(paintWhite).multiplyScalar(0.9 + 0.08 * noise3(x * 0.8, y, z));
          mix(out, out, grime, 0.32 + 0.2 * smoothstep(0.3, 0.9, noise3(x * 1.7, 3, z * 3) * 0.5 + 0.5));
        });
      }),
    [],
  );
  const side = useMemo(
    () =>
      once('gh-cill-side', () => {
        const g = new Merger();
        for (const s of [-1, 1]) g.add(plank(1.0, 0.42, END_Z - WALL_Z, 0.05), trs([s * (SIDE - 0.1), CILL_Y - 0.21, (END_Z + WALL_Z) / 2]));
        return paint(g.build(), (x, y, z, out) => mix(out, paintWhite, grime, 0.3 + 0.15 * noise3(x, y, z * 0.7)));
      }),
    [],
  );
  return (
    <>
      <mesh geometry={geo} material={m.frame} castShadow receiveShadow userData={{ surface: 'sill' }} />
      <mesh geometry={side} material={m.frame} receiveShadow />
    </>
  );
}

// ---------- the potting bench ----------

function benchGeometry() {
  const r = rng(11);
  const top = new Merger();
  const depth = FRONT_Z - BENCH_BACK;
  const rows = 7;
  const pw = depth / rows;
  const tint = new THREE.Color();
  for (let i = 0; i < rows; i++) {
    const zc = BENCH_BACK + pw * (i + 0.5);
    const j1 = -15 + r() * 9;
    const j2 = j1 + 11 + r() * 9;
    const cuts = [-BENCH_X, j1, Math.min(j2, BENCH_X - 4), BENCH_X];
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k];
      const b = cuts[k + 1];
      const g = plank(b - a - 0.035, 0.3, pw - 0.03, 0.045, [0.1, 1 / 1.25], 2, [r() * 10, r()]);
      tint.setHSL(0.075 + (r() - 0.5) * 0.02, 0.12 + r() * 0.12, 0.5 + (r() - 0.5) * 0.12);
      top.add(g, trs([(a + b) / 2, TOP - 0.15, zc]), tint.clone().multiplyScalar(2));
    }
  }
  const frame = new Merger();
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, rr = 0.04) => {
    tint.setHSL(0.075, 0.16, 0.42 + (r() - 0.5) * 0.08);
    frame.add(plank(w, h, d, rr, [0.1, 1 / 1.25], 2, [r() * 10, r()]), trs([x, y, z]), tint.clone().multiplyScalar(2));
  };
  const under = TOP - 0.3;
  const legH = under - FLOOR;
  const legZ = [FRONT_Z - 0.51, BENCH_BACK + 0.45];
  const legX = [-(BENCH_X - 0.45), -6.6, 6.6, BENCH_X - 0.45];
  for (const x of legX) for (const z of legZ) add(0.7, legH, 0.7, x, FLOOR + legH / 2, z, 0.07);
  // aprons under the top, front and back, and at the ends
  const apronH = 1.05;
  add(BENCH_X * 2 - 0.2, apronH, 0.16, 0, under - apronH / 2, FRONT_Z - 0.24);
  add(BENCH_X * 2 - 0.2, apronH, 0.16, 0, under - apronH / 2, BENCH_BACK + 0.72);
  for (const s of [-1, 1]) add(0.16, apronH, depth - 1.0, s * (BENCH_X - 0.45), under - apronH / 2, (FRONT_Z + BENCH_BACK) / 2);
  // low stretchers
  const sy = FLOOR + 1.0;
  for (const z of legZ) add(BENCH_X * 2 - 0.6, 0.45, 0.16, 0, sy, z);
  for (const x of legX) add(0.16, 0.45, legZ[0] - legZ[1], x, sy, (legZ[0] + legZ[1]) / 2);
  // the slatted shelf underneath
  const low = new Merger();
  const z0 = legZ[1] + 0.4;
  const z1 = legZ[0] - 0.4;
  const n = 6;
  const sw = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    tint.setHSL(0.075, 0.14, 0.45 + (r() - 0.5) * 0.1);
    low.add(plank(BENCH_X * 2 - 1.5, 0.16, sw - 0.025, 0.03, [0.1, 1 / 1.25], 2, [r() * 10, r()]), trs([0, LOW_Y - 0.08, z0 + sw * (i + 0.5)]), tint.clone().multiplyScalar(2));
  }
  // bearers under the slats
  for (const x of [-12, -0.01, 12]) add(0.3, 0.3, z1 - z0 + 0.6, x, LOW_Y - 0.31, (z0 + z1) / 2);
  return { top: top.build(), frame: frame.build(), low: low.build() };
}

function Drawers({ m }: { m: Mats }) {
  const knob = useMemo(
    () =>
      once('gh-knob', () =>
        smoothLathe(
          [
            [0, 0],
            [0.09, 0],
            [0.1, 0.03],
            [0.06, 0.07],
            [0.055, 0.1],
            [0.13, 0.17],
            [0.15, 0.23],
            [0.12, 0.28],
            [0, 0.3],
          ],
          40,
          24,
        ).rotateX(Math.PI / 2),
      ),
    [],
  );
  const fronts = useMemo(
    () =>
      once('gh-drawers', () => {
        const g = new Merger();
        for (const x of [-3.15, 3.15]) g.add(plank(5.6, 0.82, 0.12, 0.035, [0.1, 1 / 1.25], 2, [x, 0.3]), trs([x, TOP - 0.3 - 0.52, FRONT_Z - 0.1]), new THREE.Color().setHSL(0.07, 0.2, 0.42).multiplyScalar(2));
        return g.build();
      }),
    [],
  );
  const labels = [labelTexture('Seeds'), labelTexture('Twine')];
  const y = TOP - 0.3 - 0.52;
  const z = FRONT_Z - 0.04;
  return (
    <group>
      <mesh geometry={fronts} material={m.bench} castShadow receiveShadow />
      {[-3.15, 3.15].map((x, i) => (
        <group key={x} position={[x, y, z]}>
          <mesh geometry={knob} material={m.brass} position={[0, -0.12, 0]} castShadow />
          {/* a brass label holder with a hand-written card */}
          <mesh material={m.brass} position={[0, 0.17, 0.005]}>
            <boxGeometry args={[0.6, 0.25, 0.03]} />
          </mesh>
          <mesh position={[0, 0.17, 0.024]}>
            <planeGeometry args={[0.52, 0.18]} />
            <meshStandardMaterial map={labels[i]} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Bench({ m }: { m: Mats }) {
  const geo = useMemo(() => once('gh-bench', benchGeometry), []);
  return (
    <group>
      <mesh geometry={geo.top} material={m.bench} castShadow receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={geo.frame} material={m.bench} castShadow receiveShadow />
      <mesh geometry={geo.low} material={m.bench} castShadow receiveShadow userData={{ surface: 'shelf' }} />
      <Drawers m={m} />
    </group>
  );
}

// ---------- plant shelves on the back wall ----------

function bracketGeometry() {
  const parts = new Merger();
  // a forged gallows bracket: an upright on the post, an arm under the shelf, a scrolled brace
  parts.add(plank(0.07, 0.95, 0.07, 0.015), trs([0, -0.5, 0.04]));
  parts.add(plank(0.07, 0.07, 0.86, 0.015), trs([0, -0.06, 0.47]));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    pts.push(new THREE.Vector3(0, -0.92 + t * 0.82 + Math.sin(t * Math.PI) * 0.12, 0.06 + t * 0.74 - Math.sin(t * Math.PI) * 0.1));
  }
  parts.add(tubeThrough(pts, () => 0.028, 30, 6).geometry);
  // the curl at the bottom of the brace
  const curl: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 1.6;
    const rr = 0.16 * (1 - i / 22);
    curl.push(new THREE.Vector3(0, -0.76 - Math.sin(a) * rr, 0.22 - Math.cos(a) * rr + 0.06));
  }
  parts.add(tubeThrough(curl, () => 0.022, 30, 6).geometry);
  return parts.build();
}

function WallShelves({ m }: { m: Mats }) {
  const board = useMemo(
    () =>
      once('gh-shelf', () => {
        const r = rng(5);
        const g = new Merger();
        const L = SHELF_X1 - SHELF_X0;
        for (const s of [-1, 1])
          for (let i = 0; i < 2; i++) g.add(plank(L, 0.14, 0.46, 0.03, [0.1, 1 / 1.25], 2, [r() * 10, r()]), trs([(s * (SHELF_X0 + SHELF_X1)) / 2, SHELF_Y - 0.07, SHELF_Z - 0.24 + i * 0.48]), new THREE.Color().setHSL(0.072, 0.16, 0.46 + r() * 0.06).multiplyScalar(2));
        return g.build();
      }),
    [],
  );
  const bracket = useMemo(() => once('gh-bracket', bracketGeometry), []);
  return (
    <group>
      <mesh geometry={board} material={m.bench} castShadow receiveShadow userData={{ surface: 'shelf' }} />
      {[-15, -10, 10, 15].map((x) => (
        <mesh key={x} geometry={bracket} material={m.iron} position={[x, SHELF_Y - 0.14, WALL_Z + 0.16]} castShadow />
      ))}
    </group>
  );
}

// ---------- festoon lights ----------

type Strand = { wire: THREE.Vector3[]; bulbs: THREE.Vector3[] };

/** A wire hung between two hooks, sagging in a curve, with bulbs spaced along it. */
function swag(a: THREE.Vector3, b: THREE.Vector3, sag: number, spacing: number, phase = 0.5): Strand {
  const at = (t: number) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0));
  const wire = Array.from({ length: 17 }, (_, i) => at(i / 16));
  const len = a.distanceTo(b) + (8 / 3) * (sag * sag) / Math.max(1e-3, a.distanceTo(b));
  const n = Math.max(1, Math.round(len / spacing));
  const bulbs = Array.from({ length: n }, (_, i) => at((i + phase) / n));
  return { wire, bulbs };
}

function strandsLayout() {
  const out: Strand[] = [];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // under the transom rail of the back wall, looping from post to post
  for (let k = 0; k < 8; k++) {
    const x = -SIDE + k * BAY;
    out.push(swag(V(x, RAIL_Y - 0.15, WALL_Z + 0.3), V(x + BAY, RAIL_Y - 0.15, WALL_Z + 0.3), 0.55, 1.2));
  }
  // across the house from eave to eave
  for (let z = 1.5; z < END_Z; z += 10) out.push(swag(V(-SIDE + 0.3, EAVE - 0.25, z), V(SIDE - 0.3, EAVE - 0.25, z), 2.3, 1.35));
  // up the gable rafters
  for (const s of [-1, 1])
    for (let k = 0; k < 5; k++) {
      const f0 = k / 5;
      const f1 = (k + 1) / 5;
      const p = (f: number) => V(s * SIDE * (1 - f) - s * 0.2 * (1 - f), EAVE + (RIDGE - EAVE) * f - 0.42, WALL_Z + 0.3);
      out.push(swag(p(f0), p(f1), 0.28, 1.2));
    }
  // along the ridge
  for (let z = WALL_Z + 0.3; z < END_Z - 1; z += BAY) out.push(swag(V(0, RIDGE - 0.4, z), V(0, RIDGE - 0.4, Math.min(END_Z, z + BAY)), 0.35, 1.3));
  return out;
}

function FestoonLights({ m }: { m: Mats }) {
  const layout = useMemo(() => once('gh-strands', strandsLayout), []);
  const wires = useMemo(
    () =>
      once('gh-wires', () => {
        const g = new Merger();
        for (const s of layout) g.add(tubeThrough(s.wire, () => 0.017, 40, 4).geometry);
        return g.build();
      }),
    [layout],
  );
  const bulbGeo = useMemo(
    () =>
      once('gh-bulb', () =>
        smoothLathe(
          [
            [0, -0.15],
            [0.07, -0.142],
            [0.125, -0.09],
            [0.14, -0.02],
            [0.12, 0.05],
            [0.07, 0.1],
            [0.05, 0.13],
            [0, 0.135],
          ],
          30,
          16,
        ),
      ),
    [],
  );
  const socketGeo = useMemo(() => once('gh-socket', () => new THREE.CylinderGeometry(0.05, 0.058, 0.15, 10)), []);
  const bulbMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc274').multiplyScalar(3.2), toneMapped: false }), []);
  const count = layout.reduce((n, s) => n + s.bulbs.length, 0);
  const bulbs = useRef<THREE.InstancedMesh>(null);
  const sockets = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const b = bulbs.current;
    const s = sockets.current;
    if (!b || !s) return;
    const r = rng(3);
    const mtx = new THREE.Matrix4();
    const c = new THREE.Color();
    let i = 0;
    for (const strand of layout)
      for (const p of strand.bulbs) {
        const tilt = (r() - 0.5) * 0.2;
        s.setMatrixAt(i, trs([p.x, p.y - 0.06, p.z], [tilt, 0, tilt * 0.5]));
        b.setMatrixAt(i, mtx.copy(trs([p.x + tilt * 0.12, p.y - 0.27, p.z], [tilt, 0, tilt * 0.5])));
        b.setColorAt(i, c.setRGB(1, 0.82 + r() * 0.18, 0.7 + r() * 0.3).multiplyScalar(0.8 + r() * 0.25));
        i++;
      }
    b.instanceMatrix.needsUpdate = true;
    s.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
  }, [layout]);
  return (
    <group>
      <mesh geometry={wires} material={m.wire} />
      <instancedMesh ref={sockets} args={[socketGeo, m.wire, count]} />
      <instancedMesh ref={bulbs} args={[bulbGeo, bulbMat, count]} />
      {/* their warm glow on the bench, from the strand across the front of the house */}
      <pointLight position={[-10.5, 6.4, 1.2]} color="#ffb061" intensity={34} distance={24} decay={2} />
      <pointLight position={[10.5, 6.4, 1.2]} color="#ffb061" intensity={34} distance={24} decay={2} />
    </group>
  );
}

// ---------- moonlight ----------

const MOON = { clear: new THREE.Color('#93b9e3'), wet: new THREE.Color('#7f98b0'), snow: new THREE.Color('#b3c6e6'), flash: new THREE.Color('#e2eaff') };

/**
 * The moon through the glass: soft and grey under the rain clouds, cool and
 * stronger off the snow, and in a storm the lightning flares from the same side,
 * throwing the glazing bars' shadows across the bench for a moment.
 */
function Moonlight() {
  const target = useMemo(() => new THREE.Object3D(), []);
  const light = useRef<THREE.DirectionalLight>(null);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const u = tickWeather();
    const f = getFlash();
    l.intensity = viewValue(1.15, 0.5 * (1 - 0.3 * u.uStorm.value), 0.95) + f * 4.2;
    l.color.copy(viewColor(col, MOON.clear, MOON.wet, MOON.snow).lerp(MOON.flash, Math.min(1, f * 1.4)));
  });
  return (
    <>
      <primitive object={target} position={[0, TOP, -1]} />
      <directionalLight
        ref={light}
        position={[-21, TOP + 24, -38]}
        target={target}
        intensity={1.15}
        color="#93b9e3"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      >
        <orthographicCamera attach="shadow-camera" args={[-24, 24, 16, -16, 1, 110]} />
      </directionalLight>
    </>
  );
}

// ---------- the whole house ----------

export function GreenhouseShell() {
  const m = useShellMaterials();
  return (
    <group>
      <Garden />
      <Glasshouse m={m} />
      <Bench m={m} />
      <WallShelves m={m} />
      <FestoonLights m={m} />
      <Moonlight />
    </group>
  );
}
