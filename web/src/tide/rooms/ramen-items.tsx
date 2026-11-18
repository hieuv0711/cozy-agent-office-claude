import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { cached, chain, cone, ellipsoid, meshSDF, mirrorX, type SDF, smin, sphere } from '../../tank/sdf';
import { stoolGeometries } from './ramen-counter';
import { boxUV, brushMarks, bumpTex, C, fbm3, mat, Merger, mix, noise3, once, paint, paintFlat, paintLathe, plank, rand, roundRect, slab, smoothLathe, smoothstep, tex, trs, V, variant, woodTex, worley3 } from './ramen-kit';
import { clothFinish, indigoGround, swayCloth, useCloth, waves } from './ramen-openings';
import { Bottle, bowlStackGeometry, Jar, propMats } from './ramen-props';

// The things you can add to the ramen kitchen. Each stands on y = 0 facing +z
// (a wall item has its back on the wall at the origin and faces out of it),
// drawn about 1.6x real size like the rest of the kitchen's props, and varies
// with its seed. None of them carries a light (adding a light at runtime would
// recompile every material); lanterns glow through bloom instead.

// ---------- shared materials ----------

function woodMat(key: string, light: string, dark: string, seed: number) {
  return mat(key, () => new THREE.MeshStandardMaterial({ map: woodTex(key, { w: 512, h: 256, light, dark, planks: 1, rings: 8, seed, joints: false, seams: 0, figure: 0.3 }), roughness: 0.52, vertexColors: true }));
}

export function itemMats() {
  return {
    wood: woodMat('i:wood', '#8a5530', '#2e1508', 31),
    dark: woodMat('i:dark', '#4e2c16', '#140904', 32),
    pale: woodMat('i:pale', '#e6cc9e', '#a8804e', 33),
    lacquer: mat('i:lacquer', () => new THREE.MeshPhysicalMaterial({ color: '#17110f', roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.1 })),
    redLacquer: mat('i:red-lacquer', () => new THREE.MeshPhysicalMaterial({ color: '#8a1e14', roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.12 })),
    iron: mat('i:iron', () => new THREE.MeshStandardMaterial({ color: '#211d1a', metalness: 0.6, roughness: 0.45 })),
    cord: mat('i:cord', () => new THREE.MeshStandardMaterial({ color: '#2a1c12', roughness: 0.85 })),
    vc: mat('i:vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })),
    leaf: mat('i:leaf', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide })),
    straw: mat('i:straw', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, bumpMap: bumpTex('straw', { scale: 24, contrast: 0.7 }), bumpScale: 0.6 })),
    gold: mat('i:gold', () => new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: 0.95, roughness: 0.26 })),
  };
}

// ---------- paper lantern on a bracket (wall) ----------

const PAPERS = [
  { name: 'red', edge: '#5e100a', mid: '#d22e1c', hot: '#f2552e', glow: '#ff6a3a', ink: 'rgba(30,8,4,0.78)', band: 'rgba(16,6,4,0.92)' },
  { name: 'white', edge: '#9c7a50', mid: '#efe0c0', hot: '#fff7e6', glow: '#ffc27a', ink: 'rgba(80,38,16,0.6)', band: 'rgba(24,14,10,0.92)' },
  { name: 'indigo', edge: '#0a1222', mid: '#1d3156', hot: '#2c4876', glow: '#6c8cd4', ink: 'rgba(232,228,216,0.85)', band: 'rgba(6,8,18,0.95)' },
];

function lanternPaper(i: number) {
  const p = PAPERS[i];
  return tex(`lantern-paper:${p.name}`, 512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, p.edge);
    grad.addColorStop(0.22, p.mid);
    grad.addColorStop(0.5, p.hot);
    grad.addColorStop(0.78, p.mid);
    grad.addColorStop(1, p.edge);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const r = rand(i + 5);
    for (let k = 0; k < 500; k++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + r() * 0.05})`;
      g.lineWidth = 0.6 + r();
      const x = r() * w;
      const y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 24, y + (r() - 0.5) * 24);
      g.stroke();
    }
    for (let k = 1; k < 12; k++) {
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fillRect(0, (k / 12) * h - 1.5, w, 3);
    }
    g.fillStyle = p.band;
    g.fillRect(0, 0, w, h * 0.085);
    g.fillRect(0, h * 0.915, w, h * 0.085);
    // a row of breaking waves round the middle: a pattern, not a word
    g.strokeStyle = p.ink;
    g.lineCap = 'round';
    for (let x = -64; x < w + 64; x += 128) {
      g.lineWidth = 6;
      g.beginPath();
      g.arc(x, h * 0.64, 50, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
      g.lineWidth = 4;
      g.beginPath();
      g.arc(x + 20, h * 0.64, 28, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      g.beginPath();
      g.arc(x + 64, h * 0.4, 7, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

function lanternGeometries() {
  return once('ri:lantern', () => {
    const n = 40;
    const globe = smoothLathe(
      [
        [0.1, -0.25],
        [0.17, -0.22],
        [0.205, -0.12],
        [0.215, 0],
        [0.205, 0.12],
        [0.17, 0.22],
        [0.1, 0.25],
      ],
      n,
      40,
    );
    const p = globe.attributes.position;
    const uv = globe.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) + 0.25) / 0.5);
    const caps = new Merger();
    for (const y of [0.25, -0.25])
      caps.add(
        smoothLathe(
          [
            [0.07, y - 0.03],
            [0.115, y - 0.03],
            [0.122, y],
            [0.115, y + 0.03],
            [0.07, y + 0.03],
          ],
          10,
          28,
        ),
      );
    caps.add(tubeThrough([V(0, -0.28, 0), V(0, -0.36, 0.003)], () => 0.007, 4, 5).geometry);
    caps.add(new THREE.ConeGeometry(0.028, 0.1, 12).translate(0, -0.41, 0));
    const bracket = new Merger();
    bracket.add(plank(0.1, 0.34, 0.035, 0.012), trs([0, 0.0, 0.018]));
    bracket.add(tubeThrough([V(0, 0.1, 0.03), V(0, 0.11, 0.25), V(0, 0.1, 0.46), V(0, 0.065, 0.505), V(0, 0.03, 0.48)], () => 0.016, 24, 8).geometry);
    bracket.add(tubeThrough([V(0, -0.14, 0.03), V(0, -0.03, 0.17), V(0, 0.095, 0.3)], () => 0.011, 12, 6).geometry);
    for (const y of [0.12, -0.12]) bracket.add(new THREE.SphereGeometry(0.014, 8, 6), trs([0, y, 0.04]));
    const cord = tubeThrough([V(0, 0.09, 0.42), V(0, -0.02, 0.423), V(0, -0.13, 0.42)], () => 0.007, 6, 5).geometry;
    return { globe, caps: caps.build(), bracket: bracket.build(), cord };
  });
}

/** A paper lantern hung from a wrought bracket: red, white or indigo by seed. It glows; it lights nothing. */
export function WallLantern({ seed }: { seed: number }) {
  const v = variant(seed, PAPERS.length);
  const g = lanternGeometries();
  const m = itemMats();
  const paper = mat(`i:lantern:${v}`, () => new THREE.MeshStandardMaterial({ map: lanternPaper(v), emissiveMap: lanternPaper(v), emissive: new THREE.Color(PAPERS[v].glow), emissiveIntensity: v === 2 ? 1.6 : 1.25, roughness: 0.85, side: THREE.DoubleSide }));
  return (
    <group scale={1.45}>
      <mesh geometry={g.bracket} material={m.iron} castShadow />
      <mesh geometry={g.cord} material={m.cord} />
      <group position={[0, -0.39, 0.42]} rotation={[0, seed * 0.7, 0]}>
        <mesh geometry={g.globe} material={paper} />
        <mesh geometry={g.caps} material={m.lacquer} castShadow />
      </group>
    </group>
  );
}

// ---------- a noren hung on the wall ----------

const NOREN_STYLES = ['wave', 'plum', 'stripe'] as const;

function norenItemTex(style: (typeof NOREN_STYLES)[number]) {
  return tex(`noren-item:${style}`, 512, 512, (g, w, h) => {
    const r = rand(style.length * 7);
    if (style === 'wave') {
      indigoGround(g, w, h, 21);
      g.strokeStyle = 'rgba(236,232,220,0.92)';
      g.lineWidth = 22;
      g.beginPath();
      g.arc(w / 2, h * 0.38, w * 0.22, 0, Math.PI * 2);
      g.stroke();
      waves(g, w, h * 0.74, h * 0.24, 5, 'rgba(236,232,220,0.92)');
    } else if (style === 'plum') {
      g.fillStyle = '#7e2018';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const b = g.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, 80);
        b.addColorStop(0, 'rgba(40,6,4,0.12)');
        b.addColorStop(1, 'rgba(40,6,4,0)');
        g.fillStyle = b;
        g.fillRect(0, 0, w, h);
      }
      // scattered five-petal blossoms
      for (let i = 0; i < 16; i++) {
        const x = r() * w;
        const y = 40 + r() * (h - 80);
        const s = 14 + r() * 16;
        g.fillStyle = 'rgba(240,232,220,0.92)';
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + r();
          g.beginPath();
          g.arc(x + Math.cos(a) * s * 0.62, y + Math.sin(a) * s * 0.62, s * 0.45, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(126,32,24,0.95)';
        g.beginPath();
        g.arc(x, y, s * 0.22, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(240,232,220,0.9)';
      g.fillRect(0, h * 0.9, w, h * 0.03);
    } else {
      g.fillStyle = '#e6dcc4';
      g.fillRect(0, 0, w, h);
      let x = 0;
      while (x < w) {
        const sw = 10 + r() * 34;
        g.fillStyle = r() < 0.5 ? '#22365a' : '#3a5480';
        g.fillRect(x, 0, sw, h * 0.86);
        x += sw + 12 + r() * 30;
      }
      g.fillStyle = '#22365a';
      g.fillRect(0, h * 0.86, w, h * 0.14);
    }
    clothFinish(g, w, h, 30 + style.length);
  });
}

/** A short two-panel noren on a bamboo rod, swaying a little. Indigo waves, red plum blossom or striped, by seed. */
export function NorenHanging({ seed }: { seed: number }) {
  const style = NOREN_STYLES[variant(seed, NOREN_STYLES.length)];
  const m = itemMats();
  const cloth = mat(`i:noren:${style}`, () => new THREE.MeshStandardMaterial({ map: norenItemTex(style), bumpMap: bumpTex('cloth', { scale: 12, contrast: 0.5 }), bumpScale: 0.3, roughness: 0.92, side: THREE.DoubleSide }));
  const drop = 0.95;
  const panels = useMemo(
    () => [
      { x: -0.31, w: 0.6 },
      { x: 0.31, w: 0.6 },
    ],
    [],
  );
  const span = useMemo<[number, number]>(() => [-0.62, 0.62], []);
  const pieces = useCloth(panels, drop, span, seed + 3);
  useEffect(() => () => pieces.forEach((p) => p.geo.dispose()), [pieces]);
  useFrame(({ clock }) => swayCloth(pieces, clock.elapsedTime * 0.7 + seed, 0.02, drop));
  const rod = useMemo(
    () =>
      once('ri:bamboo-rod', () => {
        const g = tubeThrough([V(-0.72, 0, 0), V(0.72, 0, 0)], () => 0.022, 40, 10).geometry;
        // bamboo: pale green-gold with darker nodes
        return paint(g, (x, _y, _z, out) => {
          out.set('#b89a52').multiplyScalar(0.9 + 0.1 * noise3(x * 30, 1, 2));
          const node = Math.abs(((x + 0.72) % 0.36) - 0.18);
          if (node > 0.165) out.multiplyScalar(0.62);
        });
      }),
    [],
  );
  const hooks = useMemo(
    () =>
      once('ri:noren-hooks', () => {
        const h = new Merger();
        for (const x of [-0.55, 0.55]) {
          h.add(tubeThrough([V(x, 0.12, 0.0), V(x, 0.12, 0.06), V(x, 0.02, 0.08), V(x, -0.03, 0.07)], () => 0.008, 12, 6).geometry);
          h.add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 12).rotateX(Math.PI / 2), trs([x, 0.12, 0.005]));
        }
        return h.build();
      }),
    [],
  );
  return (
    <group scale={1.4}>
      <mesh geometry={hooks} material={m.iron} castShadow />
      <group position={[0, 0, 0.08]}>
        <mesh geometry={rod} material={m.vc} castShadow />
        {pieces.map((p, i) => (
          <mesh key={i} geometry={p.geo} material={cloth} position={[p.x, -0.02, 0.0]} castShadow receiveShadow />
        ))}
      </group>
    </group>
  );
}

// ---------- menu plaques (wall) ----------

/** Eight wooden menu tags: pale wood with brushed marks (shaped like writing, but not words), some with a red band or seal. */
function plaqueTex() {
  return tex('menu-plaques', 1024, 512, (g, w, h) => {
    const tw = w / 8;
    const r = rand(61);
    for (let i = 0; i < 8; i++) {
      const x = i * tw;
      const base = new THREE.Color(i % 3 === 1 ? '#d9bd8a' : '#e8d2a4').multiplyScalar(0.92 + r() * 0.12);
      g.fillStyle = '#' + base.getHexString();
      g.fillRect(x, 0, tw, h);
      // grain running down the tag
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(120,80,40,${0.05 + r() * 0.08})`;
        const gx = x + r() * tw;
        g.fillRect(gx, 0, 1 + r() * 2, h);
      }
      if (i % 4 === 2) {
        g.fillStyle = '#a8261a';
        g.fillRect(x, 0, tw, h * 0.13);
      }
      const ink = i % 5 === 3 ? '#8a1c12' : '#1e140e';
      brushMarks(g, r, x + tw * 0.24, h * (i % 4 === 2 ? 0.18 : 0.08), tw * 0.52, h * 0.6, ink, 3, true);
      if (i % 2 === 0) brushMarks(g, r, x + tw * 0.34, h * 0.74, tw * 0.32, h * 0.16, ink, 2, true);
      if (i % 3 === 0) {
        g.fillStyle = 'rgba(180,36,24,0.9)';
        g.fillRect(x + tw * 0.62, h * 0.86, tw * 0.22, tw * 0.22);
      }
      // a dark edge where the tag is chamfered
      g.fillStyle = 'rgba(60,36,18,0.35)';
      g.fillRect(x, 0, 3, h);
      g.fillRect(x + tw - 3, 0, 3, h);
    }
  });
}

