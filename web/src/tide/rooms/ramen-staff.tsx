import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { cached, chain, cone, ellipsoid, meshSDF, mirrorX, type SDF, smin } from '../../tank/sdf';
import { SEATS, TABLE } from '../kitchen/plan';
import { REVEAL, ROOM, WIN_BACK } from './ramen-dims';
import { C, fbm3, mat, Merger, mix, noise3, once, paint, paintFlat, paintLathe, rand, smoothLathe, smoothstep, trs, V, woodTex, worley3 } from './ramen-kit';
import { propMats } from './ramen-props';

// The staff corner at the back left: a round table where idle cooks have tea,
// four stools, a cast-iron teapot with cups and a plate of rice crackers and
// onigiri, and the shop cat asleep on the window sill above.

export function staffMats() {
  return {
    table: mat('s:table', () => new THREE.MeshStandardMaterial({ map: woodTex('table', { w: 1024, h: 1024, light: '#a8703e', dark: '#4a2612', planks: 5, rings: 9, seed: 88, figure: 0.3, warp: 0.6 }), roughness: 0.5, vertexColors: true })),
    legs: mat('s:legs', () => new THREE.MeshStandardMaterial({ map: woodTex('legs', { w: 512, h: 128, light: '#6a4224', dark: '#24120a', planks: 1, rings: 6, seed: 4, joints: false, seams: 0, figure: 0.2 }), roughness: 0.55, vertexColors: true })),
    iron: mat('s:iron', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.55 })),
    fur: mat('s:fur', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })),
  };
}

// ---------- table and stools ----------

function tableGeometries() {
  const { r, top } = TABLE;
  const n = 30;
  const slab = smoothLathe(
    [
      [0, top - 0.07],
      [r - 0.03, top - 0.07],
      [r + 0.005, top - 0.05],
      [r + 0.01, top - 0.02],
      [r - 0.015, top],
      [0, top],
    ],
    n,
    72,
  );
  // planar UVs from above so the boards run across the top
  const p = slab.attributes.position;
  const uv = slab.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2.2 + 0.3, p.getZ(i) / 2.2 + 0.2);
  // cup rings and a darker, rubbed edge
  paint(slab, (x, y, z, out) => {
    out.setScalar(0.9 + 0.12 * fbm3(x * 2, y, z * 2));
    for (const [cx, cz, rr] of [
      [0.32, -0.28, 0.07],
      [-0.4, 0.18, 0.065],
      [0.05, 0.45, 0.07],
    ] as [number, number, number][]) {
      const d = Math.abs(Math.hypot(x - cx, z - cz) - rr);
      out.multiplyScalar(1 - smoothstep(0.012, 0.002, d) * 0.22 * (y > top - 0.005 ? 1 : 0));
    }
    out.multiplyScalar(1 - smoothstep(r - 0.12, r, Math.hypot(x, z)) * 0.15);
  });
  const legs = new Merger();
  // an apron ring under the top and four splayed legs with a low ring stretcher
  const apron = new THREE.TorusGeometry(r * 0.72, 0.035, 8, 64).rotateX(Math.PI / 2);
  legs.add(apron, trs([0, top - 0.13, 0]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    legs.add(tubeThrough([V(c * r * 0.62, top - 0.08, s * r * 0.62), V(c * r * 0.7, top * 0.5, s * r * 0.7), V(c * r * 0.8, 0.0, s * r * 0.8)], (t) => 0.05 - t * 0.012, 12, 10).geometry);
  }
  legs.add(new THREE.TorusGeometry(r * 0.76, 0.022, 8, 64).rotateX(Math.PI / 2), trs([0, 0.22, 0]));
  return { slab, legs: legs.build() };
}

