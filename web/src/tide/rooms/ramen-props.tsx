import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { brushMarks, C, fbm3, mat, Merger, mix, noise3, once, paint, paintFlat, paintLathe, puffTex, rand, rimAlong, smoothLathe, smoothstep, tex, trs, V, worley3 } from './ramen-kit';

// Small props shared by the kitchen and its catalog: ramen bowls (empty,
// stacked or full of ramen), bottles, jars and tins, and a steam plume.
// Everything is drawn about 1.6x real size so it reads next to the cooks:
// a ramen bowl is about 0.42 across.

// ---------- materials ----------

export function propMats() {
  return {
    glaze: mat('p:glaze', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.14 })),
    matte: mat('p:matte', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })),
    food: mat('p:food', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.3 })),
    broth: mat('p:broth', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 })),
    glass: mat('p:glass', () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, side: THREE.DoubleSide })),
    tinted: mat('p:tinted-glass', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, transparent: true, opacity: 0.82, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 })),
    steel: mat('p:steel', () => new THREE.MeshStandardMaterial({ color: '#c3c7cc', metalness: 0.92, roughness: 0.3 })),
    chrome: mat('p:chrome', () => new THREE.MeshStandardMaterial({ color: '#e2e4e8', metalness: 1, roughness: 0.14 })),
    brass: mat('p:brass', () => new THREE.MeshStandardMaterial({ color: '#c99a4c', metalness: 0.9, roughness: 0.3 })),
    iron: mat('p:iron', () => new THREE.MeshStandardMaterial({ color: '#25211e', metalness: 0.55, roughness: 0.5 })),
    wood: mat('p:wood', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })),
    paper: mat('p:paper', () => new THREE.MeshStandardMaterial({ map: labelTex(), roughness: 0.9 })),
  };
}

// ---------- ramen bowls ----------

/** A donburi: foot ring, flaring walls, a slightly rolled rim, and back down inside. Rim at y 0.172, radius 0.21. */
export const BOWL: [number, number][] = [
  [0, 0.004],
  [0.07, 0.002],
  [0.08, 0.01],
  [0.079, 0.024],
  [0.072, 0.03],
  [0.095, 0.036],
  [0.135, 0.062],
  [0.172, 0.1],
  [0.196, 0.139],
  [0.208, 0.165],
  [0.212, 0.173],
  [0.206, 0.178],
  [0.199, 0.168],
  [0.188, 0.14],
  [0.163, 0.1],
  [0.124, 0.064],
  [0.07, 0.046],
  [0, 0.043],
];
const BOWL_N = 110;
const BOWL_RIM = rimAlong(BOWL, BOWL_N);
export const BOWL_TOP = 0.178;

type Glaze = { out: string; in: string; band?: string; bandY?: [number, number]; rim?: string; speck?: number; drip?: string; meander?: boolean };
/** Bowl glazes, by seed: red meander band on white, black and vermilion, indigo and white, celadon, tenmoku. */
export const BOWL_GLAZES: Glaze[] = [
  { out: '#f3eee4', in: '#f6f1e8', band: '#b8352a', bandY: [0.118, 0.158], rim: '#b8352a', meander: true },
  { out: '#1c1716', in: '#a8321f', rim: '#8a2a1c', speck: 0.4 },
  { out: '#f1ede2', in: '#f4efe6', band: '#24477c', bandY: [0.06, 0.16], rim: '#24477c' },
  { out: '#9fb5a0', in: '#b3c5b0', drip: '#6f8a72', speck: 0.25 },
  { out: '#3a2318', in: '#4a2c1c', rim: '#b0703a', drip: '#7a4524', speck: 0.3 },
];