function plaquesGeometries(seed: number) {
  return once(`ri:plaques:${seed % 4}`, () => {
    const r = rand(seed + 2);
    const bodies = new Merger();
    const faces = new Merger();
    const rings = new Merger();
    const rail = new Merger();
    rail.add(plank(1.62, 0.07, 0.07, 0.015, [1 / 1.5, 1 / 1.5]), trs([0, 0, 0.05]));
    for (const x of [-0.72, 0.72]) rail.add(plank(0.07, 0.12, 0.05, 0.012), trs([x, 0, 0.025]));
    const order = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => r() - 0.5);
    const n = 7;
    for (let k = 0; k < n; k++) {
      const x = -0.66 + (k * 1.32) / (n - 1);
      const tilt = (r() - 0.5) * 0.06;
      const len = 0.48 + r() * 0.08;
      const place = trs([x, -0.06, 0.09], [0, 0, tilt]);
      const body = plank(0.16, len, 0.024, 0.008, [1 / 1.2, 1 / 1.2], 1, [r(), r()], true);
      body.translate(0, -len / 2 - 0.03, 0);
      bodies.add(body, place);
      const face = new THREE.PlaneGeometry(0.148, len - 0.012);
      face.translate(0, -len / 2 - 0.03, 0.0135);
      const t = order[k];
      const uv = face.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (t + uv.getX(i)) / 8);
      faces.add(face, place);
      rings.add(new THREE.TorusGeometry(0.018, 0.004, 6, 14), new THREE.Matrix4().multiplyMatrices(place, trs([0, -0.012, 0])));
    }
    return { bodies: bodies.build(), faces: faces.build(), rings: rings.build(), rail: rail.build() };
  });
}

/** A rail of seven wooden menu tags with brushed marks, hung on the wall. */
export function MenuPlaques({ seed }: { seed: number }) {
  const g = plaquesGeometries(seed);
  const m = itemMats();
  const p = propMats();
  const face = mat('i:plaque-face', () => new THREE.MeshStandardMaterial({ map: plaqueTex(), roughness: 0.75 }));
  return (
    <group scale={1.35}>
      <mesh geometry={g.rail} material={m.dark} castShadow />
      <mesh geometry={g.bodies} material={m.pale} castShadow receiveShadow />
      <mesh geometry={g.faces} material={face} receiveShadow />
      <mesh geometry={g.rings} material={p.brass} />
    </group>
  );
}

// ---------- sake ----------

function tokkuriGeometry() {
  return once('ri:tokkuri', () => {
    const n = 50;
    const g = smoothLathe(
      [
        [0, 0],
        [0.045, 0],
        [0.05, 0.008],
        [0.068, 0.05],
        [0.074, 0.09],
        [0.06, 0.13],
        [0.03, 0.165],
        [0.022, 0.19],
        [0.03, 0.205],
        [0.024, 0.208],
        [0.016, 0.195],
        [0, 0.19],
      ],
      n,
      40,
    );
    return paintLathe(g, n, (x, y, z, _a, out) => {
      out.set('#f1ebde');
      // an indigo brushed band and a scatter of dots
      mix(out, out, C('#28467a'), smoothstep(0.06, 0.066, y) * smoothstep(0.112, 0.106, y));
      mix(out, out, C('#28467a'), smoothstep(0.1, 0.05, worley3(x * 40, y * 40, z * 40)) * smoothstep(0.12, 0.16, y) * 0.8);
      if (y < 0.01) out.set('#b8a07a');
    });
  });
}

function ochokoGeometry() {
  return once('ri:ochoko', () => {
    const n = 30;
    const g = smoothLathe(
      [
        [0, 0],
        [0.022, 0],
        [0.024, 0.006],
        [0.04, 0.035],
        [0.045, 0.05],
        [0.04, 0.052],
        [0.034, 0.038],
        [0, 0.012],
      ],
      n,
      28,
    );
    return paintLathe(g, n, (_x, y, _z, along, out) => {
      out.set('#f1ebde');
      if (along > 0.62) {
        // the bull's-eye inside
        out.set('#f4efe4');
        if (y < 0.025) out.set('#28467a');
      }
    });
  });
}