function stoolGeometries() {
  const seatR = 0.25;
  const h = SEATS[0].y;
  const n = 20;
  const seat = smoothLathe(
    [
      [0, h - 0.06],
      [seatR - 0.02, h - 0.06],
      [seatR + 0.005, h - 0.04],
      [seatR, h - 0.008],
      [seatR - 0.03, h + 0.004],
      [0, h + 0.01],
    ],
    n,
    40,
  );
  const p = seat.attributes.position;
  const uv = seat.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.2, p.getZ(i) / 1.2);
  paint(seat, (x, _y, z, out) => out.setScalar(0.95 - smoothstep(0, seatR, Math.hypot(x, z)) * 0.12));
  const legs = new Merger();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    legs.add(tubeThrough([V(c * 0.15, h - 0.06, s * 0.15), V(c * 0.24, 0.0, s * 0.24)], () => 0.028, 4, 8).geometry);
  }
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const a1 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;
    const rr = 0.205;
    legs.add(tubeThrough([V(Math.cos(a0) * rr, 0.18, Math.sin(a0) * rr), V(Math.cos(a1) * rr, 0.18, Math.sin(a1) * rr)], () => 0.016, 2, 6).geometry);
  }
  return { seat, legs: legs.build() };
}

function TableAndStools() {
  const m = staffMats();
  const t = useMemo(() => once('ramen:staff-table', tableGeometries), []);
  const s = useMemo(() => once('ramen:staff-stool', stoolGeometries), []);
  return (
    <group>
      <group position={[TABLE.x, 0, TABLE.z]}>
        <mesh geometry={t.slab} material={m.table} castShadow receiveShadow userData={{ surface: 'top' }} />
        <mesh geometry={t.legs} material={m.legs} castShadow receiveShadow />
      </group>
      {SEATS.map((st, i) => (
        <group key={i} position={[st.x, 0, st.z]} rotation={[0, st.yaw + i, 0]}>
          <mesh geometry={s.seat} material={m.table} castShadow receiveShadow />
          <mesh geometry={s.legs} material={m.legs} castShadow />
        </group>
      ))}
    </group>
  );
}

// ---------- the tea things ----------

function teapotGeometries() {
  return once('ramen:tetsubin', () => {
    const n = 60;
    // a squat cast-iron kettle with hobnail bumps
    const body = smoothLathe(
      [
        [0, 0.0],
        [0.09, 0.0],
        [0.13, 0.02],
        [0.165, 0.07],
        [0.175, 0.12],
        [0.16, 0.18],
        [0.11, 0.215],
        [0.07, 0.222],
        [0.065, 0.232],
        [0, 0.235],
      ],
      n,
      48,
    );
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const rr = Math.hypot(x, z);
      if (rr < 0.12 || y < 0.04 || y > 0.2) continue;
      const a = Math.atan2(z, x);
      // rows of little bumps (arare)
      const row = Math.round((y - 0.04) / 0.022);
      const ang = a * 9 + (row % 2) * 0.5 * (Math.PI / 4.5) * 4.5;
      const bump = Math.max(0, Math.cos((y - 0.04 - row * 0.022) / 0.022 * Math.PI)) * Math.max(0, Math.cos(ang * 2)) ** 3;
      const k = 1 + bump * 0.045;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    body.computeVertexNormals();
    paintLathe(body, n, (x, y, z, _a, out) => {
      out.set('#2a2622').multiplyScalar(0.85 + 0.35 * noise3(x * 30, y * 30, z * 30));
      mix(out, out, C('#6a3a22'), smoothstep(0.55, 0.85, fbm3(x * 12, y * 12, z * 12)) * 0.35);
    });
    const lid = smoothLathe(
      [
        [0, 0.232],
        [0.07, 0.232],
        [0.072, 0.24],
        [0.05, 0.252],
        [0.02, 0.256],
        [0.018, 0.272],
        [0.026, 0.28],
        [0, 0.284],
      ],
      20,
      32,
    );
    paintFlat(lid, '#2a2420');
    const spout = tubeThrough([V(0, 0.08, 0.16), V(0, 0.13, 0.24), V(0, 0.19, 0.29), V(0, 0.215, 0.305)], (t) => 0.034 - t * 0.016, 16, 10).geometry;
    paintFlat(spout, '#2a2622');
    // the arched bail handle, wrapped in bamboo-coloured cord
    const handle = tubeThrough([V(-0.12, 0.21, 0), V(-0.12, 0.33, 0), V(-0.06, 0.4, 0), V(0.06, 0.4, 0), V(0.12, 0.33, 0), V(0.12, 0.21, 0)], () => 0.011, 40, 8).geometry;
    paint(handle, (_x, y, _z, out) => (y > 0.36 ? out.set('#a07a46').multiplyScalar(0.85 + 0.3 * Math.abs(Math.sin(_x * 220))) : out.set('#242120')));
    return { body, lid, spout, handle };
  });
}