/** Paint a bowl lathe's glaze: band, rim, specks, drips, and a white meander on the red band. */
function paintBowl(g: THREE.BufferGeometry, gl: Glaze) {
  const out = C(gl.out);
  const inn = C(gl.in);
  const band = gl.band ? C(gl.band) : null;
  const rim = gl.rim ? C(gl.rim) : null;
  const drip = gl.drip ? C(gl.drip) : null;
  const foot = C('#c9b9a0');
  const white = C('#f6f1e8');
  return paintLathe(g, BOWL_N, (x, y, z, along, o) => {
    const outside = along < BOWL_RIM - 0.01;
    const a = Math.atan2(z, x);
    if (outside) {
      o.copy(out);
      if (band && gl.bandY) {
        const k = smoothstep(gl.bandY[0] - 0.004, gl.bandY[0] + 0.002, y) * smoothstep(gl.bandY[1] + 0.004, gl.bandY[1] - 0.002, y);
        if (gl.meander) {
          // the square-spiral band: a key pattern from angle and height
          const u = ((a / (Math.PI * 2)) * 18 + 18) % 1;
          const v = (y - gl.bandY[0]) / (gl.bandY[1] - gl.bandY[0]);
          const ring = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5));
          const line = ring > 0.36 && ring < 0.44 ? 1 : ring > 0.14 && ring < 0.22 && !(u > 0.5 && v < 0.5) ? 1 : 0;
          mix(o, o, band, k);
          if (line && k > 0.5) o.copy(white);
        } else {
          // brushed waves: scalloped arcs
          const u = (a / (Math.PI * 2)) * 14;
          const fu = u - Math.floor(u) - 0.5;
          const wave = Math.sqrt(Math.max(0, 0.25 - fu * fu)) * 0.06;
          const yy = y - gl.bandY[0];
          const scal = ((yy - wave + 0.2) % 0.033) / 0.033;
          mix(o, o, band, k * (scal > 0.55 ? 1 : 0.15));
        }
      }
      if (drip) mix(o, o, drip, smoothstep(0.35, 0.8, fbm3(x * 30, y * 6, z * 30) + (0.17 - y) * 4) * 0.7);
      if (y < 0.03) mix(o, o, foot, 0.85);
    } else {
      o.copy(inn);
      if (gl.band && gl.meander) mix(o, o, C(gl.band), smoothstep(0.16, 0.165, y) * smoothstep(0.172, 0.168, y));
    }
    if (rim) mix(o, o, rim, smoothstep(0.163, 0.172, y) * (outside ? 1 : 0.8));
    if (gl.speck) mix(o, o, C('#efe0c8'), smoothstep(0.1, 0.04, worley3(x * 90, y * 90, z * 90)) * gl.speck);
  });
}

export function bowlGeometry(variant: number) {
  const gl = BOWL_GLAZES[((variant % BOWL_GLAZES.length) + BOWL_GLAZES.length) % BOWL_GLAZES.length];
  return once(`ramen:bowl:${variant}`, () => paintBowl(smoothLathe(BOWL, BOWL_N, 64), gl));
}

/** A low stack of nested bowls of one glaze (merged). */
export function bowlStackGeometry(variant: number, count: number) {
  return once(`ramen:bowl-stack:${variant}:${count}`, () => {
    const m = new Merger();
    for (let i = 0; i < count; i++) m.add(bowlGeometry(variant), trs([0, i * 0.052, 0], [0, i * 1.3, 0]));
    return m.build();
  });
}

// ---------- a bowl of ramen ----------

const NOODLE = C('#f0d68e');
const BROTHS = ['#d9a24e', '#b8742e', '#e3c482', '#a04a26'];

/** Broth surface: a slightly domed disc with fat droplets. */
function brothGeometry(kind: number) {
  return once(`ramen:broth:${kind}`, () => {
    const g = new THREE.CircleGeometry(0.188, 48, 0, Math.PI * 2);
    // add rings so the colour can vary
    const ring = new THREE.RingGeometry(0.0001, 0.188, 48, 8).rotateX(-Math.PI / 2);
    g.dispose();
    const base = C(BROTHS[kind % BROTHS.length]);
    const fat = C('#f6dc8e');
    const dark = base.clone().multiplyScalar(0.6);
    return paint(ring, (x, _y, z, out) => {
      const d = Math.hypot(x, z) / 0.188;
      out.copy(base);
      mix(out, out, dark, smoothstep(0.7, 1, d) * 0.5);
      // glistening fat drops
      mix(out, out, fat, smoothstep(0.16, 0.06, worley3(x * 60, 0.5, z * 60)) * 0.8);
      mix(out, out, fat, smoothstep(0.3, 0.7, noise3(x * 20, 3, z * 20)) * 0.15);
    });
  });
}