/** Sake: a big brown bottle with a flask and cups on a little tray, or two or three bottles. By seed. */
export function SakeSet({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const p = propMats();
  const m = itemMats();
  if (v === 0)
    return (
      <group>
        <group position={[-0.1, 0, -0.03]} rotation={[0, -0.3, 0]}>
          <Bottle kind="sake" label={0} />
        </group>
        <group position={[0.14, 0, 0.06]} rotation={[0, 0.25, 0]}>
          <mesh material={m.wood} position={[0, 0.012, 0]} castShadow receiveShadow geometry={once('ri:sake-tray', () => plank(0.3, 0.024, 0.2, 0.01, [1 / 1.2, 1 / 1.2]))} />
          <mesh geometry={tokkuriGeometry()} material={p.glaze} position={[-0.06, 0.024, -0.02]} castShadow />
          <mesh geometry={ochokoGeometry()} material={p.glaze} position={[0.06, 0.024, -0.04]} castShadow />
          <mesh geometry={ochokoGeometry()} material={p.glaze} position={[0.08, 0.024, 0.05]} castShadow />
        </group>
      </group>
    );
  if (v === 1)
    return (
      <group>
        <group position={[-0.09, 0, 0]} rotation={[0, 0.2, 0]}>
          <Bottle kind="sake" label={3} />
        </group>
        <group position={[0.1, 0, 0.03]} rotation={[0, -0.4, 0]}>
          <Bottle kind="mirin" label={1} />
        </group>
      </group>
    );
  return (
    <group>
      {[
        [-0.18, 0, 6, 'sake'],
        [0.0, 0.02, 0, 'sake'],
        [0.18, -0.01, 7, 'mirin'],
      ].map(([x, z, l, k], i) => (
        <group key={i} position={[x as number, 0, z as number]} rotation={[0, i * 0.5 - 0.4, 0]}>
          <Bottle kind={k as 'sake' | 'mirin'} label={l as number} />
        </group>
      ))}
    </group>
  );
}

// ---------- condiments ----------

function condimentGeometries() {
  return once('ri:condiments', () => {
    const tray = new Merger();
    const s = roundRect(0.44, 0.22, 0.04);
    const base = slab(s, 0.022, 0.006, 2, 8).rotateX(-Math.PI / 2).translate(0, 0.011, 0);
    tray.add(paint(base, (_x, y, _z, out) => (y > 0.019 ? out.set('#5a1610') : out.set('#161210'))));
    // a low raised rim
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const cx = Math.cos(t);
      const sz = Math.sin(t);
      pts.push(V(Math.sign(cx) * Math.pow(Math.abs(cx), 0.25) * 0.208, 0.026, Math.sign(sz) * Math.pow(Math.abs(sz), 0.25) * 0.098));
    }
    tray.add(paintFlat(tubeThrough(pts, () => 0.008, 48, 6).geometry, '#161210'));
    // a pepper shaker: white porcelain, a red cap with holes
    const n = 30;
    const shaker = paintLathe(
      smoothLathe(
        [
          [0, 0],
          [0.028, 0],
          [0.031, 0.01],
          [0.031, 0.085],
          [0.027, 0.095],
          [0.022, 0.112],
          [0, 0.118],
        ],
        n,
        28,
      ),
      n,
      (x, y, z, _a, out) => {
        out.set('#f2eee6');
        if (y > 0.09) {
          out.set('#b8261c');
          if (y > 0.11 && smoothstep(0.2, 0.1, worley3(x * 160, y * 20, z * 160)) > 0.5) out.set('#3a0a06');
        }
      },
    );
    // a bamboo toothpick pot with picks
    const pot = new Merger();
    pot.add(
      paint(new THREE.CylinderGeometry(0.024, 0.026, 0.07, 18, 1), (x, y, z, out) => {
        out.set('#b89a52').multiplyScalar(0.9 + 0.1 * noise3(x * 90, y * 20, z * 90));
        if (Math.abs(y) > 0.03) out.multiplyScalar(0.7);
      }),
      trs([0, 0.035, 0]),
    );
    const r = rand(4);
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 0.014;
      pot.add(paintFlat(new THREE.CylinderGeometry(0.0022, 0.0022, 0.11, 4), '#e8d2a0'), trs([Math.cos(a) * d, 0.08, Math.sin(a) * d], [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3]));
    }
    // a chopstick box with a few pairs showing
    const box = new Merger();
    box.add(paint(plank(0.2, 0.07, 0.075, 0.008, [1 / 0.6, 1 / 0.6]), (_x, _y, _z, out) => out.set('#9a6a3e')), trs([0, 0.035, 0]));
    for (let i = 0; i < 7; i++) box.add(paintFlat(new THREE.CylinderGeometry(0.005, 0.006, 0.215, 6).rotateZ(Math.PI / 2), i % 2 ? '#e8d2a0' : '#d8be88'), trs([0.01, 0.068 + (i % 2) * 0.006, -0.025 + i * 0.008]));
    return { tray: tray.build(), shaker, pot: pot.build(), box: box.build() };
  });
}

/** A lacquered tray of table condiments: soy, chilli oil, pepper, toothpicks and a box of chopsticks. */
export function CondimentTray({ seed }: { seed: number }) {
  const g = condimentGeometries();
  const p = propMats();
  const m = itemMats();
  const flip = variant(seed, 2) === 1 ? -1 : 1;
  return (
    <group>
      <mesh geometry={g.tray} material={m.vc} castShadow receiveShadow />
      <group position={[0, 0.022, 0]} scale={[flip, 1, 1]}>
        <group position={[-0.15, 0, 0.0]} scale={0.66}>
          <Bottle kind="soy" label={2} />
        </group>
        <group position={[-0.06, 0, 0.035]}>
          <Jar kind="chili" h={0.1} r={0.042} />
        </group>
        <mesh geometry={g.shaker} material={p.glaze} position={[0.02, 0, 0.04]} castShadow />
        <mesh geometry={g.pot} material={m.vc} position={[0.075, 0, 0.045]} castShadow />
        <mesh geometry={g.box} material={m.vc} position={[0.07, 0, -0.045]} castShadow />
      </group>
    </group>
  );
}

// ---------- lucky cat ----------

function luckyCatBody() {
  return cached('ramen-lucky-cat', () => {
    const body = ellipsoid(0, 0.13, 0, 0.118, 0.13, 0.102);
    const head = ellipsoid(0, 0.312, 0.012, 0.128, 0.106, 0.104);
    const cheeks = mirrorX(sphere(0.06, 0.286, 0.06, 0.058));
    const ears = [cone(-0.07, 0.38, 0.0, -0.098, 0.448, -0.004, 0.036, 0.006), cone(0.07, 0.38, 0.0, 0.098, 0.448, -0.004, 0.036, 0.006)];
    const haunches = mirrorX(ellipsoid(0.075, 0.055, 0.02, 0.06, 0.055, 0.085));
    const paw = ellipsoid(-0.055, 0.15, 0.095, 0.036, 0.042, 0.034);
    const feet = mirrorX(ellipsoid(0.05, 0.018, 0.09, 0.034, 0.018, 0.034));
    const tail = chain(
      [
        [0.08, 0.025, -0.085],
        [0.13, 0.035, -0.04],
        [0.15, 0.03, 0.02],
      ],
      0.024,
      0.017,
      0.01,
    );
    const sdf: SDF = (x, y, z) => {
      let d = smin(body(x, y, z), head(x, y, z), 0.04);
      d = smin(d, cheeks(x, y, z), 0.03);
      for (const e of ears) d = smin(d, e(x, y, z), 0.015);
      d = smin(d, haunches(x, y, z), 0.03);
      d = smin(d, paw(x, y, z), 0.02);
      d = smin(d, feet(x, y, z), 0.015);
      d = smin(d, tail(x, y, z), 0.015);
      return Math.max(d, -y);
    };
    return meshSDF(sdf, { min: [-0.17, -0.01, -0.14], max: [0.19, 0.47, 0.16], cell: 0.0042 });
  });
}

function luckyCatArm() {
  return cached('ramen-lucky-cat-arm', () => {
    // from the shoulder pivot (at the origin) up to the beckoning paw
    const arm = cone(0, 0, 0, 0.02, 0.12, 0.02, 0.036, 0.032);
    const paw = ellipsoid(0.022, 0.15, 0.026, 0.038, 0.042, 0.032);
    const sdf: SDF = (x, y, z) => smin(arm(x, y, z), paw(x, y, z), 0.02);
    return meshSDF(sdf, { min: [-0.05, -0.05, -0.05], max: [0.08, 0.21, 0.08], cell: 0.004 });
  });
}

const CAT_COATS = ['white', 'gold', 'black'] as const;

/** Paint the figurine for a coat: face, closed happy eyes, whiskers, ear insides, calico patches on the white one. */
function paintCat(g: THREE.BufferGeometry, coat: (typeof CAT_COATS)[number], arm: boolean) {
  const base = C(coat === 'white' ? '#f7f3ec' : coat === 'gold' ? '#e6b54e' : '#1e1a1a');
  const ink = C(coat === 'black' ? '#e8c46a' : '#2a1c16');
  const pink = C('#ef9aa0');
  const orange = C('#e0883a');
  const dark = C('#2a2220');
  return paint(g.clone(), (x, y, z, out) => {
    out.copy(base);
    if (arm) {
      if (coat === 'white' && y > 0.13) mix(out, out, pink, smoothstep(0.03, 0.01, Math.hypot(x - 0.022, y - 0.16, z - 0.055)));
      return;
    }
    if (coat === 'white') {
      // calico patches on the back and one ear
      const n = fbm3(x * 9 + 3, y * 9, z * 9);
      if (z < 0.02 && n > 0.12) out.copy(orange);
      if (z < -0.02 && n < -0.2) out.copy(dark);
      if (x < -0.06 && y > 0.37) out.copy(orange);
    }
    // ear insides
    if (y > 0.39 && z > -0.01 && Math.abs(x) > 0.06) mix(out, out, pink, 0.8);
    if (z > 0.08) {
      // closed, smiling eyes: two arcs
      for (const s of [-1, 1]) {
        const d = Math.hypot(x - s * 0.048, y - 0.318);
        if (Math.abs(d - 0.022) < 0.0042 && y > 0.318) out.copy(ink);
      }
      // the nose and a little mouth
      if (Math.hypot(x, y - 0.29) < 0.01) out.copy(pink);
      for (const s of [-1, 1]) {
        const d = Math.hypot(x - s * 0.011, y - 0.279);
        if (Math.abs(d - 0.011) < 0.0026 && y < 0.279) out.copy(ink);
      }
      // whiskers
      const ax = Math.abs(x);
      if (ax > 0.075 && ax < 0.125)
        for (let k = 0; k < 3; k++) {
          const wy = 0.288 + k * 0.011 + (ax - 0.075) * (0.25 - k * 0.25);
          if (Math.abs(y - wy) < 0.0022) out.copy(ink);
        }
    }
  });
}