/** A tall handleless tea cup with an ash glaze running over a dark clay body. */
function cupGeometry(variant: number) {
  return once(`ramen:yunomi:${variant}`, () => {
    const n = 50;
    const g = smoothLathe(
      [
        [0, 0],
        [0.045, 0],
        [0.05, 0.008],
        [0.048, 0.015],
        [0.056, 0.02],
        [0.062, 0.1],
        [0.064, 0.14],
        [0.06, 0.142],
        [0.056, 0.13],
        [0.052, 0.03],
        [0, 0.026],
      ],
      n,
      32,
    );
    const glazes = ['#7a9a8a', '#c9b48a', '#8a4a32', '#3c4a6a'];
    const glaze = C(glazes[variant % glazes.length]);
    const clay = C('#5a3a28');
    return paintLathe(g, n, (x, y, z, along, out) => {
      out.copy(glaze);
      // drips: the glaze stops unevenly above the foot
      const line = 0.04 + 0.025 * (0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 5 + variant));
      if (along < 0.55) mix(out, out, clay, smoothstep(line + 0.006, line - 0.006, y));
      out.multiplyScalar(0.9 + 0.15 * noise3(x * 50, y * 50, z * 50));
      if (along > 0.62 && y < 0.11) mix(out, out, C('#7a5a2a'), 0.55); // tea inside
    });
  });
}

/** A plate of rice crackers and two onigiri. */
function snackGeometry() {
  return once('ramen:snacks', () => {
    const m = new Merger();
    const n = 30;
    const plate = smoothLathe(
      [
        [0, 0],
        [0.1, 0],
        [0.11, 0.01],
        [0.2, 0.025],
        [0.215, 0.04],
        [0.205, 0.042],
        [0.12, 0.024],
        [0, 0.02],
      ],
      n,
      48,
    );
    paintLathe(plate, n, (x, _y, z, _a, out) => {
      const rr = Math.hypot(x, z);
      out.set('#ece4d4');
      mix(out, out, C('#2c4a6a'), smoothstep(0.17, 0.18, rr) * smoothstep(0.205, 0.195, rr));
      mix(out, out, C('#2c4a6a'), smoothstep(0.08, 0.04, worley3(x * 30, 0, z * 30)) * smoothstep(0.15, 0.1, rr) * 0.6);
    });
    m.add(plate);
    const r = rand(9);
    // rice crackers: round, glossy brown with a soy glaze and a strip of nori on one
    for (let i = 0; i < 5; i++) {
      const g = new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20, 1);
      paint(g, (x, y, z, out) => {
        out.set('#b8743a').multiplyScalar(0.85 + 0.3 * noise3(x * 80, y * 80, z * 80));
        mix(out, out, C('#5a2e14'), smoothstep(0.03, 0.045, Math.hypot(x, z)) * 0.5);
        if (i === 2 && Math.abs(x) < 0.015 && y > 0) out.set('#1c2418');
      });
      const a = (i / 5) * Math.PI * 2;
      m.add(g, trs([Math.cos(a) * 0.09 + 0.03, 0.035 + (i % 2) * 0.01, Math.sin(a) * 0.09], [(r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4]));
    }
    // two onigiri: rounded triangles of rice with a nori band
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Shape();
      s.moveTo(0, 0.075);
      s.quadraticCurveTo(0.03, 0.07, 0.06, -0.02);
      s.quadraticCurveTo(0.065, -0.045, 0.03, -0.045);
      s.lineTo(-0.03, -0.045);
      s.quadraticCurveTo(-0.065, -0.045, -0.06, -0.02);
      s.quadraticCurveTo(-0.03, 0.07, 0, 0.075);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.014, bevelSegments: 3, curveSegments: 10 }).translate(0, 0, -0.0125);
      paint(g, (x, y, z, out) => {
        out.set('#f4f0e6').multiplyScalar(0.92 + 0.12 * noise3(x * 120, y * 120, z * 120));
        if (y < -0.012) out.set('#1a2216');
      });
      m.add(g, trs([-0.07 + i * 0.13, 0.065, -0.05 + i * 0.03], [-0.35, 0.4 - i * 0.9, 0]));
    }
    return m.build();
  });
}