/** Everything in the bowl above the broth: noodles, chashu, egg, nori, naruto, menma, scallions. Merged. */
function toppingsGeometry(seed: number) {
  return once(`ramen:toppings:${seed}`, () => {
    const r = rand(seed * 13 + 1);
    const m = new Merger();
    const y0 = 0.142;
    // noodles: a tangle of wavy strands surfacing on one side
    for (let i = 0; i < 16; i++) {
      const a0 = -0.6 + r() * 1.4;
      const pts: THREE.Vector3[] = [];
      const rad = 0.06 + r() * 0.1;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const a = a0 + t * (1.2 + r() * 0.3);
        const wob = Math.sin(t * 18 + i) * 0.012;
        pts.push(V(Math.cos(a) * (rad + wob), y0 + 0.004 + Math.sin(t * Math.PI) * 0.012 + r() * 0.004, Math.sin(a) * (rad + wob) + 0.03));
      }
      const tube = tubeThrough(pts, () => 0.0065, 30, 5, (_t, _a, o) => o.copy(NOODLE).multiplyScalar(0.92 + r() * 0.12));
      m.add(tube.geometry);
    }
    // chashu: two slices leaning on the rim at the back
    const pork = C('#d7a491');
    const crust = C('#6b3b22');
    const fatC = C('#f2e2cf');
    for (let i = 0; i < 2; i++) {
      const g = new THREE.CylinderGeometry(0.068, 0.068, 0.014, 28, 1);
      paint(g, (x, y, z, out) => {
        const d = Math.hypot(x, z) / 0.068;
        out.copy(pork);
        // a spiral of fat and a dark seared edge
        const spiral = Math.sin(Math.atan2(z, x) * 1 + d * 16) * 0.5 + 0.5;
        mix(out, out, fatC, smoothstep(0.6, 0.9, spiral) * 0.55 * smoothstep(0.2, 0.5, d));
        mix(out, out, crust, smoothstep(0.82, 0.98, d));
        if (Math.abs(y) < 0.006) out.copy(crust);
      });
      m.add(g, trs([-0.05 + i * 0.075, y0 + 0.03, -0.08 + i * 0.01], [1.05 + i * 0.12, 0.3 - i * 0.6, 0.15]));
    }
    // a soft-boiled egg half, yolk up
    const egg = smoothLathe(
      [
        [0, -0.028],
        [0.025, -0.024],
        [0.036, -0.012],
        [0.038, 0.0],
        [0.0375, 0.001],
        [0, 0.002],
      ],
      24,
      28,
    );
    const yolk = C('#f08a1c');
    const jam = C('#f7b23a');
    const white = C('#fbf6ea');
    paint(egg, (x, y, z, out) => {
      const d = Math.hypot(x, z);
      if (y > -0.0005) {
        out.copy(white);
        mix(out, out, jam, smoothstep(0.024, 0.018, d));
        mix(out, out, yolk, smoothstep(0.016, 0.008, d));
      } else out.copy(C('#e9d9c0'));
    });
    m.add(egg, trs([0.085, y0 + 0.012, 0.035], [-0.35, 0.5, 0.15], [1.25, 1.25, 1.45]));
    // nori, standing up against the back of the bowl
    const nori = new THREE.BoxGeometry(0.12, 0.1, 0.003, 4, 4, 1);
    paint(nori, (x, y, _z, out) => out.copy(C('#1f2a1d')).multiplyScalar(0.8 + 0.4 * noise3(x * 60, y * 60, 1)));
    m.add(nori, trs([0.02, y0 + 0.05, -0.155], [-0.3, 0.15, 0.04]));
    // naruto: a fishcake slice with a pink swirl
    const naruto = new THREE.CylinderGeometry(0.028, 0.028, 0.008, 32, 1);
    const pinkC = C('#e86a8a');
    paint(naruto, (x, y, z, out) => {
      const d = Math.hypot(x, z) / 0.028;
      const a = Math.atan2(z, x);
      const sp = Math.sin(a + d * 13) * 0.5 + 0.5;
      out.copy(C('#fbf6ee'));
      if (Math.abs(y) > 0.003 && d < 0.9) mix(out, out, pinkC, smoothstep(0.55, 0.75, sp));
    });
    m.add(naruto, trs([-0.09, y0 + 0.008, 0.07], [0.1, 0, -0.12]));
    // menma: a few bamboo shoots
    const menma = C('#c08a3e');
    for (let i = 0; i < 4; i++) {
      const g = new THREE.BoxGeometry(0.05, 0.008, 0.014, 3, 1, 1);
      paint(g, (x, _y, _z, out) => out.copy(menma).multiplyScalar(0.85 + 0.25 * Math.abs(Math.sin(x * 120))));
      m.add(g, trs([0.0 + i * 0.012, y0 + 0.006 + i * 0.002, 0.11 - i * 0.008], [0, 0.3 + i * 0.35, 0]));
    }
    // scallions: little green rings scattered over the middle
    const green = C('#7cc04a');
    const pale = C('#d9eab0');
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 0.09;
      const t = new THREE.TorusGeometry(0.008, 0.0028, 4, 10);
      paintFlat(t, r() < 0.3 ? pale : green);
      m.add(t, trs([Math.cos(a) * d - 0.01, y0 + 0.012 + r() * 0.006, Math.sin(a) * d + 0.02], [Math.PI / 2 + (r() - 0.5) * 0.6, 0, r() * 3]));
    }
    return m.build();
  });
}

