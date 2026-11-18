import { useMemo } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { CUSTOMER_SEATS, DINING_TABLES } from '../kitchen/plan';
import { counterMats } from './ramen-counter';
import { brushMarks, C, fbm3, mat, Merger, mix, noise3, once, paint, paintFlat, paintLathe, rand, roundRect, slab, smoothLathe, smoothstep, tex, trs, V, woodTex } from './ramen-kit';
import { propMats } from './ramen-props';

// The dining floor's two small tables in the front corners, where customers
// eat what the waiter brings from the pass: a polished round top on a cast-iron
// base, three spindle-back chairs at the customers' seats, and a little setting
// on the front edge (a cup of chopsticks, a menu card, a water jug and cups).
// The middle of each table and the places in front of the customers stay clear
// for the bowls.

function diningMats() {
  return {
    chair: mat('d:chair', () => new THREE.MeshStandardMaterial({ map: woodTex('chair', { w: 512, h: 128, light: '#8a5a32', dark: '#2e160a', planks: 1, rings: 7, seed: 57, joints: false, seams: 0, figure: 0.25 }), roughness: 0.5, vertexColors: true })),
    iron: mat('d:iron', () => new THREE.MeshStandardMaterial({ color: '#1f1b18', metalness: 0.55, roughness: 0.5, vertexColors: true })),
  };
}

// ---------- the table ----------

function tableGeometries(r: number, top: number) {
  return once(`ramen:dining-table:${r}:${top}`, () => {
    const n = 30;
    const slabG = smoothLathe(
      [
        [0, top - 0.065],
        [r - 0.03, top - 0.065],
        [r + 0.004, top - 0.045],
        [r + 0.01, top - 0.02],
        [r - 0.014, top],
        [0, top],
      ],
      n,
      72,
    );
    // planar UVs from above, so the grain runs across the top
    const p = slabG.attributes.position;
    const uv = slabG.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.6 + 0.2, p.getZ(i) / 1.6 + 0.4);
    // a darker rubbed edge and a couple of faint water rings
    paint(slabG, (x, y, z, out) => {
      out.setScalar(0.92 + 0.1 * fbm3(x * 2.2, y, z * 2.2));
      out.multiplyScalar(1 - smoothstep(r - 0.1, r, Math.hypot(x, z)) * 0.2);
      for (const [cx, cz, rr] of [
        [0.22, 0.3, 0.06],
        [-0.3, 0.12, 0.055],
      ] as [number, number, number][])
        if (y > top - 0.004) out.multiplyScalar(1 - smoothstep(0.01, 0.002, Math.abs(Math.hypot(x - cx, z - cz) - rr)) * 0.18);
    });
    // a cast-iron base: a turned column and four curved feet
    const base = new Merger();
    const col = smoothLathe(
      [
        [0, 0.06],
        [0.1, 0.06],
        [0.075, 0.1],
        [0.055, 0.2],
        [0.05, 0.5],
        [0.06, top - 0.16],
        [0.085, top - 0.1],
        [0.2, top - 0.075],
        [0, top - 0.07],
      ],
      30,
      24,
    );
    base.add(col);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const c = Math.cos(a);
      const s = Math.sin(a);
      base.add(tubeThrough([V(c * 0.05, 0.12, s * 0.05), V(c * 0.2, 0.1, s * 0.2), V(c * 0.33, 0.05, s * 0.33), V(c * 0.4, 0.02, s * 0.4)], (t) => 0.03 - t * 0.008, 16, 8).geometry);
      base.add(new THREE.CylinderGeometry(0.035, 0.04, 0.02, 12), trs([c * 0.4, 0.01, s * 0.4]));
    }
    const baseG = paint(base.build(), (x, y, z, out) => out.setScalar(0.85 + 0.25 * noise3(x * 14, y * 14, z * 14)));
    return { slab: slabG, base: baseG };
  });
}

// ---------- chairs ----------