function TeaThings() {
  const t = teapotGeometries();
  const p = propMats();
  const m = staffMats();
  const snacks = snackGeometry();
  const y = TABLE.top;
  return (
    <group position={[TABLE.x, y, TABLE.z]}>
      {/* a small wooden mat under the kettle */}
      <mesh position={[-0.12, 0.006, 0.05]} material={m.legs} receiveShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.012, 32]} />
      </mesh>
      <group position={[-0.12, 0.012, 0.05]} rotation={[0, 0.9, 0]}>
        <mesh geometry={t.body} material={m.iron} castShadow receiveShadow />
        <mesh geometry={t.lid} material={m.iron} castShadow />
        <mesh geometry={t.spout} material={m.iron} castShadow />
        <mesh geometry={t.handle} material={m.iron} castShadow />
      </group>
      <mesh geometry={snacks} material={p.glaze} position={[0.3, 0, -0.18]} rotation={[0, 0.6, 0]} castShadow receiveShadow />
      {(
        [
          [0.22, 0.28, 0],
          [-0.42, -0.2, 1],
          [0.42, 0.1, 2],
        ] as [number, number, number][]
      ).map(([x, z, v]) => (
        <mesh key={v} geometry={cupGeometry(v)} material={p.glaze} position={[x, 0, z]} castShadow receiveShadow />
      ))}
    </group>
  );
}

// ---------- the cat ----------