/** A bowl of ramen (no chopsticks). Its rim is at BOWL_TOP. */
export function RamenBowl({ seed = 1, glaze, broth }: { seed?: number; glaze?: number; broth?: number }) {
  const p = propMats();
  const bowl = bowlGeometry(glaze ?? seed);
  const soup = brothGeometry(broth ?? seed);
  const tops = toppingsGeometry(seed);
  return (
    <group>
      <mesh geometry={bowl} material={p.glaze} castShadow receiveShadow />
      <mesh geometry={soup} material={p.broth} position={[0, 0.138, 0]} receiveShadow />
      <mesh geometry={tops} material={p.food} castShadow receiveShadow />
    </group>
  );
}

// ---------- chopsticks and spoons ----------

/** A pair of lacquered chopsticks lying along +x (merged). */
export function chopsticksGeometry(colour = '#7a2a1e') {
  return once(`ramen:chopsticks:${colour}`, () => {
    const m = new Merger();
    for (const z of [-0.012, 0.012]) {
      const g = new THREE.CylinderGeometry(0.006, 0.0105, 0.38, 8, 4).rotateZ(Math.PI / 2);
      const c = C(colour);
      const tip = C('#d9b25a');
      paint(g, (x, _y, _z, out) => mix(out, c, tip, smoothstep(-0.13, -0.14, x)));
      m.add(g, trs([0, 0.01, z], [0, z * 2, 0]));
    }
    return m.build();
  });
}