/** A small spindle-back chair, built facing +z (the sitter looks along +z), seat top at `seatY`. */
function chairGeometry(seatY: number) {
  return once(`ramen:dining-chair:${seatY}`, () => {
    const m = new Merger();
    const r = rand(9);
    const tint = () => new THREE.Color().setScalar(0.86 + r() * 0.24);
    const w = 0.46;
    const d = 0.42;
    // the seat: a rounded board with softened edges
    const seat = slab(roundRect(w, d, 0.07), 0.05, 0.016, 2, 8).rotateX(-Math.PI / 2).translate(0, seatY - 0.025, 0);
    m.add(seat, undefined, tint());
    // legs, splayed a little; the back ones carry on up as the back posts
    const legs: [number, number][] = [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ];
    for (const [sx, sz] of legs) {
      const top = V(sx * (w / 2 - 0.05), seatY - 0.04, sz * (d / 2 - 0.05));
      const foot = V(sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02));
      m.add(tubeThrough([top, foot], (t) => 0.022 - t * 0.004, 4, 10).geometry, undefined, tint());
      if (sz < 0) m.add(tubeThrough([V(sx * (w / 2 - 0.05), seatY - 0.02, -(d / 2 - 0.05)), V(sx * (w / 2 - 0.055), seatY + 0.22, -(d / 2 - 0.02)), V(sx * (w / 2 - 0.06), seatY + 0.44, -(d / 2 + 0.02))], () => 0.02, 12, 10).geometry, undefined, tint());
    }
    // stretchers
    for (const sx of [-1, 1]) m.add(tubeThrough([V(sx * (w / 2 - 0.035), 0.17, d / 2 - 0.035), V(sx * (w / 2 - 0.035), 0.17, -(d / 2 - 0.035))], () => 0.012, 2, 8).geometry, undefined, tint());
    m.add(tubeThrough([V(-(w / 2 - 0.04), 0.22, d / 2 - 0.04), V(w / 2 - 0.04, 0.22, d / 2 - 0.04)], () => 0.012, 2, 8).geometry, undefined, tint());
    // the back: a bowed top rail over three spindles
    const topY = seatY + 0.42;
    const zb = -(d / 2 + 0.01);
    m.add(tubeThrough([V(-(w / 2 - 0.05), topY, zb), V(0, topY + 0.02, zb - 0.05), V(w / 2 - 0.05, topY, zb)], () => 0.026, 20, 10).geometry, undefined, tint());
    for (const x of [-0.1, 0, 0.1]) m.add(tubeThrough([V(x, seatY, -(d / 2 - 0.04)), V(x * 1.05, topY - 0.02, zb - (x === 0 ? 0.045 : 0.03))], () => 0.011, 6, 6).geometry, undefined, tint());
    return m.build();
  });
}

// ---------- the setting ----------

/** A folded menu card: a red band, a little drawing of a bowl, brushed marks (no words). */
function menuCardTex() {
  return tex('menu-card', 256, 192, (g, w, h) => {
    g.fillStyle = '#f2e8d2';
    g.fillRect(0, 0, w, h);
    const r = rand(14);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(150,110,60,${0.04 + r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 4, 1);
    }
    g.fillStyle = '#b02a1c';
    g.fillRect(0, 0, w, h * 0.16);
    // the bowl, steam rising
    g.fillStyle = '#2a1e18';
    g.beginPath();
    g.moveTo(w * 0.12, h * 0.52);
    g.quadraticCurveTo(w * 0.14, h * 0.86, w * 0.3, h * 0.88);
    g.quadraticCurveTo(w * 0.46, h * 0.86, w * 0.48, h * 0.52);
    g.fill();
    g.fillStyle = '#b02a1c';
    g.fillRect(w * 0.13, h * 0.56, w * 0.34, h * 0.05);
    g.strokeStyle = 'rgba(80,60,40,0.6)';
    g.lineWidth = 4;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = w * (0.2 + i * 0.1);
      g.beginPath();
      g.moveTo(x, h * 0.46);
      g.bezierCurveTo(x - 10, h * 0.38, x + 10, h * 0.3, x, h * 0.22);
      g.stroke();
    }
    brushMarks(g, r, w * 0.6, h * 0.24, w * 0.12, h * 0.66, '#2a1e18', 3, true);
    brushMarks(g, r, w * 0.78, h * 0.3, w * 0.1, h * 0.5, '#2a1e18', 2, true);
  });
}

