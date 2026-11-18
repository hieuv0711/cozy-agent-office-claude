import { useMemo } from 'react';
import * as THREE from 'three';
import { LUMBER, ROOM } from './workshop-dims';
import { C, Merger, noise3, once, paint, paintLathe, plank, rand, shadeBy, smoothLathe, trs, wmat, woodTex } from './workshop-kit';

// The timber rack on the left wall toward the front: iron uprights with
// cantilever arms, boards of pine, beech, cherry and walnut laid on them in
// short stacks, long boards leaning against the wall at the front, and a
// bucket of dowels standing on the floor.

const X0 = ROOM.x0;

const WOODS: [string, string][] = [
  ['#e2c08e', '#9a7044'], // pine
  ['#e8d0a8', '#b08a5e'], // beech
  ['#c27a4a', '#6a3418'], // cherry
  ['#7a5032', '#2a160a'], // walnut
  ['#d8b878', '#8a6a3a'], // oak
];

function rackGeometries() {
  const iron = new Merger();
  const boards: Merger[] = WOODS.map(() => new Merger());
  const r = rand(37);
  const { z0, z1, ys, reach } = LUMBER;
  const uprights = [z0 + 0.12, (z0 + z1) / 2, z1 - 0.12];
  const black = C('#262220');
  for (const z of uprights) {
    iron.add(plank(0.05, ys[ys.length - 1] + 0.3, 0.08, 0.008), trs([X0 + 0.05, (ys[ys.length - 1] + 0.3) / 2, z]), black);
    for (const y of ys) {
      iron.add(plank(reach, 0.04, 0.05, 0.008), trs([X0 + 0.05 + reach / 2, y - 0.02, z]), black);
      // the arm's tip turned up a little, so boards don't roll off
      iron.add(plank(0.035, 0.07, 0.05, 0.008), trs([X0 + 0.05 + reach - 0.02, y + 0.03, z]), black);
      for (const dy of [-0.08, 0.06]) iron.add(new THREE.SphereGeometry(0.016, 8, 6), trs([X0 + 0.1, y + dy, z + 0.045]), black);
    }
  }
  // boards on each level: a few long ones and some shorter, each its own wood
  ys.forEach((y, li) => {
    let top = y;
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const wi = Math.floor(r() * WOODS.length);
      const len = (z1 - z0) * (0.55 + r() * 0.5);
      const thick = 0.035 + r() * 0.03;
      const w = 0.16 + r() * 0.22;
      const zc = z0 + len / 2 + r() * (z1 - z0 - len);
      const g = plank(len, thick, w, 0.006, [1 / 2.4, 1 / 1.2], 1, [r() * 4, r() * 4]);
      shadeBy(g, (x, yy, z) => 0.85 + 0.25 * noise3(x * 2 + li, yy * 20, z * 8));
      boards[wi].add(g, trs([X0 + 0.07 + w / 2 + r() * (reach - w - 0.06), top + thick / 2, zc], [0, Math.PI / 2 + (r() - 0.5) * 0.02, 0]));
      top += thick + 0.002;
    }
  });
  // long boards leaning against the wall at the front end
  for (let k = 0; k < 5; k++) {
    const wi = (k * 2) % WOODS.length;
    const len = 3.6 + r() * 1.0;
    const g = plank(0.18 + r() * 0.08, len, 0.035, 0.006, [1 / 1.2, 1 / 2.4], 1, [r() * 4, r() * 4], true);
    boards[wi].add(g, trs([X0 + 0.3 + k * 0.035, len / 2 * Math.cos(0.12), z1 + 0.25 + k * 0.17], [0, 0, 0.12 + k * 0.01]));
  }
  // a bucket of dowels on the floor
  const bucket = smoothLathe(
    [
      [0, 0],
      [0.17, 0],
      [0.175, 0.012],
      [0.2, 0.36],
      [0.206, 0.37],
      [0.19, 0.36],
      [0.165, 0.03],
      [0, 0.025],
    ],
    24,
    28,
  );
  paintLathe(bucket, 24, (x, y, z, along, out) => {
    out.set('#6a5a4a');
    if (Math.abs(y - 0.08) < 0.014 || Math.abs(y - 0.28) < 0.014) out.set('#2a2420');
    if (along > 0.6) out.multiplyScalar(0.5);
    out.multiplyScalar(0.85 + 0.2 * noise3(x * 20, y * 20, z * 20));
  });
  const misc = new Merger();
  misc.add(bucket, trs([X0 + 0.55, 0, z1 - 0.35]));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + r();
    const rr = 0.04 + r() * 0.08;
    const len = 1.1 + r() * 0.6;
    const d = new THREE.CylinderGeometry(0.014 + r() * 0.01, 0.014 + r() * 0.01, len, 8);
    paint(d, (_x, _y, _z, out) => out.set(WOODS[k % 3][0]));
    misc.add(d, trs([X0 + 0.55 + Math.cos(a) * rr, len / 2 + 0.02, z1 - 0.35 + Math.sin(a) * rr], [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3]));
  }
  // a two-man saw hung high on the wall above the rack
  const saw = new Merger();
  const blade = new THREE.Shape();
  blade.moveTo(-1.0, 0.02);
  blade.quadraticCurveTo(0, -0.22, 1.0, 0.02);
  blade.lineTo(1.0, 0.1);
  blade.lineTo(-1.0, 0.1);
  blade.closePath();
  saw.add(new THREE.ExtrudeGeometry(blade, { depth: 0.005, bevelEnabled: false, curveSegments: 20 }), trs([0, 0, 0.01]), C('#9aa0a6'));
  for (const s of [-1, 1]) {
    const h = smoothLathe(
      [
        [0, 0],
        [0.03, 0],
        [0.04, 0.05],
        [0.04, 0.22],
        [0.03, 0.26],
        [0, 0.26],
      ],
      12,
      14,
    );
    saw.add(h, trs([s * 1.02, -0.02, 0.03]), C('#7a4a28'));
  }
  return { iron: iron.build(), boards: boards.map((b) => b.build()), misc: misc.build(), saw: saw.build() };
}

export function LumberRack() {
  const geo = useMemo(() => once('ws:lumber', rackGeometries), []);
  const mats = useMemo(
    () => WOODS.map(([light, dark], i) => wmat(`l:wood:${i}`, () => new THREE.MeshStandardMaterial({ map: woodTex(`ws-lumber-${i}`, { w: 1024, h: 256, light, dark, planks: 2, rings: 8, seed: 90 + i, joints: false, seams: 0.6, figure: 0.4 }), roughness: 0.6, vertexColors: true }))),
    [],
  );
  const iron = wmat('l:iron', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.5 }));
  const vc = wmat('l:vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
  const steel = wmat('l:steel', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.4 }));
  const zc = (LUMBER.z0 + LUMBER.z1) / 2;
  return (
    <group>
      <mesh geometry={geo.iron} material={iron} castShadow receiveShadow />
      {geo.boards.map((g, i) => (
        <mesh key={i} geometry={g} material={mats[i]} castShadow receiveShadow />
      ))}
      <mesh geometry={geo.misc} material={vc} castShadow receiveShadow />
      <mesh geometry={geo.saw} material={steel} position={[X0 + 0.04, 4.55, zc]} rotation={[0, Math.PI / 2, 0]} castShadow />
    </group>
  );
}