/** A flat-bottomed ceramic ramen spoon (renge), bowl toward -x. */
export function spoonGeometry(colour = '#f3eee4') {
  return once(`ramen:spoon:${colour}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-0.07, 0);
    s.bezierCurveTo(-0.07, 0.04, -0.02, 0.05, 0.02, 0.022);
    s.lineTo(0.12, 0.012);
    s.lineTo(0.12, -0.012);
    s.lineTo(0.02, -0.022);
    s.bezierCurveTo(-0.02, -0.05, -0.07, -0.04, -0.07, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 12 });
    g.rotateX(-Math.PI / 2);
    // bend the handle up
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      if (x > 0.02) p.setY(i, p.getY(i) + (x - 0.02) * (x - 0.02) * 3.2);
      else p.setY(i, p.getY(i) - Math.max(0, 0.0016 - (x + 0.025) * (x + 0.025)) * 6);
    }
    g.computeVertexNormals();
    return paintFlat(g, colour);
  });
}

// ---------- bottles, jars, tins ----------

/** Paper labels: a sheet of small labels with brush marks, picked by UV offset. 4 x 2 labels. */
export function labelTex() {
  return tex('labels', 512, 512, (g, w, h) => {
    const r = rand(77);
    const papers = ['#efe4c8', '#f3ecdc', '#e9d3a6', '#d9c8a4', '#f1e8d4', '#c94a32', '#efe4c8', '#2c3a52'];
    const inks = ['#2a1e16', '#7a1c14', '#2a1e16', '#1c2a40', '#2a1e16', '#f3ecdc', '#7a1c14', '#efe4c8'];
    const lw = w / 4;
    const lh = h / 2;
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 4; i++) {
        const k = j * 4 + i;
        const x = i * lw;
        const y = j * lh;
        g.fillStyle = papers[k];
        g.fillRect(x, y, lw, lh);
        // paper fibres
        for (let f = 0; f < 120; f++) {
          g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,70,40'},${0.05 + r() * 0.06})`;
          g.fillRect(x + r() * lw, y + r() * lh, 1 + r() * 6, 1);
        }
        // a red seal square on some
        if (k % 3 === 0) {
          g.fillStyle = 'rgba(190,40,30,0.85)';
          g.fillRect(x + lw * 0.62, y + lh * 0.72, lw * 0.2, lw * 0.2);
        }
        // a border line
        g.strokeStyle = inks[k];
        g.globalAlpha = 0.6;
        g.lineWidth = 3;
        g.strokeRect(x + 8, y + 8, lw - 16, lh - 16);
        g.globalAlpha = 1;
        // the brush marks: one vertical column like a name, smaller marks beside it
        brushMarks(g, r, x + lw * 0.3, y + lh * 0.12, lw * 0.4, lh * 0.62, inks[k], 4, true);
        brushMarks(g, r, x + lw * 0.12, y + lh * 0.18, lw * 0.14, lh * 0.36, inks[k], 2, true);
      }
  });
}

/** Map a label rectangle on the sheet (index 0..7) onto a cylindrical band of a lathe. */
function labelUV(g: THREE.BufferGeometry, y0: number, y1: number, index: number, arc = 0.5) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const i = index % 8;
  const u0 = (i % 4) / 4;
  const v0 = Math.floor(i / 4) / 2;
  for (let k = 0; k < p.count; k++) {
    const a = Math.atan2(p.getX(k), p.getZ(k)); // 0 facing +z
    const u = Math.max(0, Math.min(1, a / (Math.PI * 2 * arc) + 0.5));
    const v = Math.max(0, Math.min(1, (p.getY(k) - y0) / (y1 - y0)));
    uv[k * 2] = u0 + u * 0.25;
    uv[k * 2 + 1] = 1 - (v0 + (1 - v) * 0.5);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** A paper label band (a slightly bigger open cylinder) for a bottle or jar. */
export function labelGeometry(r: number, y0: number, y1: number, index: number, arc = 0.5) {
  return once(`ramen:label:${r}:${y0}:${y1}:${index}:${arc}`, () => {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, 40, 1, true, Math.PI - Math.PI * arc, Math.PI * 2 * arc).translate(0, (y0 + y1) / 2, 0);
    return labelUV(g, y0, y1, index, arc);
  });
}