/** A beckoning cat figurine with a coin and a bell: white calico, gold or black by seed. Its paw waves, slowly. */
export function LuckyCat({ seed }: { seed: number }) {
  const coat = CAT_COATS[variant(seed, CAT_COATS.length)];
  const body = useMemo(() => once(`ri:lucky-cat:${coat}`, () => paintCat(luckyCatBody(), coat, false)), [coat]);
  const arm = useMemo(() => once(`ri:lucky-arm:${coat}`, () => paintCat(luckyCatArm(), coat, true)), [coat]);
  const p = propMats();
  const m = itemMats();
  const glaze = coat === 'gold' ? mat('i:cat-gold', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.25, clearcoat: 0.6 })) : p.glaze;
  const extras = useMemo(
    () =>
      once('ri:lucky-extras', () => {
        const collar = paintFlat(new THREE.TorusGeometry(0.084, 0.014, 10, 40).rotateX(Math.PI / 2).scale(1, 1, 0.92), '#c22a1c');
        const coin = new THREE.Shape();
        coin.absellipse(0, 0, 0.045, 0.068, 0, Math.PI * 2, false, 0);
        const koban = slab(coin, 0.014, 0.004, 2, 32);
        return { collar, koban };
      }),
    [],
  );
  const shoulder = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (shoulder.current) shoulder.current.rotation.x = -0.15 + Math.sin(clock.elapsedTime * 1.3 + seed) * 0.32;
  });
  return (
    <group>
      <mesh geometry={body} material={glaze} castShadow receiveShadow />
      <group ref={shoulder} position={[0.085, 0.205, 0.05]}>
        <mesh geometry={arm} material={glaze} castShadow />
      </group>
      <mesh geometry={extras.collar} material={m.vc} position={[0, 0.222, 0.012]} />
      <mesh material={m.gold} position={[0, 0.205, 0.098]} castShadow>
        <sphereGeometry args={[0.02, 16, 12]} />
      </mesh>
      <mesh geometry={extras.koban} material={m.gold} position={[-0.035, 0.13, 0.112]} rotation={[-0.15, 0.1, 0]} castShadow />
    </group>
  );
}

// ---------- rice sack ----------

/** Burlap all round the sack (u once round it, v up it), with blue bands and a red stamp on the front. */
function sackTex() {
  return tex('rice-sack', 1024, 512, (g, w, h) => {
    g.fillStyle = '#c4a674';
    g.fillRect(0, 0, w, h);
    const r = rand(23);
    // the weave: crossing threads, each a little different
    for (let y = 0; y < h; y += 4) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,240,210' : '90,64,30'},${0.06 + r() * 0.08})`;
      g.fillRect(0, y, w, 2);
    }
    for (let x = 0; x < w; x += 4) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,240,210' : '90,64,30'},${0.06 + r() * 0.08})`;
      g.fillRect(x, 0, 2, h);
    }
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(70,50,24,${0.08 + r() * 0.12})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // two printed blue bands round the sack
    for (const y of [0.62, 0.69]) {
      g.fillStyle = 'rgba(40,64,120,0.78)';
      g.fillRect(0, h * (1 - y) - 7, w, 14);
    }
    // the stamp on the front (u = 0.5): a red ring round a ribbon of brushed marks
    const cx = w / 2;
    const cy = h * 0.58;
    g.strokeStyle = 'rgba(176,36,26,0.85)';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(cx, cy, 64, 0, Math.PI * 2);
    g.stroke();
    // an ear of rice: a bowed stalk with grains along it
    g.strokeStyle = 'rgba(176,36,26,0.85)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx - 6, cy + 46);
    g.quadraticCurveTo(cx + 4, cy - 10, cx + 28, cy - 40);
    g.stroke();
    g.fillStyle = 'rgba(176,36,26,0.85)';
    for (let k = 0; k < 7; k++) {
      const t = 0.25 + k * 0.1;
      const px = cx - 6 + (34 * t * t) + 4 * t;
      const py = cy + 46 - 86 * t;
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.ellipse(px + sgn * 9, py + 2, 7, 4, sgn * 0.7 - 0.4, 0, Math.PI * 2);
        g.fill();
      }
    }
    brushMarks(g, r, cx - 110, h * 0.12, 60, h * 0.2, 'rgba(40,30,20,0.7)', 2, true);
    // grime low down and dust on top
    const dirt = g.createLinearGradient(0, h * 0.75, 0, h);
    dirt.addColorStop(0, 'rgba(60,40,20,0)');
    dirt.addColorStop(1, 'rgba(60,40,20,0.35)');
    g.fillStyle = dirt;
    g.fillRect(0, 0, w, h);
  });
}

/** A half-full rice sack slumped on the floor, gathered at the neck and tied with twine. About 0.75 tall. */
function sackGeometries() {
  return once('ri:rice-sack', () => {
    const low = ellipsoid(0, 0.2, 0, 0.31, 0.22, 0.24);
    const mid = ellipsoid(0, 0.4, 0.0, 0.25, 0.2, 0.2);
    const neck = cone(0, 0.5, 0, 0, 0.64, 0, 0.12, 0.055);
    const ruff = cone(0, 0.64, 0, 0, 0.75, 0, 0.05, 0.11);
    const sdf: SDF = (x, y, z) => {
      let d = smin(low(x, y, z), mid(x, y, z), 0.1);
      d = smin(d, neck(x, y, z), 0.08);
      // the gathered cloth above the tie, frilled
      const a = Math.atan2(z, x);
      const fr = ruff(x, y, z) - 0.012 * Math.sin(a * 9) * smoothstep(0.66, 0.75, y);
      d = smin(d, fr, 0.025);
      // creases: radial folds pulled up toward the neck, and a soft lumpy fill
      d += 0.01 * Math.sin(a * 7 + y * 6) * smoothstep(0.2, 0.55, y);
      d += 0.008 * noise3(x * 9, y * 9, z * 9);
      return Math.max(d, -y);
    };
    const g = meshSDF(sdf, { min: [-0.36, -0.01, -0.3], max: [0.36, 0.8, 0.3], cell: 0.009, paint: (_x, y, _z, _nx, ny, _nz, out) => out.setScalar(0.8 + 0.2 * smoothstep(-0.6, 0.6, ny) - smoothstep(0.08, 0.0, y) * 0.2) });
    // UVs: once round the sack, up its height
    const p = g.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = Math.atan2(p.getX(i), p.getZ(i)) / (Math.PI * 2) + 0.5;
      uv[i * 2 + 1] = p.getY(i) / 0.8;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // the twine round the neck, its two ends hanging
    const twine = new Merger();
    twine.add(new THREE.TorusGeometry(0.072, 0.011, 8, 32).rotateX(Math.PI / 2), trs([0, 0.625, 0]));
    twine.add(new THREE.TorusGeometry(0.07, 0.01, 8, 32).rotateX(Math.PI / 2 + 0.15), trs([0, 0.6, 0]));
    twine.add(tubeThrough([V(0.06, 0.62, 0.04), V(0.1, 0.55, 0.09), V(0.11, 0.45, 0.12)], () => 0.008, 10, 5).geometry);
    twine.add(tubeThrough([V(0.05, 0.62, 0.05), V(0.06, 0.53, 0.11), V(0.03, 0.44, 0.14)], () => 0.008, 10, 5).geometry);
    return { sack: g, twine: paintFlat(twine.build(), '#7a5a34') };
  });
}

/** Rice sacks: one standing, or two with a second slumped against it. By seed. */
export function RiceSack({ seed }: { seed: number }) {
  const g = sackGeometries();
  const m = itemMats();
  const burlap = mat('i:burlap', () => new THREE.MeshStandardMaterial({ map: sackTex(), vertexColors: true, roughness: 0.95, bumpMap: bumpTex('burlap', { scale: 30, contrast: 0.6 }), bumpScale: 0.5 }));
  const two = variant(seed, 2) === 1;
  return (
    <group>
      <group rotation={[0, 0.2, 0]}>
        <mesh geometry={g.sack} material={burlap} castShadow receiveShadow />
        <mesh geometry={g.twine} material={m.vc} castShadow />
      </group>
      {two && (
        <group position={[0.5, 0, 0.05]} rotation={[0, -0.6, 0.28]} scale={0.92}>
          <mesh geometry={g.sack} material={burlap} castShadow receiveShadow />
          <mesh geometry={g.twine} material={m.vc} castShadow />
        </group>
      )}
    </group>
  );
}

// ---------- vegetable crate ----------

const CRATE = { w: 0.72, h: 0.32, d: 0.46 };

function crateGeometry() {
  return once('ri:crate', () => {
    const m = new Merger();
    const r = rand(12);
    const tint = () => new THREE.Color().setScalar(0.82 + r() * 0.3);
    const { w, h, d } = CRATE;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) m.add(plank(0.045, h, 0.045, 0.008, [1 / 0.8, 1 / 0.8], 1, [r(), r()], true), trs([(sx * (w - 0.045)) / 2, h / 2, (sz * (d - 0.045)) / 2]), tint());
    for (let k = 0; k < 3; k++) {
      const y = 0.05 + k * 0.105;
      for (const sz of [-1, 1]) m.add(plank(w, 0.075, 0.018, 0.006, [1 / 0.8, 1 / 0.8], 1, [r(), r()]), trs([0, y, (sz * (d - 0.01)) / 2]), tint());
      for (const sx of [-1, 1]) {
        const g = plank(0.018, 0.075, d - 0.02, 0.006, [1 / 0.8, 1 / 0.8], 1, [r(), r()]);
        // a hand hole in the top slat at each end
        if (k === 2) paint(g, (_x, yy, zz, out) => out.setScalar(Math.hypot(zz / 0.08, yy / 0.022) < 1 ? 0.15 : 1));
        m.add(g, trs([(sx * (w - 0.01)) / 2, y, 0]), tint());
      }
    }
    for (let k = 0; k < 4; k++) m.add(plank(w - 0.02, 0.016, d / 4 - 0.01, 0.005, [1 / 0.8, 1 / 0.8], 1, [r(), r()]), trs([0, 0.012, -d / 2 + (k + 0.5) * (d / 4)]), tint());
    return m.build();
  });
}