/** A ginger tabby curled up asleep, nose tucked into its tail. About 0.5 long, lying on y = 0, facing +z. */
function catGeometry() {
  return cached('ramen-cat', () => {
    const body = ellipsoid(0, 0.105, -0.01, 0.2, 0.11, 0.155);
    const haunch = ellipsoid(-0.1, 0.11, -0.04, 0.12, 0.1, 0.12);
    const shoulder = ellipsoid(0.1, 0.1, 0.03, 0.1, 0.085, 0.11);
    const head = ellipsoid(0.15, 0.115, 0.09, 0.085, 0.075, 0.08);
    const muzzle = ellipsoid(0.17, 0.095, 0.155, 0.04, 0.03, 0.03);
    const ears = [cone(0.12, 0.16, 0.06, 0.1, 0.225, 0.05, 0.03, 0.005), cone(0.205, 0.165, 0.07, 0.235, 0.215, 0.04, 0.03, 0.005)];
    const paws = mirrorX(ellipsoid(0.04, 0.025, 0.15, 0.04, 0.025, 0.05));
    const tail = chain(
      [
        [-0.25, 0.06, -0.05],
        [-0.22, 0.04, 0.09],
        [-0.12, 0.035, 0.17],
        [0.02, 0.035, 0.2],
        [0.12, 0.04, 0.19],
      ],
      0.038,
      0.026,
      0.02,
    );
    const sdf: SDF = (x, y, z) => {
      let d = smin(body(x, y, z), haunch(x, y, z), 0.06);
      d = smin(d, shoulder(x, y, z), 0.05);
      d = smin(d, head(x, y, z), 0.04);
      d = smin(d, muzzle(x, y, z), 0.02);
      for (const e of ears) d = smin(d, e(x, y, z), 0.012);
      d = smin(d, paws(x - 0.12, y, z), 0.03);
      d = smin(d, tail(x, y, z), 0.025);
      // fur: a soft lumpy surface
      d += 0.003 * noise3(x * 60, y * 60, z * 60);
      return Math.max(d, -y);
    };
    const ginger = C('#d9893e');
    const dark = C('#9a4f1c');
    const cream = C('#f4e2c4');
    const pink = C('#e89a9a');
    return meshSDF(sdf, {
      min: [-0.32, -0.01, -0.2],
      max: [0.3, 0.25, 0.26],
      cell: 0.0065,
      paint: (x, y, z, _nx, ny, _nz, out) => {
        out.copy(ginger);
        // tabby stripes running round the body and down the tail
        const stripe = Math.sin(x * 46 + noise3(x * 8, y * 8, z * 8) * 3) * 0.5 + 0.5;
        mix(out, out, dark, smoothstep(0.55, 0.85, stripe) * 0.7 * smoothstep(0.02, 0.1, y));
        // white chest, paws and muzzle, lighter belly
        const chest = smoothstep(0.08, 0.02, Math.hypot(x - 0.15, y - 0.06, z - 0.15));
        const paw = smoothstep(0.06, 0.02, Math.hypot(Math.abs(x - 0.12) - 0.04, y - 0.025, z - 0.16));
        const muz = smoothstep(0.045, 0.02, Math.hypot(x - 0.17, y - 0.09, z - 0.17));
        mix(out, out, cream, Math.max(chest, paw, muz) + smoothstep(0.0, -0.6, ny) * 0.4);
        // pink inner ears and nose
        if (y > 0.18 && z > 0.05) mix(out, out, pink, 0.35);
        if (Math.hypot(x - 0.172, y - 0.105, z - 0.185) < 0.012) out.copy(pink);
        // the tail tip darker
        if (x > 0.08 && z > 0.16 && y < 0.07) mix(out, out, dark, 0.5);
      },
    });
  });
}

function eyesGeometry() {
  return once('ramen:cat-eyes', () => {
    const m = new Merger();
    for (const s of [-1, 1]) {
      const cx = 0.15 + s * 0.035;
      const pts = [V(cx - 0.018, 0.128, 0.162 - s * 0.0), V(cx, 0.122, 0.168), V(cx + 0.018, 0.128, 0.163)];
      m.add(tubeThrough(pts, () => 0.0035, 8, 4).geometry);
    }
    return paintFlat(m.build(), '#2a1a12');
  });
}

/** The shop cat, asleep: it breathes, and now and then the tip of its tail flicks. */
export function SleepingCat({ position, rotation = 0, scale = 1 }: { position: [number, number, number]; rotation?: number; scale?: number }) {
  const g = catGeometry();
  const eyes = eyesGeometry();
  const m = staffMats();
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!body.current) return;
    const breath = Math.sin(t * 1.6) * 0.5 + 0.5;
    body.current.scale.set(1 + breath * 0.012, 1 + breath * 0.035, 1 + breath * 0.02);
  });
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <group ref={body}>
        <mesh geometry={g} material={m.fur} castShadow receiveShadow />
        <mesh geometry={eyes} material={m.fur} />
      </group>
    </group>
  );
}

// ---------- assembled ----------

export function StaffCorner() {
  return (
    <group>
      <TableAndStools />
      <TeaThings />
      {/* the cat, asleep on the back window's sill */}
      <SleepingCat position={[WIN_BACK.x0 + 0.8, WIN_BACK.y0 + 0.002, ROOM.back + 0.1 - REVEAL * 0.15]} rotation={-0.3} scale={1.55} />
    </group>
  );
}