export type BottleKind = 'sake' | 'soy' | 'oil' | 'mirin' | 'vinegar';
const BOTTLES: Record<BottleKind, { pts: [number, number][]; glass: string; cap: string; label: [number, number, number]; fill?: string }> = {
  // big brown sake bottle (isshobin), label low on the belly
  sake: {
    pts: [
      [0, 0],
      [0.075, 0],
      [0.084, 0.012],
      [0.086, 0.36],
      [0.078, 0.42],
      [0.04, 0.5],
      [0.026, 0.56],
      [0.024, 0.6],
      [0.028, 0.61],
      [0, 0.612],
    ],
    glass: '#3a1f0e',
    cap: '#c9a34a',
    label: [0.087, 0.12, 0.33],
  },
  // a squat soy sauce bottle
  soy: {
    pts: [
      [0, 0],
      [0.055, 0],
      [0.06, 0.012],
      [0.062, 0.16],
      [0.05, 0.2],
      [0.024, 0.235],
      [0.022, 0.27],
      [0, 0.272],
    ],
    glass: '#1a0d07',
    cap: '#b8352a',
    label: [0.063, 0.05, 0.15],
  },
  // a tall clear bottle of chili oil
  oil: {
    pts: [
      [0, 0],
      [0.045, 0],
      [0.05, 0.012],
      [0.05, 0.26],
      [0.04, 0.3],
      [0.018, 0.34],
      [0.017, 0.38],
      [0, 0.382],
    ],
    glass: '#b5461f',
    cap: '#2a2a2a',
    label: [0.051, 0.08, 0.2],
  },
  // a green mirin bottle
  mirin: {
    pts: [
      [0, 0],
      [0.06, 0],
      [0.066, 0.012],
      [0.067, 0.3],
      [0.055, 0.36],
      [0.026, 0.42],
      [0.022, 0.47],
      [0, 0.472],
    ],
    glass: '#24402a',
    cap: '#d8d2c4',
    label: [0.068, 0.1, 0.27],
  },
  // clear vinegar with a pale tint
  vinegar: {
    pts: [
      [0, 0],
      [0.05, 0],
      [0.055, 0.012],
      [0.056, 0.22],
      [0.046, 0.27],
      [0.02, 0.31],
      [0.019, 0.35],
      [0, 0.352],
    ],
    glass: '#c9b37a',
    cap: '#3a5a8a',
    label: [0.057, 0.06, 0.18],
  },
};

export function bottleGeometry(kind: BottleKind) {
  return once(`ramen:bottle:${kind}`, () => {
    const b = BOTTLES[kind];
    const n = 60;
    const g = smoothLathe(b.pts, n, 32);
    const glass = C(b.glass);
    const top = b.pts[b.pts.length - 3][1];
    return paintLathe(g, n, (x, y, z, _a, out) => {
      out.copy(glass);
      // a brighter edge where light runs through the thick glass, and a cap
      out.multiplyScalar(0.9 + 0.25 * smoothstep(0.3, 1, Math.abs(Math.atan2(x, z)) / Math.PI));
      if (y > top - 0.004) out.copy(C(b.cap));
    });
  });
}

/** A bottle with its label. */
export function Bottle({ kind, label = 0 }: { kind: BottleKind; label?: number }) {
  const p = propMats();
  const b = BOTTLES[kind];
  return (
    <group>
      <mesh geometry={bottleGeometry(kind)} material={p.tinted} castShadow />
      <mesh geometry={labelGeometry(b.label[0], b.label[1], b.label[2], label)} material={p.paper} />
    </group>
  );
}

export type JarKind = 'ginger' | 'sesame' | 'garlic' | 'chili' | 'egg';
const JAR_FILL: Record<JarKind, { a: string; b: string; fill: number; lid: string }> = {
  ginger: { a: '#f2a6a8', b: '#e47f86', fill: 0.72, lid: '#c33a2c' },
  sesame: { a: '#e8d8b0', b: '#2a2420', fill: 0.6, lid: '#2c2a28' },
  garlic: { a: '#e9c98a', b: '#b98a46', fill: 0.66, lid: '#c9a34a' },
  chili: { a: '#c4321c', b: '#6e1408', fill: 0.58, lid: '#2c2a28' },
  egg: { a: '#c7884a', b: '#7a4a24', fill: 0.8, lid: '#d8d2c4' },
};