/** A cabbage: a pale heart wrapped in overlapping leaves, each with its own pale midrib and veins. */
function cabbage(r: () => number) {
  const m = new Merger();
  const core = new THREE.SphereGeometry(0.104, 28, 20);
  paint(core, (x, y, z, out) => out.set('#dfe9b6').multiplyScalar(0.92 + 0.1 * noise3(x * 30, y * 30, z * 30)));
  m.add(core, trs([0, 0, 0], [0, 0, 0], [1, 0.9, 1]));
  const inner = C('#cfe0a2');
  const outer = C('#86b064');
  const rib = C('#f0f4dc');
  for (let k = 0; k < 6; k++) {
    const rad = 0.107 + k * 0.0045;
    const phiLen = Math.PI * (1.05 + r() * 0.35);
    const thStart = 0.2 + r() * 0.2;
    const thLen = Math.PI * (0.5 + r() * 0.22);
    const shell = new THREE.SphereGeometry(rad, 30, 16, 0, phiLen, thStart, thLen);
    const mid = phiLen / 2;
    paint(shell, (x, y, z, out) => {
      // phi in three's sphere: measured from -x toward... use the local angle about y
      let a = Math.atan2(-z, -x);
      if (a < 0) a += Math.PI * 2;
      const d = a - mid;
      mix(out, inner, outer, k / 5);
      // the midrib, broad at the base of the leaf (low theta = top here, so use y), and side veins angling off it
      const ribW = 0.06 + 0.06 * smoothstep(0.08, -0.08, y);
      mix(out, out, rib, smoothstep(ribW, ribW * 0.4, Math.abs(d)) * 0.85);
      const vein = Math.abs(Math.sin(d * 4 - y * 14));
      mix(out, out, rib, smoothstep(0.97, 1, vein) * 0.18);
      out.multiplyScalar(0.9 + 0.12 * noise3(x * 25, y * 25, z * 25));
    });
    m.add(shell, trs([0, 0, 0], [(r() - 0.5) * 1.6, r() * 6.28, (r() - 0.5) * 1.6], [1, 0.9, 1]));
  }
  return m.build();
}

function vegGeometry(v: number) {
  return once(`ri:veg:${v}`, () => {
    const r = rand(v * 31 + 7);
    const m = new Merger();
    const top = CRATE.h - 0.05;
    if (v === 0) {
      m.add(cabbage(r), trs([-0.17, top + 0.06, -0.06], [0.3, 0.4, 0.1]));
      m.add(cabbage(r), trs([0.13, top + 0.05, 0.07], [-0.2, 1.4, 0.2]));
    }
    // onions
    const onion = smoothLathe(
      [
        [0, -0.055],
        [0.03, -0.052],
        [0.058, -0.02],
        [0.064, 0.01],
        [0.05, 0.04],
        [0.02, 0.064],
        [0.006, 0.085],
        [0, 0.09],
      ],
      24,
      24,
    );
    paint(onion, (x, y, z, out) => {
      const a = Math.atan2(z, x);
      out.set('#c08a46').multiplyScalar(0.8 + 0.3 * (0.5 + 0.5 * Math.sin(a * 14 + y * 4)));
      if (y > 0.06) out.set('#8a5a2a');
    });
    const onions = v === 0 ? 3 : 6;
    for (let i = 0; i < onions; i++) m.add(onion, trs([0.2 - (i % 3) * 0.07 + (v === 0 ? 0.04 : -0.1), top + 0.04 + Math.floor(i / 3) * 0.03, -0.12 + (i % 2) * 0.09 + Math.floor(i / 3) * 0.1], [r() - 0.5, r() * 3, r() - 0.5]));
    // carrots with their feathery tops
    const carrots = v === 0 ? 2 : 5;
    for (let i = 0; i < carrots; i++) {
      const x0 = -0.25 + i * 0.07;
      const z0 = 0.12 - (i % 2) * 0.05;
      const pts = [V(x0, top + 0.03, z0), V(x0 + 0.06, top + 0.035, z0 + 0.04), V(x0 + 0.17, top + 0.03, z0 + 0.06)];
      m.add(
        tubeThrough(pts, (t) => 0.026 * (1 - t) + 0.004, 16, 10, (t, a, out) => {
          out.set('#e0721e').multiplyScalar(0.85 + 0.2 * Math.abs(Math.sin(t * 40 + a)));
        }).geometry,
      );
      for (let k = 0; k < 3; k++) m.add(tubeThrough([V(x0, top + 0.03, z0), V(x0 - 0.06, top + 0.06 + k * 0.01, z0 - 0.02 + k * 0.02), V(x0 - 0.12, top + 0.05 + k * 0.02, z0 - 0.04 + k * 0.04)], () => 0.005, 8, 4, (_t, _a, out) => out.set('#4a8a32')).geometry);
    }
    // long leeks lying across, sticking out over the end
    const leeks = v === 0 ? 3 : 4;
    for (let i = 0; i < leeks; i++) {
      const z = -0.16 + i * 0.05;
      const y = top + 0.12 + i * 0.012;
      const pts = [V(-0.42, y - 0.03, z + 0.02), V(-0.1, y, z), V(0.2, y + 0.01, z - 0.02), V(0.52, y - 0.05, z - 0.05)];
      m.add(
        tubeThrough(pts, (t) => 0.019 - t * 0.004, 40, 10, (t, _a, out) => {
          mix(out, C('#f0eedc'), C('#3e7a2e'), smoothstep(0.38, 0.62, t));
          if (t > 0.6) out.multiplyScalar(0.85 + 0.15 * Math.sin(t * 60));
        }).geometry,
      );
      // root hairs at the white end
      for (let k = 0; k < 5; k++) m.add(tubeThrough([V(-0.42, y - 0.03, z + 0.02), V(-0.46, y - 0.05 + k * 0.008, z + 0.02 - 0.02 + k * 0.01)], () => 0.002, 2, 3, (_t, _a, out) => out.set('#d8ccaa')).geometry);
    }
    return m.build();
  });
}

/** A slatted wooden crate of vegetables: cabbages, onions, carrots and long leeks, by seed. */
export function VegCrate({ seed }: { seed: number }) {
  const m = itemMats();
  const crate = crateGeometry();
  const veg = vegGeometry(variant(seed, 2));
  return (
    <group>
      <mesh geometry={crate} material={m.pale} castShadow receiveShadow />
      <mesh geometry={veg} material={m.vc} castShadow receiveShadow />
      {/* the inside's shadowed floor of produce under the top layer */}
      <mesh position={[0, CRATE.h - 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.vc}>
        <planeGeometry args={[CRATE.w - 0.05, CRATE.d - 0.05]} />
      </mesh>
    </group>
  );
}

// ---------- bar stool ----------

const STOOL_TINTS = ['#a8261e', '#2c4a7a', '#2a2826', '#3f6a3a', '#b8862a'];

function recolourCushion(src: THREE.BufferGeometry, hex: string) {
  const g = src.clone();
  const c = g.attributes.color;
  const target = C(hex);
  const ref = C('#a8261e');
  const refL = (ref.r + ref.g + ref.b) / 3;
  for (let i = 0; i < c.count; i++) {
    const l = (c.getX(i) + c.getY(i) + c.getZ(i)) / 3 / refL;
    c.setXYZ(i, target.r * l, target.g * l, target.b * l);
  }
  return g;
}

/** The same diner stool as at the counter, its cushion red, blue, black, green or mustard by seed. */
export function BarStool({ seed }: { seed: number }) {
  const geo = stoolGeometries();
  const tint = STOOL_TINTS[variant(seed, STOOL_TINTS.length)];
  const cushion = useMemo(() => once(`ri:stool:${tint}`, () => recolourCushion(geo.cushion, tint)), [geo, tint]);
  const vinyl = mat('c:vinyl', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff9a8a') }));
  const p = propMats();
  const m = itemMats();
  return (
    <group rotation={[0, seed, 0]}>
      <mesh geometry={geo.base} material={m.iron} castShadow receiveShadow />
      <mesh geometry={geo.chrome} material={p.chrome} castShadow />
      <mesh geometry={cushion} material={vinyl} castShadow receiveShadow />
    </group>
  );
}

// ---------- pothos ----------

/** A heart-shaped leaf as a grid that follows its outline (stalk at the origin, growing along +y, face +z). */
function heartLeaf(len: number, wid: number, paintFn: (u: number, v: number, out: THREE.Color) => void) {
  const nu = 3;
  const nv = 8;
  const cols = nu * 2 + 1;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Color();
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    // wide lobes near the stalk, tapering to a drip tip
    const hw = (wid / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + v * 0.88)), 0.75) * (1 + 0.25 * Math.pow(1 - v, 2));
    for (let i = 0; i < cols; i++) {
      const u = (i - nu) / nu;
      const notch = (1 - Math.abs(u)) * 0.12 * Math.pow(1 - v, 6) * len;
      const x = u * hw;
      const y = v * len - notch * (v < 0.2 ? 1 : 0);
      const z = 0.25 * hw * u * u + 0.08 * len * v * v;
      pos.push(x, y, z);
      tmp.setRGB(1, 1, 1);
      paintFn(u, v, tmp);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const POT_GLAZES = ['#5f8a74', '#2a4a7a', '#8a4a2a', '#d8cdb4'];

function pothosGeometry(v: number) {
  return once(`ri:pothos:${v}`, () => {
    const r = rand(v * 13 + 3);
    const leaves = new Merger();
    const vines = new Merger();
    const n = 50;
    const R = 0.17;
    const H = 0.24;
    const pot = smoothLathe(
      [
        [0, 0],
        [R * 0.7, 0],
        [R * 0.74, 0.01],
        [R * 0.86, H * 0.4],
        [R, H * 0.9],
        [R + 0.012, H],
        [R - 0.01, H + 0.004],
        [R - 0.02, H * 0.85],
        [0, H * 0.8],
      ],
      n,
      48,
    );
    const glaze = C(POT_GLAZES[v % POT_GLAZES.length]);
    paintLathe(pot, n, (x, y, z, along, out) => {
      out.copy(glaze);
      // the glaze pools darker low down and breaks paler on the rim; bare clay at the foot
      mix(out, out, glaze.clone().multiplyScalar(0.6), smoothstep(H * 0.5, 0.02, y) * 0.5);
      mix(out, out, C('#efe6d0'), smoothstep(H * 0.93, H, y) * 0.5);
      if (y < 0.03 && along < 0.4) out.set('#9a6a4a');
      out.multiplyScalar(0.92 + 0.1 * noise3(x * 40, y * 40, z * 40));
    });
    const soil = paint(new THREE.CircleGeometry(R - 0.02, 24).rotateX(-Math.PI / 2).translate(0, H * 0.86, 0), (x, _y, z, out) => out.set('#2a1c12').multiplyScalar(0.8 + 0.4 * noise3(x * 60, 0, z * 60)));
    const leafPaint = (u: number, vv: number, out: THREE.Color) => {
      out.set('#2f6a2a');
      mix(out, out, C('#4f8a36'), smoothstep(0.1, 0.9, vv) * 0.5);
      // golden variegation streaking out from the midrib
      const streak = noise3(u * 3 + r() * 0.001, vv * 6, v * 3);
      mix(out, out, C('#d8c460'), smoothstep(0.25, 0.5, streak) * 0.65);
      if (Math.abs(u) < 0.12) mix(out, out, C('#a8c870'), 0.4);
    };
    const leafGeo = heartLeaf(0.13, 0.11, leafPaint);
    const leafGeoB = heartLeaf(0.1, 0.085, leafPaint);
    const up = new THREE.Vector3(0, 1, 0);
    const put = (p: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3, s: number, big: boolean) => {
      const Y = dir.clone().normalize();
      const X = new THREE.Vector3().crossVectors(Y, face).normalize();
      if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
      const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
      const mtx = new THREE.Matrix4().makeBasis(X, Y, Z).scale(new THREE.Vector3(s, s, s)).setPosition(p);
      leaves.add(big ? leafGeo : leafGeoB, mtx);
    };
    // a crown of leaves on short stalks
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + r() * 0.4;
      const base = V(Math.cos(a) * 0.04, H * 0.86, Math.sin(a) * 0.04);
      const tip = V(Math.cos(a) * (0.11 + r() * 0.05), H * 0.86 + 0.08 + r() * 0.1, Math.sin(a) * (0.11 + r() * 0.05));
      vines.add(tubeThrough([base, base.clone().lerp(tip, 0.5).add(V(0, 0.03, 0)), tip], () => 0.005, 6, 4).geometry);
      const out = V(Math.cos(a), 0.6, Math.sin(a));
      put(tip, out.clone().add(V(0, 0.4, 0)), V(Math.cos(a), 1.2, Math.sin(a)), 0.9 + r() * 0.4, true);
    }
    // trailing vines over the rim, hanging down the front and sides
    const trails = 5;
    for (let k = 0; k < trails; k++) {
      const a = -0.6 + (k / (trails - 1)) * 2.6 + (r() - 0.5) * 0.3;
      const c = Math.cos(a + Math.PI / 2);
      const s = Math.sin(a + Math.PI / 2);
      const drop = 0.2 + r() * 0.3;
      const pts = [V(c * 0.06, H * 0.88, s * 0.06), V(c * (R + 0.04), H + 0.04, s * (R + 0.04)), V(c * (R + 0.09), H - drop * 0.4, s * (R + 0.09)), V(c * (R + 0.12) + (r() - 0.5) * 0.06, H - drop, s * (R + 0.12))];
      const curve = new THREE.CatmullRomCurve3(pts);
      vines.add(tubeThrough(pts, () => 0.005, 24, 4).geometry);
      const leafCount = 6;
      for (let j = 1; j <= leafCount; j++) {
        const t = j / (leafCount + 0.5);
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        const side = j % 2 ? 1 : -1;
        const outward = V(c, 0.2, s);
        const dir = new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(side).add(V(0, -0.5, 0)).add(outward.clone().multiplyScalar(0.6));
        put(p, dir, outward, 0.65 + (1 - t) * 0.35, j < 3);
      }
    }
    const vinesG = paint(vines.build(), (_x, _y, _z, out) => out.set('#4a7a2e'));
    return { pot, soil, leaves: leaves.build(), vines: vinesG };
  });
}

/** A golden pothos in a glazed pot, its vines trailing over the rim. Glaze and growth by seed. */
export function Pothos({ seed }: { seed: number }) {
  const g = pothosGeometry(variant(seed, POT_GLAZES.length));
  const p = propMats();
  const m = itemMats();
  return (
    <group rotation={[0, (seed % 7) * 0.4, 0]}>
      <mesh geometry={g.pot} material={p.glaze} castShadow receiveShadow />
      <mesh geometry={g.soil} material={m.vc} />
      <mesh geometry={g.vines} material={m.vc} castShadow />
      <mesh geometry={g.leaves} material={m.leaf} castShadow receiveShadow />
    </group>
  );
}

// ---------- radio ----------

function dialTex() {
  return tex('radio-dial', 256, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h, 10, w / 2, h, h);
    grad.addColorStop(0, '#ffd9a0');
    grad.addColorStop(1, '#d88a3a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(60,30,10,0.85)';
    g.lineCap = 'round';
    for (let i = 0; i <= 30; i++) {
      const a = Math.PI + (i / 30) * Math.PI;
      const big = i % 5 === 0;
      g.lineWidth = big ? 3 : 1.5;
      g.beginPath();
      g.moveTo(w / 2 + Math.cos(a) * (h - 10), h + Math.sin(a) * (h - 10));
      g.lineTo(w / 2 + Math.cos(a) * (h - (big ? 30 : 22)), h + Math.sin(a) * (h - (big ? 30 : 22)));
      g.stroke();
    }
    g.lineWidth = 2;
    g.beginPath();
    g.arc(w / 2, h, h - 40, Math.PI, Math.PI * 2);
    g.stroke();
    // the needle
    g.strokeStyle = '#b01a10';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w / 2, h);
    g.lineTo(w / 2 + Math.cos(Math.PI * 1.36) * (h - 8), h + Math.sin(Math.PI * 1.36) * (h - 8));
    g.stroke();
  });
}