function settingGeometries() {
  return once('ramen:dining-setting', () => {
    // a lacquered cup of chopsticks
    const cup = new Merger();
    const n = 24;
    const pot = smoothLathe(
      [
        [0, 0],
        [0.045, 0],
        [0.05, 0.008],
        [0.05, 0.13],
        [0.044, 0.132],
        [0.042, 0.02],
        [0, 0.016],
      ],
      n,
      28,
    );
    paintLathe(pot, n, (_x, y, _z, _a, out) => {
      out.set('#1a1412');
      if (y > 0.095 && y < 0.11) out.set('#a8261a');
    });
    cup.add(pot);
    const r = rand(5);
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 0.025;
      const lean = 0.06 + r() * 0.1;
      const g = new THREE.CylinderGeometry(0.0045, 0.006, 0.32, 6).translate(0, 0.16, 0);
      paint(g, (_x, y, _z, out) => (y > 0.27 && i % 3 === 0 ? out.set('#b8261c') : out.set('#e2c896').multiplyScalar(0.9 + r() * 0.15)));
      cup.add(g, trs([Math.cos(a) * d, 0.02, Math.sin(a) * d], [Math.sin(a) * lean, 0, -Math.cos(a) * lean]));
    }
    // a water jug: white glaze, an indigo band, a lip and a handle
    const jugN = 50;
    const jug = smoothLathe(
      [
        [0, 0],
        [0.07, 0],
        [0.078, 0.012],
        [0.095, 0.08],
        [0.098, 0.15],
        [0.08, 0.22],
        [0.062, 0.26],
        [0.066, 0.29],
        [0.072, 0.3],
        [0.064, 0.302],
        [0.056, 0.28],
        [0.05, 0.25],
        [0, 0.24],
      ],
      jugN,
      40,
    );
    const white = C('#f0ebe0');
    const indigo = C('#2a4a7a');
    paintLathe(jug, jugN, (x, y, z, _a, out) => {
      out.copy(white);
      mix(out, out, indigo, smoothstep(0.1, 0.106, y) * smoothstep(0.16, 0.154, y));
      mix(out, out, indigo, smoothstep(0.1, 0.04, Math.abs(Math.sin(Math.atan2(z, x) * 6))) * smoothstep(0.17, 0.2, y) * smoothstep(0.24, 0.22, y) * 0.8);
      if (y < 0.012) out.set('#b8a07a');
    });
    const jugAll = new Merger().add(jug);
    jugAll.add(paintFlat(tubeThrough([V(0, 0.27, -0.06), V(0, 0.27, -0.13), V(0, 0.2, -0.15), V(0, 0.11, -0.12), V(0, 0.08, -0.095)], () => 0.014, 20, 8).geometry, white));
    jugAll.add(paintFlat(new THREE.ConeGeometry(0.03, 0.06, 12, 1, true).rotateX(Math.PI / 2 + 0.6).translate(0, 0.29, 0.075), white));
    // two small cups
    const tumbler = smoothLathe(
      [
        [0, 0],
        [0.035, 0],
        [0.04, 0.008],
        [0.044, 0.09],
        [0.04, 0.092],
        [0.037, 0.02],
        [0, 0.016],
      ],
      20,
      24,
    );
    paintLathe(tumbler, 20, (_x, y, _z, along, out) => {
      out.set('#d8d0bc');
      if (along > 0.6 && y < 0.07) out.set('#c8dce4');
      if (y > 0.075 && along < 0.6) out.set('#8a5a3a');
    });
    return { cup: cup.build(), jug: jugAll.build(), tumbler };
  });
}

function MenuCard({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const card = mat('d:menu-card', () => new THREE.MeshStandardMaterial({ map: menuCardTex(), roughness: 0.85, side: THREE.DoubleSide }));
  const geo = useMemo(() => once('ramen:menu-card', () => new THREE.PlaneGeometry(0.18, 0.135)), []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* a tent: two leaves leaning together */}
      <mesh geometry={geo} material={card} position={[0, 0.065, 0.025]} rotation={[-0.36, 0, 0]} castShadow />
      <mesh geometry={geo} material={card} position={[0, 0.065, -0.025]} rotation={[0.36, Math.PI, 0]} castShadow />
    </group>
  );
}

// ---------- assembled ----------

export function DiningTables() {
  const c = counterMats();
  const d = diningMats();
  const p = propMats();
  const set = settingGeometries();
  return (
    <group>
      {DINING_TABLES.map((t, i) => {
        const g = tableGeometries(t.r, t.top);
        const side = t.x < 0 ? -1 : 1;
        return (
          <group key={i}>
            <group position={[t.x, 0, t.z]}>
              <mesh geometry={g.slab} material={c.ledge} castShadow receiveShadow userData={{ surface: 'top' }} />
              <mesh geometry={g.base} material={d.iron} castShadow receiveShadow />
              {/* the setting, on the front edge where nobody sits: the middle stays clear for the bowls */}
              <group position={[0, t.top, 0]}>
                <mesh geometry={set.cup} material={p.glaze} position={[-side * 0.24, 0, 0.44]} castShadow />
                <MenuCard position={[-side * 0.02, 0, 0.56]} rotation={side * 0.25} />
                <mesh geometry={set.jug} material={p.glaze} position={[side * 0.24, 0, 0.42]} rotation={[0, side * 0.6, 0]} castShadow />
                <mesh geometry={set.tumbler} material={p.glaze} position={[side * 0.42, 0, 0.26]} castShadow />
                <mesh geometry={set.tumbler} material={p.glaze} position={[side * 0.05, 0, 0.36]} castShadow />
              </group>
            </group>
          </group>
        );
      })}
      {CUSTOMER_SEATS.map((s, i) => (
        <mesh key={i} geometry={chairGeometry(s.y)} material={d.chair} position={[s.x, 0, s.z]} rotation={[0, s.yaw, 0]} castShadow receiveShadow />
      ))}
    </group>
  );
}