/** A glass jar with something in it and a lid. Height h, radius r. */
export function Jar({ kind, h = 0.24, r = 0.075 }: { kind: JarKind; h?: number; r?: number }) {
  const p = propMats();
  const geo = useMemo(
    () =>
      once(`ramen:jar:${kind}:${h}:${r}`, () => {
        const f = JAR_FILL[kind];
        const glass = smoothLathe(
          [
            [0, 0],
            [r * 0.9, 0],
            [r, r * 0.12],
            [r * 1.01, h * 0.82],
            [r * 0.88, h * 0.93],
            [r * 0.86, h],
          ],
          40,
          36,
        );
        const fh = h * f.fill;
        const stuff = new THREE.CylinderGeometry(r * 0.93, r * 0.9, fh, 28, 8).translate(0, fh / 2 + r * 0.06, 0);
        const A = C(f.a);
        const B = C(f.b);
        paint(stuff, (x, y, z, out) => {
          if (kind === 'egg') {
            // eggs stacked in soy marinade
            out.copy(B);
            mix(out, out, A, smoothstep(0.35, 0.1, worley3(x * 28, y * 28, z * 28)));
          } else mix(out, A, B, smoothstep(0.2, 0.6, noise3(x * 55, y * 55, z * 55) * 0.5 + 0.5) * (kind === 'sesame' ? 0.35 : 0.8));
        });
        const lid = smoothLathe(
          [
            [0, h - 0.004],
            [r * 0.9, h - 0.004],
            [r * 0.94, h + 0.004],
            [r * 0.94, h + 0.034],
            [r * 0.86, h + 0.04],
            [0, h + 0.041],
          ],
          24,
          32,
        );
        paintFlat(lid, f.lid);
        return { glass, stuff, lid };
      }),
    [kind, h, r],
  );
  return (
    <group>
      <mesh geometry={geo.stuff} material={p.matte} />
      <mesh geometry={geo.lid} material={p.glaze} castShadow />
      <mesh geometry={geo.glass} material={p.glass} renderOrder={2} castShadow />
    </group>
  );
}

/** A lacquered or painted tin (tea caddy, spice tin). */
export function tinGeometry(colour: string, h = 0.2, r = 0.065, band = '#c9a34a') {
  return once(`ramen:tin:${colour}:${h}:${r}`, () => {
    const n = 40;
    const g = smoothLathe(
      [
        [0, 0],
        [r * 0.96, 0],
        [r, 0.008],
        [r, h * 0.8],
        [r * 1.02, h * 0.8 + 0.004],
        [r * 1.02, h - 0.004],
        [r * 0.98, h],
        [0, h + 0.002],
      ],
      n,
      36,
    );
    const c = C(colour);
    const b = C(band);
    return paintLathe(g, n, (x, y, z, _a, out) => {
      out.copy(c);
      mix(out, out, b, smoothstep(h * 0.79, h * 0.8, y) * smoothstep(h * 0.83, h * 0.82, y));
      // a little worn paint on the edges
      mix(out, out, C('#8a8a86'), smoothstep(0.5, 0.9, noise3(x * 70, y * 70, z * 70)) * 0.25);
    });
  });
}

// ---------- steam ----------

/** Soft steam rising from a point: a few puffs drifting up, swelling and fading. */
export function Steam({ position, count = 10, height = 2.4, spread = 0.5, size = 0.5, opacity = 0.16, speed = 0.11, seed = 1 }: { position: [number, number, number]; count?: number; height?: number; spread?: number; size?: number; opacity?: number; speed?: number; seed?: number }) {
  const ref = useRef<THREE.Group>(null);
  const puffs = useMemo(() => {
    const r = rand(seed);
    return Array.from({ length: count }, (_, i) => ({ ph: i / count + r() * 0.05, x: (r() - 0.5) * spread, z: (r() - 0.5) * spread * 0.6, sw: 0.5 + r(), rot: r() * Math.PI * 2 }));
  }, [count, spread, seed]);
  const material = useMemo(() => new THREE.SpriteMaterial({ map: puffTex(), color: '#fff4e6', transparent: true, depthWrite: false, opacity: 0 }), []);
  const mats = useMemo(() => puffs.map(() => material.clone()), [puffs, material]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = ref.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      const p = puffs[i];
      const k = (t * speed + p.ph) % 1;
      c.position.set(p.x * (0.5 + k) + Math.sin(t * 0.6 * p.sw + i) * 0.18 * k, k * height, p.z + Math.cos(t * 0.45 + i) * 0.12 * k);
      c.scale.setScalar(size * (0.6 + k * 1.9));
      const sm = (c as THREE.Sprite).material as THREE.SpriteMaterial;
      sm.opacity = opacity * Math.sin(Math.PI * Math.min(1, k * 1.25)) * (1 - k * 0.3);
      sm.rotation = p.rot + t * 0.1 * (i % 2 ? 1 : -1);
      // a puff that has faded out isn't drawn at all
      c.visible = sm.opacity > opacity * 0.04;
    });
  });
  return (
    <group ref={ref} position={position}>
      {mats.map((m, i) => (
        <sprite key={i} material={m} />
      ))}
    </group>
  );
}