function grilleTex() {
  return tex('radio-grille', 256, 256, (g, w, h) => {
    g.fillStyle = '#6a4a2a';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = 'rgba(255,220,160,0.08)';
      g.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 3) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, 0, 1, h);
    }
  });
}

const RADIO_WOODS = [
  ['#8a4a26', '#2a1206'],
  ['#a86a3a', '#3e1e0a'],
  ['#2a2420', '#0a0806'],
];

function radioGeometries() {
  return once('ri:radio', () => {
    const W = 0.42;
    const H = 0.22;
    const D = 0.2;
    const arch = new THREE.Shape();
    arch.moveTo(-W / 2, 0);
    arch.lineTo(W / 2, 0);
    arch.lineTo(W / 2, H);
    arch.absarc(0, H, W / 2, 0, Math.PI, false);
    arch.lineTo(-W / 2, 0);
    const body = boxUV(slab(arch, D, 0.02, 3, 32), [1 / 0.5, 1 / 0.5]);
    // the grille opening: a smaller arch, recessed
    const inner = new THREE.Shape();
    const iw = W - 0.09;
    inner.moveTo(-iw / 2, 0.13);
    inner.lineTo(iw / 2, 0.13);
    inner.lineTo(iw / 2, H);
    inner.absarc(0, H, iw / 2, 0, Math.PI, false);
    inner.lineTo(-iw / 2, 0.13);
    const grille = new THREE.ShapeGeometry(inner, 24);
    const gp = grille.attributes.position;
    const guv = grille.attributes.uv;
    for (let i = 0; i < gp.count; i++) guv.setXY(i, gp.getX(i) * 3, gp.getY(i) * 3);
    // fretwork: three slender upright bars and a cross piece over the cloth
    const fret = new Merger();
    for (const x of [-0.09, 0, 0.09]) fret.add(plank(0.018, x === 0 ? 0.3 : 0.26, 0.02, 0.006, [1 / 0.5, 1 / 0.5], 1, [0, 0], true), trs([x, 0.13 + (x === 0 ? 0.15 : 0.13), 0]));
    fret.add(plank(iw, 0.018, 0.02, 0.006), trs([0, 0.2, 0]));
    // two knobs and a dial bezel
    const n = 20;
    const knob = smoothLathe(
      [
        [0, 0],
        [0.03, 0],
        [0.034, 0.01],
        [0.032, 0.028],
        [0.022, 0.034],
        [0, 0.035],
      ],
      n,
      24,
    ).rotateX(Math.PI / 2);
    const bezel = new THREE.TorusGeometry(0.075, 0.007, 8, 32, Math.PI);
    return { body, grille, fret: fret.build(), knob, bezel, D };
  });
}

/** A small tabletop valve radio in a wooden arch case: cloth grille, glowing dial, two knobs. Wood by seed. */
export function Radio({ seed }: { seed: number }) {
  const v = variant(seed, RADIO_WOODS.length);
  const g = radioGeometries();
  const [light, dark] = RADIO_WOODS[v];
  const wood = mat(`i:radio-wood:${v}`, () => new THREE.MeshPhysicalMaterial({ map: woodTex(`radio-${v}`, { w: 512, h: 256, light, dark, planks: 1, rings: 10, seed: 70 + v, joints: false, seams: 0 }), roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
  const cloth = mat('i:radio-cloth', () => new THREE.MeshStandardMaterial({ map: grilleTex(), roughness: 0.95 }));
  const dial = mat('i:radio-dial', () => new THREE.MeshStandardMaterial({ map: dialTex(), emissiveMap: dialTex(), emissive: new THREE.Color('#ffb060'), emissiveIntensity: 0.9, roughness: 0.4 }));
  const bakelite = mat('i:bakelite', () => new THREE.MeshPhysicalMaterial({ color: '#3a2014', roughness: 0.3, clearcoat: 0.8 }));
  const p = propMats();
  const front = g.D / 2;
  return (
    <group>
      <group position={[0, 0.02, 0]}>
        <mesh geometry={g.body} material={wood} castShadow receiveShadow />
        <mesh geometry={g.grille} material={cloth} position={[0, 0, front + 0.002]} />
        <mesh geometry={g.fret} material={wood} position={[0, 0, front + 0.012]} castShadow />
        <mesh material={dial} position={[0, 0.045, front + 0.004]}>
          <circleGeometry args={[0.072, 32, 0, Math.PI]} />
        </mesh>
        <mesh geometry={g.bezel} material={p.brass} position={[0, 0.045, front + 0.006]} />
        <mesh geometry={g.knob} material={bakelite} position={[-0.15, 0.06, front]} castShadow />
        <mesh geometry={g.knob} material={bakelite} position={[0.15, 0.06, front]} castShadow />
      </group>
      {/* two little feet */}
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} material={p.iron} position={[x, 0.01, 0]}>
          <boxGeometry args={[0.05, 0.02, 0.16]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- wall clock ----------

function clockFaceTex() {
  return tex('ramen-clock-face', 512, 512, (g, w, h) => {
    const grad = g.createRadialGradient(w * 0.45, h * 0.4, 20, w / 2, h / 2, w / 2);
    grad.addColorStop(0, '#f6eedc');
    grad.addColorStop(1, '#e2d2b0');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    // minute ticks and bold hour bars, no numerals
    for (let i = 0; i < 60; i++) {
      const big = i % 5 === 0;
      g.save();
      g.rotate((i / 60) * Math.PI * 2);
      g.fillStyle = big ? '#2a2018' : '#6a5a48';
      if (big) g.fillRect(-7, -w * 0.46, 14, i % 15 === 0 ? 56 : 40);
      else g.fillRect(-1.6, -w * 0.46, 3.2, 16);
      g.restore();
    }
    g.strokeStyle = 'rgba(60,40,24,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, w * 0.47, 0, Math.PI * 2);
    g.stroke();
    // age: a faint yellowing and a few foxing spots
    const r = rand(3);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(140,100,40,${0.03 + r() * 0.05})`;
      g.beginPath();
      g.arc((r() - 0.5) * w, (r() - 0.5) * h, 2 + r() * 8, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function clockGeometries() {
  return once('ri:clock', () => {
    const oct = new THREE.Shape();
    const R = 0.33;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      if (i === 0) oct.moveTo(Math.cos(a) * R, Math.sin(a) * R);
      else oct.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    }
    oct.closePath();
    const frame = boxUV(slab(oct, 0.07, 0.018, 3, 8).translate(0, 0, 0.035), [1 / 0.5, 1 / 0.5]);
    // the drop case below, with a little round window onto the pendulum
    const drop = new THREE.Shape();
    drop.moveTo(-0.13, 0);
    drop.lineTo(0.13, 0);
    drop.lineTo(0.13, -0.24);
    drop.quadraticCurveTo(0.13, -0.32, 0, -0.34);
    drop.quadraticCurveTo(-0.13, -0.32, -0.13, -0.24);
    drop.lineTo(-0.13, 0);
    const hole = new THREE.Path();
    hole.absarc(0, -0.17, 0.065, 0, Math.PI * 2, true);
    drop.holes.push(hole);
    const dropG = boxUV(slab(drop, 0.06, 0.012, 2, 16).translate(0, -0.27, 0.03), [1 / 0.5, 1 / 0.5]);
    const bezel = new THREE.TorusGeometry(0.255, 0.014, 10, 64);
    const dome = smoothLathe(
      [
        [0.25, 0],
        [0.15, 0.022],
        [0, 0.03],
      ],
      12,
      48,
    ).rotateX(Math.PI / 2);
    // spade hands, built pointing up from the centre
    const hand = (len: number, wd: number) => {
      const s = new THREE.Shape();
      s.moveTo(-wd * 0.35, -len * 0.16);
      s.lineTo(wd * 0.35, -len * 0.16);
      s.lineTo(wd * 0.3, len * 0.68);
      s.quadraticCurveTo(wd * 1.1, len * 0.78, 0, len);
      s.quadraticCurveTo(-wd * 1.1, len * 0.78, -wd * 0.3, len * 0.68);
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false });
    };
    return { frame, drop: dropG, bezel, dome, hour: hand(0.13, 0.022), minute: hand(0.2, 0.017), second: new THREE.BoxGeometry(0.004, 0.22, 0.002).translate(0, 0.07, 0) };
  });
}

const CLOCK_WOODS = [
  ['#7a4a26', '#2a1206'],
  ['#3a2414', '#0c0603'],
  ['#a87a46', '#4a2a12'],
];

/** A schoolhouse wall clock: an octagonal case, a plain dial without numerals, real time, a pendulum swinging in the drop case. */
export function SchoolClock({ seed }: { seed: number }) {
  const v = variant(seed, CLOCK_WOODS.length);
  const g = clockGeometries();
  const [light, dark] = CLOCK_WOODS[v];
  const wood = mat(`i:clock-wood:${v}`, () => new THREE.MeshPhysicalMaterial({ map: woodTex(`clock-${v}`, { w: 512, h: 256, light, dark, planks: 1, rings: 12, seed: 80 + v, joints: false, seams: 0 }), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  const face = mat('i:clock-face', () => new THREE.MeshStandardMaterial({ map: clockFaceTex(), roughness: 0.6 }));
  const ink = mat('i:clock-ink', () => new THREE.MeshStandardMaterial({ color: '#1c1612', roughness: 0.5 }));
  const clockGlass = mat('i:clock-glass', () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, roughness: 0.18, metalness: 0, depthWrite: false }));
  const p = propMats();
  const hour = useRef<THREE.Mesh>(null);
  const minute = useRef<THREE.Mesh>(null);
  const second = useRef<THREE.Mesh>(null);
  const pend = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const mm = d.getMinutes() + s / 60;
    const hh = (d.getHours() % 12) + mm / 60;
    if (second.current) second.current.rotation.z = -(s / 60) * Math.PI * 2;
    if (minute.current) minute.current.rotation.z = -(mm / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(hh / 12) * Math.PI * 2;
    if (pend.current) pend.current.rotation.z = Math.sin(clock.elapsedTime * Math.PI) * 0.12;
  });
  return (
    <group scale={1.5}>
      <mesh geometry={g.frame} material={wood} castShadow receiveShadow />
      <mesh geometry={g.drop} material={wood} castShadow receiveShadow />
      <mesh material={face} position={[0, 0, 0.072]}>
        <circleGeometry args={[0.245, 64]} />
      </mesh>
      <mesh geometry={g.bezel} material={p.brass} position={[0, 0, 0.074]} />
      <mesh ref={hour} geometry={g.hour} material={ink} position={[0, 0, 0.078]} />
      <mesh ref={minute} geometry={g.minute} material={ink} position={[0, 0, 0.083]} />
      <mesh ref={second} geometry={g.second} material={p.brass} position={[0, 0, 0.088]} />
      <mesh material={p.brass} position={[0, 0, 0.09]}>
        <sphereGeometry args={[0.012, 12, 8]} />
      </mesh>
      <mesh geometry={g.dome} material={clockGlass} position={[0, 0, 0.074]} renderOrder={2} />
      {/* the pendulum, seen through the window in the drop case */}
      <mesh material={wood} position={[0, -0.44, 0.012]}>
        <circleGeometry args={[0.07, 24]} />
      </mesh>
      <group ref={pend} position={[0, -0.33, 0.03]}>
        <mesh material={p.brass} position={[0, -0.06, 0]}>
          <boxGeometry args={[0.008, 0.12, 0.004]} />
        </mesh>
        <mesh material={p.brass} position={[0, -0.13, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.008, 24]} />
        </mesh>
      </group>
      <mesh material={p.glass} position={[0, -0.44, 0.062]} renderOrder={2}>
        <circleGeometry args={[0.066, 24]} />
      </mesh>
    </group>
  );
}

// ---------- framed print ----------

const PRINTS = ['wave', 'mountain', 'koi', 'bowl'] as const;

function paperGround(g: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string, seed: number) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const r = rand(seed);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,250,235' : '120,90,50'},${0.03 + r() * 0.04})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
  }
}

function printTex(kind: (typeof PRINTS)[number]) {
  return tex(`ramen-print:${kind}`, 512, 704, (g, w, h) => {
    const r = rand(kind.length * 17);
    if (kind === 'wave') {
      paperGround(g, w, h, '#e8dcc0', '#d8c8a4', 3);
      // a distant snowy peak under the curl
      g.fillStyle = '#3c5a7a';
      g.beginPath();
      g.moveTo(w * 0.55, h * 0.72);
      g.lineTo(w * 0.68, h * 0.6);
      g.lineTo(w * 0.81, h * 0.72);
      g.fill();
      g.fillStyle = '#f2ead8';
      g.beginPath();
      g.moveTo(w * 0.645, h * 0.625);
      g.lineTo(w * 0.68, h * 0.6);
      g.lineTo(w * 0.715, h * 0.625);
      g.fill();
      // the swell: overlapping bands of blue rising into a hooked crest
      const blues = ['#1c3a64', '#2c5486', '#4a78a8'];
      for (let k = 0; k < 3; k++) {
        g.fillStyle = blues[k];
        g.beginPath();
        g.moveTo(0, h);
        g.lineTo(0, h * (0.62 + k * 0.08));
        g.bezierCurveTo(w * 0.15, h * (0.38 + k * 0.08), w * 0.42, h * (0.2 + k * 0.1), w * 0.5, h * (0.36 + k * 0.08));
        g.bezierCurveTo(w * 0.42, h * (0.4 + k * 0.08), w * 0.42, h * (0.55 + k * 0.06), w * 0.62, h * (0.66 + k * 0.05));
        g.bezierCurveTo(w * 0.8, h * (0.76 + k * 0.03), w, h * (0.72 + k * 0.05), w, h * (0.78 + k * 0.04));
        g.lineTo(w, h);
        g.fill();
      }
      // white foam fingers along the crest
      g.fillStyle = '#f4efe2';
      for (let i = 0; i < 18; i++) {
        const t = i / 18;
        const x = w * (0.08 + t * 0.42);
        const y = h * (0.6 - Math.sin(t * Math.PI * 0.95) * 0.32);
        g.beginPath();
        g.arc(x, y, 6 + r() * 6, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(x + 8, y + 10, 3 + r() * 4, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(240,235,220,0.7)';
      g.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        const y = h * (0.78 + i * 0.016);
        g.moveTo(0, y);
        for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 4);
        g.stroke();
      }
    } else if (kind === 'mountain') {
      paperGround(g, w, h, '#e8b88a', '#f0dcb8', 5);
      g.fillStyle = '#c8402a';
      g.beginPath();
      g.arc(w * 0.72, h * 0.22, w * 0.11, 0, Math.PI * 2);
      g.fill();
      // banded clouds
      g.fillStyle = 'rgba(245,236,214,0.9)';
      for (const [y, x0, x1] of [
        [0.34, 0.05, 0.55],
        [0.4, 0.35, 0.95],
        [0.6, 0.0, 0.4],
      ] as [number, number, number][]) {
        g.beginPath();
        g.ellipse(w * (x0 + x1) * 0.5, h * y, w * (x1 - x0) * 0.5, h * 0.018, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#4a5a74';
      g.beginPath();
      g.moveTo(w * 0.02, h * 0.82);
      g.quadraticCurveTo(w * 0.35, h * 0.62, w * 0.47, h * 0.36);
      g.lineTo(w * 0.53, h * 0.36);
      g.quadraticCurveTo(w * 0.65, h * 0.62, w * 0.98, h * 0.82);
      g.fill();
      g.fillStyle = '#f4efe4';
      g.beginPath();
      g.moveTo(w * 0.41, h * 0.45);
      g.lineTo(w * 0.47, h * 0.36);
      g.lineTo(w * 0.53, h * 0.36);
      g.lineTo(w * 0.59, h * 0.45);
      for (let x = 0.59; x > 0.41; x -= 0.03) g.lineTo(w * x, h * (0.45 + (Math.round(x * 100) % 2 ? 0.025 : 0)));
      g.fill();
      // pines in the foreground
      g.fillStyle = '#1e3a2a';
      for (let i = 0; i < 9; i++) {
        const x = w * (0.04 + i * 0.12) + r() * 10;
        const y = h * (0.86 + r() * 0.04);
        g.beginPath();
        g.moveTo(x, y - 70);
        g.lineTo(x + 26, y);
        g.lineTo(x - 26, y);
        g.fill();
      }
      g.fillStyle = '#2c4a34';
      g.fillRect(0, h * 0.9, w, h * 0.1);
    } else if (kind === 'koi') {
      paperGround(g, w, h, '#1e3a3e', '#13282c', 7);
      g.strokeStyle = 'rgba(160,200,200,0.25)';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.ellipse(w * (0.2 + r() * 0.6), h * (0.2 + r() * 0.6), 30 + i * 12, 12 + i * 5, 0, 0, Math.PI * 2);
        g.stroke();
      }
      // lily pads
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#3e6a3a' : '#4e7a42';
        g.beginPath();
        const x = w * (0.1 + r() * 0.8);
        const y = h * (0.1 + r() * 0.8);
        g.arc(x, y, 30 + r() * 20, 0.3, Math.PI * 2);
        g.lineTo(x, y);
        g.fill();
      }
      const fish = (cx: number, cy: number, a: number, body: string, patch: string) => {
        g.save();
        g.translate(cx, cy);
        g.rotate(a);
        g.fillStyle = body;
        g.beginPath();
        g.ellipse(0, 0, 70, 22, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(-60, 0);
        g.lineTo(-110, -26);
        g.lineTo(-100, 0);
        g.lineTo(-110, 26);
        g.fill();
        g.fillStyle = patch;
        g.beginPath();
        g.ellipse(10, -4, 30, 13, 0.3, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(-30, 6, 16, 9, -0.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#101010';
        g.beginPath();
        g.arc(52, -8, 3.5, 0, Math.PI * 2);
        g.fill();
        g.restore();
      };
      fish(w * 0.42, h * 0.4, 0.5, '#f4eee2', '#e2602a');
      fish(w * 0.58, h * 0.64, 0.5 + Math.PI, '#e8702a', '#f6f0e6');
    } else {
      paperGround(g, w, h, '#efe2c4', '#e2d0aa', 9);
      // a bowl of noodles seen from the side, steam rising
      const cx = w / 2;
      const cy = h * 0.62;
      g.fillStyle = '#1e1816';
      g.beginPath();
      g.moveTo(cx - 170, cy);
      g.quadraticCurveTo(cx - 150, cy + 150, cx, cy + 160);
      g.quadraticCurveTo(cx + 150, cy + 150, cx + 170, cy);
      g.fill();
      g.fillStyle = '#b8261c';
      g.fillRect(cx - 168, cy + 4, 336, 16);
      g.fillStyle = '#e8b45a';
      g.beginPath();
      g.ellipse(cx, cy, 170, 34, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f2d890';
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.ellipse(cx - 60 + i * 16, cy - 4, 40, 6, 0.4, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#fbf4e4';
      g.beginPath();
      g.ellipse(cx + 70, cy - 8, 30, 20, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f09020';
      g.beginPath();
      g.ellipse(cx + 70, cy - 8, 14, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1c2418';
      g.fillRect(cx - 120, cy - 70, 60, 70);
      g.strokeStyle = '#7a2a1e';
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - 40, cy - 150);
      g.lineTo(cx + 80, cy - 10);
      g.moveTo(cx - 10, cy - 160);
      g.lineTo(cx + 100, cy - 20);
      g.stroke();
      g.strokeStyle = 'rgba(120,100,80,0.45)';
      g.lineWidth = 5;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        const x = cx - 60 + i * 60;
        g.moveTo(x, cy - 50);
        g.bezierCurveTo(x - 30, cy - 110, x + 30, cy - 150, x, cy - 210);
        g.stroke();
      }
    }
  });
}

function frameRing(ow: number, oh: number, iw: number, ih: number, depth: number, bevel: number) {
  const s = roundRect(ow, oh, 0.02);
  s.holes.push(roundRect(iw, ih, 0.006));
  return slab(s, depth, bevel, 3, 8).translate(0, 0, depth / 2);
}

/** A woodblock-style print (a wave, a mountain at dawn, koi, a bowl of noodles) on a cream mat in a wooden frame. By seed. */
export function RamenPrint({ seed }: { seed: number }) {
  const kind = PRINTS[variant(seed, PRINTS.length)];
  const g = useMemo(
    () =>
      once('ri:print-frame', () => ({
        frame: boxUV(frameRing(0.66, 0.86, 0.5, 0.7, 0.06, 0.016), [1 / 0.4, 1 / 0.4]),
        mat: frameRing(0.5, 0.7, 0.36, 0.5, 0.012, 0.003),
      })),
    [],
  );
  const m = itemMats();
  const art = mat(`i:print:${kind}`, () => new THREE.MeshStandardMaterial({ map: printTex(kind), roughness: 0.85 }));
  const matMat = mat('i:print-mat', () => new THREE.MeshStandardMaterial({ color: '#ece2cc', roughness: 0.92 }));
  const p = propMats();
  return (
    <group scale={1.6}>
      <mesh material={m.lacquer} position={[0, 0, 0.004]}>
        <planeGeometry args={[0.6, 0.8]} />
      </mesh>
      <mesh material={art} position={[0, 0, 0.018]} receiveShadow>
        <planeGeometry args={[0.38, 0.52]} />
      </mesh>
      <mesh geometry={g.mat} material={matMat} position={[0, 0, 0.016]} receiveShadow />
      <mesh geometry={g.frame} material={variant(seed, 2) ? m.dark : m.wood} castShadow receiveShadow />
      <mesh material={p.glass} position={[0, 0, 0.05]} renderOrder={2}>
        <planeGeometry args={[0.5, 0.7]} />
      </mesh>
    </group>
  );
}

// ---------- stack of bowls ----------

/** A stack of ramen bowls in one glaze; how many and which glaze by seed. */
export function BowlStackItem({ seed }: { seed: number }) {
  const p = propMats();
  const g = bowlStackGeometry(variant(seed, 5), 3 + variant(seed * 7 + 1, 4));
  return <mesh geometry={g} material={p.glaze} rotation={[0, seed, 0]} castShadow receiveShadow />;
}

// ---------- floor lantern ----------

function andonPaper() {
  return tex('andon-paper', 256, 512, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h * 0.5, 10, w / 2, h * 0.5, h * 0.6);
    grad.addColorStop(0, '#fff3dc');
    grad.addColorStop(1, '#e8b878');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const r = rand(8);
    for (let i = 0; i < 400; i++) {
      g.strokeStyle = `rgba(180,130,70,${0.05 + r() * 0.06})`;
      g.lineWidth = 0.8;
      const x = r() * w;
      const y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 20, y + (r() - 0.5) * 20);
      g.stroke();
    }
    // the lattice behind the paper shows as soft dark lines
    g.fillStyle = 'rgba(90,50,20,0.45)';
    for (const x of [w / 3, (2 * w) / 3]) g.fillRect(x - 2, 0, 4, h);
    for (let k = 1; k < 4; k++) g.fillRect(0, (k / 4) * h - 2, w, 4);
  });
}

function andonGeometry() {
  return once('ri:andon', () => {
    const m = new Merger();
    const S = 0.19;
    const H = 0.98;
    const r = rand(2);
    const tint = () => new THREE.Color().setScalar(0.85 + r() * 0.25);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) m.add(plank(0.04, H, 0.04, 0.008, [1 / 0.8, 1 / 0.8], 1, [r(), r()], true), trs([sx * S, H / 2, sz * S]), tint());
    for (const y of [0.12, 0.54, H - 0.02])
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        m.add(plank(S * 2 + 0.04, 0.035, 0.03, 0.006), trs([Math.sin(a) * S, y, Math.cos(a) * S], [0, a, 0]), tint());
      }
    // a cap board and a carrying handle
    m.add(plank(S * 2 + 0.12, 0.03, S * 2 + 0.12, 0.01), trs([0, H + 0.015, 0]), tint());
    m.add(tubeThrough([V(-S * 0.6, H + 0.03, 0), V(-S * 0.5, H + 0.16, 0), V(S * 0.5, H + 0.16, 0), V(S * 0.6, H + 0.03, 0)], () => 0.014, 20, 6).geometry);
    return m.build();
  });
}

/** A standing paper lantern (andon) in a dark wooden frame, glowing warm. */
export function FloorLantern({ seed }: { seed: number }) {
  const m = itemMats();
  const frame = andonGeometry();
  const paper = mat('i:andon-paper', () => new THREE.MeshStandardMaterial({ map: andonPaper(), emissiveMap: andonPaper(), emissive: new THREE.Color('#ffb466'), emissiveIntensity: 1.3, roughness: 0.9, side: THREE.DoubleSide }));
  const S = 0.19;
  return (
    <group scale={1.25} rotation={[0, seed * 0.3, 0]}>
      <mesh geometry={frame} material={m.dark} castShadow receiveShadow />
      {[0, 1, 2, 3].map((k) => {
        const a = (k / 4) * Math.PI * 2;
        return (
          <mesh key={k} material={paper} position={[Math.sin(a) * (S - 0.004), 0.54 + 0.01, Math.cos(a) * (S - 0.004)]} rotation={[0, a, 0]}>
            <planeGeometry args={[S * 2 - 0.03, 0.84]} />
          </mesh>
        );
      })}
    </group>
  );
}

