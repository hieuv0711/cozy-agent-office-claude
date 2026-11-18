import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { cached, chain, cone, ellipsoid, meshSDF, type SDF, smin, sphere } from '../../tank/sdf';
import { Steam } from './ramen-props';
import { CEIL, ROOM, RUG, SEATS, SETTLE, STOVE, TABLE, WIN_SIDE } from './workshop-dims';
import { C, fbm3, knitTex, mapUV, Merger, mix, noise3, once, paint, paintFlat, paintLathe, plank, rand, smoothLathe, smoothstep, softDot, tex, trs, V, wmat, woodTex } from './workshop-kit';
import { stoveFlicker } from './workshop-lights';
import { BelowCeiling } from './workshop-shell';
import { twoSided } from './workshop-toys';

// The warm corner at the back left, where idle makers sit with cocoa and doze
// off: a cast-iron pot-belly stove on a slate hearth, its fire glowing through
// a mica window (breathing slowly), a copper kettle on top and the pipe going
// up through the ceiling; split logs stacked under the window; a round table
// with mugs of cocoa, a jug and a plate of gingerbread on a braided rag rug;
// a long cushioned bench, a barrel stool and a rocking chair with a crocheted
// blanket; and the workshop cat, asleep in its basket by the stove.

export function cornerMats() {
  return {
    iron: wmat('k:iron', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.48 })),
    nickel: wmat('k:nickel', () => new THREE.MeshStandardMaterial({ color: '#c8c4bc', metalness: 0.9, roughness: 0.25 })),
    copper: wmat('k:copper', () => new THREE.MeshStandardMaterial({ color: '#c0703e', metalness: 0.85, roughness: 0.3 })),
    oak: wmat('k:oak', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-corner-oak', { w: 512, h: 256, light: '#a0703e', dark: '#3e220e', planks: 1, rings: 9, seed: 71, joints: false, seams: 0, figure: 0.35 }), roughness: 0.5, vertexColors: true })),
    table: wmat('k:table', () => new THREE.MeshStandardMaterial({ map: woodTex('ws-table', { w: 1024, h: 1024, light: '#b07a44', dark: '#4e2a12', planks: 5, rings: 9, seed: 88, figure: 0.3, warp: 0.6 }), roughness: 0.48, vertexColors: true })),
    logs: wmat('k:logs', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })),
    glaze: wmat('k:glaze', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 })),
    cloth: wmat('k:cloth', () => new THREE.MeshStandardMaterial({ map: knitTex(), vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })),
    quilt: wmat('k:quilt', () => new THREE.MeshStandardMaterial({ map: quiltTex(), roughness: 0.92, vertexColors: true })),
    rug: wmat('k:rug', () => new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 0.95, vertexColors: true })),
    fur: wmat('k:fur', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })),
  };
}
type KMats = ReturnType<typeof cornerMats>;

// ---------- textures ----------

/** Patchwork: squares of printed cotton (gingham, florals, stripes, plains) with stitching. */
function quiltTex() {
  return tex('ws-quilt', 512, 512, (g, w, h) => {
    const n = 6;
    const s = w / n;
    const r = rand(44);
    const cols = ['#b8423a', '#e6c46a', '#4a6a9a', '#efe3c8', '#5a8a5a', '#c87a4a', '#8a4a6a', '#d8a0a0'];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const c = cols[Math.floor(r() * cols.length)];
        const x = i * s;
        const y = j * s;
        g.fillStyle = c;
        g.fillRect(x, y, s, s);
        const kind = Math.floor(r() * 4);
        g.fillStyle = 'rgba(255,250,235,0.55)';
        if (kind === 0)
          for (let k = 4; k < s; k += 12) {
            g.fillRect(x + k, y, 5, s);
            g.fillRect(x, y + k, s, 5);
          }
        else if (kind === 1)
          for (let k = 0; k < 9; k++) {
            g.beginPath();
            g.arc(x + 10 + r() * (s - 20), y + 10 + r() * (s - 20), 4 + r() * 4, 0, Math.PI * 2);
            g.fill();
          }
        else if (kind === 2) for (let k = 4; k < s; k += 14) g.fillRect(x, y + k, s, 6);
        g.strokeStyle = 'rgba(40,30,20,0.35)';
        g.setLineDash([5, 4]);
        g.lineWidth = 1.5;
        g.strokeRect(x + 4, y + 4, s - 8, s - 8);
        g.setLineDash([]);
        g.fillStyle = 'rgba(30,20,10,0.25)';
        g.fillRect(x, y, s, 2);
        g.fillRect(x, y, 2, s);
      }
  });
}

/** A braided rag rug, as rings: u runs round the rug, v from the centre out. Each ring is a braid of three strands. */
function rugTex() {
  return tex('ws-rug', 1024, 512, (g, w, h) => {
    const rings = ['#7a2a22', '#c8963e', '#2e4466', '#e2d2b0', '#8a3a2a', '#4a6a4a', '#b8643a', '#e2d2b0', '#6a2a3a', '#c8963e', '#2e4466', '#8a3a2a', '#d8b878', '#5a3a2a'];
    const rh = h / rings.length;
    const r = rand(9);
    rings.forEach((c, i) => {
      const y = i * rh;
      const strands = [c, rings[(i + 3) % rings.length], c];
      const steps = Math.round(((i + 2) / rings.length) * 90) * 2;
      const sw = w / steps;
      for (let k = 0; k < steps; k++) {
        const sc = strands[k % 3];
        const x = k * sw;
        const grad = g.createLinearGradient(x, y, x + sw, y + rh);
        grad.addColorStop(0, sc);
        grad.addColorStop(1, '#' + C(sc).multiplyScalar(0.7).getHexString());
        g.fillStyle = grad;
        g.beginPath();
        // a chevron: the braid's strands crossing
        const up = k % 2 === 0;
        g.moveTo(x, y + (up ? rh : 0));
        g.lineTo(x + sw * 1.4, y + rh * 0.5);
        g.lineTo(x, y + (up ? 0 : rh));
        g.lineTo(x - sw * 0.4, y + rh * 0.5);
        g.closePath();
        g.fill();
      }
      g.fillStyle = 'rgba(20,10,6,0.35)';
      g.fillRect(0, y, w, 2);
    });
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,240,220' : '20,10,6'},${0.05 + r() * 0.06})`;
      g.fillRect(r() * w, r() * h, 2, 1);
    }
  });
}

/** The fire seen through the stove's mica window: glowing logs, embers and flames (white-hot to deep red). */
function fireTex() {
  return tex(
    'ws-fire',
    256,
    192,
    (g, w, h) => {
      const r = rand(3);
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#3a0e04');
      bg.addColorStop(0.5, '#a8320a');
      bg.addColorStop(1, '#ff9a2a');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // tongues of flame rising from the logs
      for (let i = 0; i < 26; i++) {
        const x = r() * w;
        const fh = h * (0.35 + r() * 0.5);
        const fw = 14 + r() * 26;
        const grad = g.createLinearGradient(0, h, 0, h - fh);
        grad.addColorStop(0, 'rgba(255,240,180,0.9)');
        grad.addColorStop(0.4, 'rgba(255,170,60,0.7)');
        grad.addColorStop(1, 'rgba(200,60,10,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(x - fw / 2, h);
        g.quadraticCurveTo(x - fw * 0.6, h - fh * 0.5, x + (r() - 0.5) * 20, h - fh);
        g.quadraticCurveTo(x + fw * 0.6, h - fh * 0.5, x + fw / 2, h);
        g.fill();
      }
      // the logs, dark with glowing cracks
      for (let i = 0; i < 3; i++) {
        const y = h * (0.72 + i * 0.09);
        g.fillStyle = '#2a0e06';
        g.beginPath();
        g.ellipse(w * (0.3 + i * 0.2), y, w * 0.32, h * 0.07, (r() - 0.5) * 0.3, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(255,150,40,0.85)';
        g.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          const cx = w * (0.1 + r() * 0.8);
          g.moveTo(cx, y - 4);
          g.lineTo(cx + 8 + r() * 10, y + (r() - 0.5) * 6);
          g.stroke();
        }
      }
      // embers along the bottom
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(255,${120 + r() * 120},${30 + r() * 40},${0.6 + r() * 0.4})`;
        g.beginPath();
        g.arc(r() * w, h * (0.86 + r() * 0.14), 1 + r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    },
    { repeat: false },
  );
}

// ---------- the stove ----------

const STOVE_YAW = Math.PI / 4;

function stoveGeometries() {
  return once('ws:stove', () => {
    const iron = new Merger();
    const nickel = new Merger();
    const n = 120;
    // the belly: a turned casting with raised rings, sitting on a square base plate
    const body = smoothLathe(
      [
        [0, 0.3],
        [0.3, 0.3],
        [0.315, 0.32],
        [0.3, 0.36],
        [0.36, 0.42],
        [0.4, 0.52],
        [0.43, 0.66],
        [0.44, 0.8],
        [0.425, 0.92],
        [0.38, 1.02],
        [0.33, 1.08],
        [0.335, 1.12],
        [0.37, 1.15],
        [0.375, 1.19],
        [0.34, 1.21],
        [0.14, 1.23],
        [0.11, 1.26],
        [0.11, 1.33],
        [0, 1.33],
      ],
      n,
      64,
    );
    const black = C('#1e1b19');
    const rust = C('#4a2a1a');
    const heat = C('#5a3a2c');
    paintLathe(body, n, (x, y, z, _a, out) => {
      out.copy(black).multiplyScalar(0.85 + 0.3 * noise3(x * 30, y * 30, z * 30));
      mix(out, out, rust, smoothstep(0.55, 0.8, fbm3(x * 6, y * 6, z * 6)) * 0.35);
      // heat-dulled where the fire is
      mix(out, out, heat, smoothstep(0.5, 0.75, y) * smoothstep(0.95, 0.75, y) * 0.25);
    });
    iron.add(body);
    // raised bands round the belly
    for (const [y, rr] of [
      [0.5, 0.405],
      [0.94, 0.42],
    ] as [number, number][])
      iron.add(new THREE.TorusGeometry(rr, 0.014, 8, 64).rotateX(Math.PI / 2), trs([0, y, 0]), black);
    // the base: a square plate with a skirt, on four cabriole legs
    iron.add(plank(0.74, 0.05, 0.74, 0.02), trs([0, 0.31, 0]), black);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const c = Math.cos(a);
      const s = Math.sin(a);
      iron.add(tubeThrough([V(c * 0.26, 0.3, s * 0.26), V(c * 0.33, 0.2, s * 0.33), V(c * 0.3, 0.1, s * 0.3), V(c * 0.36, 0.06, s * 0.36)], (t) => 0.04 - t * 0.012, 16, 10).geometry, undefined, black);
      iron.add(new THREE.SphereGeometry(0.04, 12, 8), trs([c * 0.37, 0.07, s * 0.37], [0, 0, 0], [1, 0.6, 1]), black);
    }
    // a nickel rail round the shoulder and a finial ring at the collar
    nickel.add(new THREE.TorusGeometry(0.39, 0.012, 8, 64).rotateX(Math.PI / 2), trs([0, 1.17, 0]));
    nickel.add(new THREE.TorusGeometry(0.115, 0.01, 8, 32).rotateX(Math.PI / 2), trs([0, 1.29, 0]));
    // the fire door (facing +z here), with hinges and a coiled handle; a smaller ash door below with a draught spinner
    const door = new Merger();
    door.add(plank(0.34, 0.27, 0.04, 0.02), trs([0, 0.0, 0.0]), black);
    for (const y of [-0.08, 0.08]) door.add(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 10), trs([-0.18, y, 0.01]), black);
    const coil: THREE.Vector3[] = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      const a = t * Math.PI * 12;
      coil.push(V(0.17 + t * 0.07, Math.cos(a) * 0.016, 0.03 + Math.sin(a) * 0.016));
    }
    const handle = new Merger();
    handle.add(tubeThrough(coil, () => 0.004, 160, 5).geometry);
    // the mica window's frame and glazing bars
    door.add(plank(0.27, 0.025, 0.02, 0.006), trs([0, 0.095, 0.03]), black);
    door.add(plank(0.27, 0.025, 0.02, 0.006), trs([0, -0.095, 0.03]), black);
    for (const x of [-0.13, 0.13]) door.add(plank(0.025, 0.19, 0.02, 0.006), trs([x, 0, 0.03]), black);
    door.add(plank(0.012, 0.17, 0.012, 0.004), trs([0, 0, 0.034]), black);
    door.add(plank(0.25, 0.012, 0.012, 0.004), trs([0, 0, 0.034]), black);
    iron.add(door.build(), trs([0, 0.74, 0.43]));
    nickel.add(handle.build(), trs([0, 0.74, 0.43]));
    iron.add(plank(0.26, 0.12, 0.04, 0.015), trs([0, 0.4, 0.37]), black);
    nickel.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 18).rotateX(Math.PI / 2), trs([0, 0.4, 0.395]));
    // the pipe: up to the ceiling, with joint rings and a damper handle
    const pipe = new Merger();
    const top = CEIL;
    pipe.add(new THREE.CylinderGeometry(0.1, 0.1, top - 1.33, 24, 1, true), trs([0, 1.33 + (top - 1.33) / 2, 0]), black);
    for (let y = 1.95; y < top - 0.3; y += 0.95) pipe.add(new THREE.TorusGeometry(0.103, 0.01, 6, 24).rotateX(Math.PI / 2), trs([0, y, 0]), black);
    pipe.add(tubeThrough([V(-0.1, 2.25, 0), V(-0.22, 2.25, 0)], () => 0.008, 2, 6).geometry, undefined, black);
    pipe.add(new THREE.SphereGeometry(0.02, 8, 6), trs([-0.23, 2.25, 0]), C('#c8c4bc'));
    pipe.add(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 28), trs([0, top - 0.015, 0]), black);
    return { iron: iron.build(), nickel: nickel.build(), pipe: pipe.build() };
  });
}

/** A copper kettle: a squat body, a curved spout and an arched handle with a wooden grip. */
function kettleGeometries() {
  return once('ws:kettle', () => {
    const copper = new Merger();
    const n = 40;
    copper.add(
      smoothLathe(
        [
          [0, 0],
          [0.12, 0],
          [0.15, 0.03],
          [0.165, 0.09],
          [0.15, 0.15],
          [0.09, 0.19],
          [0.07, 0.2],
          [0.07, 0.21],
          [0.03, 0.22],
          [0.02, 0.24],
          [0, 0.245],
        ],
        n,
        40,
      ),
    );
    copper.add(tubeThrough([V(0.13, 0.06, 0), V(0.2, 0.12, 0), V(0.24, 0.2, 0), V(0.27, 0.23, 0)], (t) => 0.03 - t * 0.016, 16, 10).geometry);
    copper.add(tubeThrough([V(-0.09, 0.17, 0), V(-0.07, 0.3, 0), V(0.0, 0.34, 0), V(0.07, 0.3, 0), V(0.09, 0.17, 0)], () => 0.009, 24, 6).geometry);
    const grip = new THREE.CylinderGeometry(0.018, 0.018, 0.1, 10).rotateZ(Math.PI / 2);
    return { copper: copper.build(), grip: paintFlat(grip, '#3a2010').translate(0, 0.335, 0) };
  });
}

/** Split logs stacked against the back wall under the window: bark outside, pale split faces, end grain rings. */
function logGeometries() {
  const m = new Merger();
  const r = rand(17);
  const x0 = -10.55;
  const x1 = -8.8;
  const zc = ROOM.back + 0.16;
  const bark = C('#4a3424');
  const wood = C('#d8b07a');
  for (let row = 0; row < 4; row++) {
    const y = 0.085 + row * 0.15;
    for (let x = x0 + (row % 2) * 0.08; x < x1 - 0.1; x += 0.17 + r() * 0.03) {
      const len = 0.42 + r() * 0.12;
      const rad = 0.07 + r() * 0.02;
      let g: THREE.BufferGeometry;
      if (r() < 0.45) {
        // a round log, a little out of true
        g = new THREE.CylinderGeometry(rad, rad * (0.92 + r() * 0.1), len, 11, 3);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const k = 1 + 0.06 * noise3(p.getX(i) * 9 + x, p.getY(i) * 3, p.getZ(i) * 9);
          p.setX(i, p.getX(i) * k);
          p.setZ(i, p.getZ(i) * k);
        }
        g.computeVertexNormals();
      } else {
        // a split log: a wedge of the round, closed, its split faces pale
        const a = Math.PI * (0.45 + r() * 0.5);
        const sh = new THREE.Shape();
        sh.moveTo(0, 0);
        for (let i = 0; i <= 10; i++) sh.lineTo(Math.cos((i / 10) * a) * rad * 1.3, Math.sin((i / 10) * a) * rad * 1.3);
        sh.closePath();
        g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 4 });
        g.translate(-rad * 0.4, -rad * 0.4, -len / 2).rotateX(Math.PI / 2);
      }
      const R = rad * 1.25;
      paint(g, (px, py, pz, out) => {
        const rr = Math.hypot(px, pz);
        if (Math.abs(py) > len / 2 - 0.004) {
          // end grain: growth rings, the bark at the rim
          out.copy(wood).multiplyScalar(0.78 + 0.22 * Math.sin(rr * 170));
          if (rr > R * 0.86) out.copy(bark);
        } else out.copy(rr > R * 0.8 ? bark : wood).multiplyScalar(0.82 + 0.26 * noise3(px * 25, py * 5, pz * 25));
      });
      m.add(g, trs([x, y, zc + (r() - 0.5) * 0.04], [Math.PI / 2, (r() - 0.5) * 0.1, r() * Math.PI * 2], 1, 'YXZ'));
    }
  }
  return m.build();
}

/** Fire irons hung on the brick: a poker, a little shovel and a brush on a wrought rail. */
function fireIrons() {
  const m = new Merger();
  const black = C('#1e1b19');
  const x = ROOM.x0 + 0.06;
  const z = STOVE.z + 0.62;
  m.add(plank(0.03, 0.04, 0.5, 0.01), trs([x, 1.35, z]), black);
  const tools = [-0.16, 0, 0.16];
  tools.forEach((dz, i) => {
    m.add(tubeThrough([V(x + 0.04, 1.33, z + dz), V(x + 0.04, 0.6, z + dz)], () => 0.009, 2, 6).geometry, undefined, black);
    m.add(new THREE.TorusGeometry(0.03, 0.007, 6, 14), trs([x + 0.04, 1.36, z + dz], [0, Math.PI / 2, 0]), black);
    if (i === 0) m.add(tubeThrough([V(x + 0.04, 0.6, z + dz), V(x + 0.04, 0.52, z + dz), V(x + 0.08, 0.5, z + dz)], () => 0.009, 6, 6).geometry, undefined, black);
    if (i === 1) m.add(plank(0.01, 0.14, 0.11, 0.004), trs([x + 0.05, 0.54, z + dz]), black);
    if (i === 2) m.add(new THREE.CylinderGeometry(0.035, 0.025, 0.14, 12), trs([x + 0.05, 0.54, z + dz]), C('#6a4a2a'));
  });
  return m.build();
}

// ---------- the table and the cocoa ----------

function tableGeometries() {
  const { r, top } = TABLE;
  const n = 30;
  const slab = smoothLathe(
    [
      [0, top - 0.06],
      [r - 0.03, top - 0.06],
      [r + 0.005, top - 0.045],
      [r + 0.01, top - 0.018],
      [r - 0.015, top],
      [0, top],
    ],
    n,
    72,
  );
  const p = slab.attributes.position;
  const uv = slab.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2.2 + 0.3, p.getZ(i) / 2.2 + 0.2);
  paint(slab, (x, y, z, out) => {
    out.setScalar(0.9 + 0.12 * fbm3(x * 2, y, z * 2));
    for (const [cx, cz, rr] of [
      [0.3, -0.25, 0.065],
      [-0.42, 0.2, 0.06],
    ] as [number, number, number][]) {
      const d = Math.abs(Math.hypot(x - cx, z - cz) - rr);
      out.multiplyScalar(1 - smoothstep(0.012, 0.002, d) * 0.2 * (y > top - 0.005 ? 1 : 0));
    }
    out.multiplyScalar(1 - smoothstep(r - 0.12, r, Math.hypot(x, z)) * 0.15);
  });
  // a turned pedestal on four splayed feet
  const legs = new Merger();
  legs.add(
    smoothLathe(
      [
        [0, 0.12],
        [0.1, 0.12],
        [0.085, 0.2],
        [0.06, 0.3],
        [0.075, 0.38],
        [0.055, 0.46],
        [0.05, 0.6],
        [0.07, 0.68],
        [0.09, 0.74],
        [0.16, top - 0.06],
        [0, top - 0.06],
      ],
      40,
      28,
    ),
  );
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    legs.add(tubeThrough([V(c * 0.05, 0.2, s * 0.05), V(c * 0.3, 0.12, s * 0.3), V(c * 0.48, 0.05, s * 0.48), V(c * 0.56, 0.03, s * 0.56)], (t) => 0.045 - t * 0.015, 16, 10).geometry);
  }
  return { slab, legs: legs.build() };
}

/** A stoneware mug of cocoa with a marshmallow or two. */
function mugGeometry(v: number) {
  return once(`ws:mug:${v}`, () => {
    const n = 40;
    const glazes = ['#2c4a6a', '#b8423a', '#e8dcc0', '#4a6a4a'];
    const glaze = C(glazes[v % glazes.length]);
    const g = smoothLathe(
      [
        [0, 0],
        [0.06, 0],
        [0.066, 0.008],
        [0.07, 0.1],
        [0.072, 0.15],
        [0.067, 0.152],
        [0.063, 0.14],
        [0.06, 0.03],
        [0, 0.025],
      ],
      n,
      32,
    );
    paintLathe(g, n, (x, y, z, along, out) => {
      out.copy(glaze).multiplyScalar(0.9 + 0.15 * noise3(x * 50, y * 50, z * 50));
      if (along < 0.15) out.set('#a8885a');
      if (along > 0.6 && y < 0.12) out.set('#5a2e16');
    });
    const m = new Merger().add(g);
    m.add(tubeThrough([V(0.068, 0.12, 0), V(0.11, 0.115, 0), V(0.115, 0.06, 0), V(0.068, 0.04, 0)], () => 0.011, 16, 6).geometry, undefined, glaze);
    // cocoa froth and marshmallows
    m.add(new THREE.CylinderGeometry(0.06, 0.06, 0.004, 24), trs([0, 0.12, 0]), C('#8a5a36'));
    const r = rand(v + 2);
    for (let k = 0; k < 2 + (v % 2); k++) m.add(new THREE.CylinderGeometry(0.018, 0.018, 0.022, 12, 1), trs([(r() - 0.5) * 0.06, 0.128, (r() - 0.5) * 0.06], [r(), r() * 3, r()]), C('#f8f2ea'));
    return m.build();
  });
}

/** An enamel jug, blue speckled, and a plate of gingerbread stars and rounds with white icing. */
function jugAndPlate() {
  const m = new Merger();
  const n = 50;
  const jug = smoothLathe(
    [
      [0, 0],
      [0.08, 0],
      [0.09, 0.01],
      [0.1, 0.08],
      [0.092, 0.17],
      [0.07, 0.22],
      [0.065, 0.24],
      [0.08, 0.26],
      [0.074, 0.265],
      [0.06, 0.25],
      [0.06, 0.03],
      [0, 0.025],
    ],
    n,
    36,
  );
  paintLathe(jug, n, (x, y, z, along, out) => {
    out.set('#2e5a8a');
    if (worleyLite(x * 40, y * 40, z * 40) < 0.2) out.set('#e8eef4');
    if (along > 0.6) out.set('#f2f4f6');
    if (Math.abs(y - 0.262) < 0.006) out.set('#1a2a3a');
  });
  m.add(jug);
  m.add(tubeThrough([V(-0.09, 0.2, 0), V(-0.15, 0.18, 0), V(-0.15, 0.08, 0), V(-0.1, 0.06, 0)], () => 0.012, 16, 6).geometry, undefined, C('#2e5a8a'));
  const plate = smoothLathe(
    [
      [0, 0],
      [0.11, 0],
      [0.12, 0.01],
      [0.2, 0.025],
      [0.21, 0.035],
      [0.2, 0.037],
      [0.12, 0.02],
      [0, 0.018],
    ],
    30,
    40,
  );
  paintLathe(plate, 30, (x, _y, z, _a, out) => {
    out.set('#f0eadc');
    const rr = Math.hypot(x, z);
    if (Math.abs(rr - 0.185) < 0.008) out.set('#b8423a');
  });
  m.add(plate, trs([0.32, 0, 0.05]));
  const r = rand(4);
  for (let k = 0; k < 6; k++) {
    const star = k % 2 === 0;
    let shape: THREE.Shape;
    if (star) {
      shape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rr = i % 2 ? 0.022 : 0.045;
        if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      shape.closePath();
    } else {
      shape = new THREE.Shape();
      shape.absarc(0, 0, 0.038, 0, Math.PI * 2, false);
    }
    const cookie = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 10 }).rotateX(-Math.PI / 2);
    paint(cookie, (x, y, z, out) => {
      out.set('#a8642a').multiplyScalar(0.85 + 0.25 * noise3(x * 90, y * 90, z * 90));
      // white icing piped round the edge, and dots
      const rr = Math.hypot(x, z);
      if (y > 0.012 && (Math.abs(rr - (star ? 0.026 : 0.028)) < 0.004 || rr < 0.006)) out.set('#f8f4ec');
    });
    m.add(cookie, trs([0.32 + (r() - 0.5) * 0.18, 0.025 + (k > 3 ? 0.015 : 0), 0.05 + (r() - 0.5) * 0.18], [0, r() * 3, (r() - 0.5) * 0.2]));
  }
  return m.build();
}

function worleyLite(x: number, y: number, z: number) {
  const fx = x - Math.floor(x) - 0.5;
  const fy = y - Math.floor(y) - 0.5;
  const fz = z - Math.floor(z) - 0.5;
  const h = Math.abs(Math.sin(Math.floor(x) * 12.9 + Math.floor(y) * 78.2 + Math.floor(z) * 37.7) * 43758.5);
  return Math.hypot(fx, fy, fz) + (h - Math.floor(h)) * 0.4;
}

/** A candle in a brass chamberstick (its flame is a glow). */
function candleGeometries() {
  return once('ws:candle', () => {
    const brass = smoothLathe(
      [
        [0, 0],
        [0.09, 0],
        [0.095, 0.01],
        [0.08, 0.02],
        [0.03, 0.025],
        [0.028, 0.06],
        [0.035, 0.065],
        [0.03, 0.07],
        [0, 0.07],
      ],
      20,
      28,
    );
    const wax = smoothLathe(
      [
        [0, 0.06],
        [0.024, 0.06],
        [0.024, 0.19],
        [0.018, 0.2],
        [0.02, 0.206],
        [0, 0.2],
      ],
      12,
      18,
    );
    paint(wax, (_x, y, _z, out) => out.set('#f2e8d2').multiplyScalar(y > 0.19 ? 0.85 : 1));
    return { brass, wax };
  });
}

// ---------- seats ----------

/** The long bench behind the table: a plank seat on splayed legs with a quilted patchwork cushion along it. */
function settleGeometries() {
  const wood = new Merger();
  const r = rand(29);
  const { x0, x1, z, depth } = SETTLE;
  const seatY = SEATS[0].y - 0.075;
  const cx = (x0 + x1) / 2;
  wood.add(plank(x1 - x0, 0.06, depth, 0.02, [1 / 2.2, 1 / 1.2], 2, [r(), r()]), trs([cx, seatY - 0.03, z]));
  for (const x of [x0 + 0.18, x1 - 0.18])
    for (const s of [-1, 1]) wood.add(plank(0.07, seatY - 0.06, 0.07, 0.015, [1 / 1.4, 1 / 1.4], 2, [r(), r()], true), trs([x, (seatY - 0.06) / 2, z + s * (depth / 2 - 0.08)], [s * 0.08, 0, 0]));
  wood.add(plank(x1 - x0 - 0.36, 0.06, 0.05, 0.012), trs([cx, 0.16, z]));
  for (const x of [x0 + 0.18, x1 - 0.18]) wood.add(plank(0.05, 0.06, depth - 0.1, 0.012), trs([x, 0.16, z]));
  // the cushion: a long slab, softly rounded and a little dented where people sit
  const cushion = new THREE.BoxGeometry(x1 - x0 - 0.06, 0.08, depth - 0.04, 40, 2, 8);
  const p = cushion.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const zz = p.getZ(i);
    const ex = Math.max(0, Math.abs(x) - (x1 - x0) / 2 + 0.12) / 0.12;
    const ez = Math.max(0, Math.abs(zz) - depth / 2 + 0.1) / 0.1;
    const round = Math.min(1, Math.hypot(ex, ez));
    let yy = y > 0 ? y - round * round * 0.03 : y;
    // dents where the two sitters go
    for (const sx of [SEATS[0].x, SEATS[2].x]) if (y > 0) yy -= 0.015 * Math.exp(-((x + cx - sx) ** 2) / 0.05);
    p.setY(i, yy);
  }
  cushion.computeVertexNormals();
  mapUV(cushion, (x, y, zz) => [x / 1.2, zz / 1.2 + y]);
  paint(cushion, (x, y, zz, out) => out.setScalar(0.9 + 0.12 * noise3(x * 6, y * 6, zz * 6)));
  return { wood: wood.build(), cushion: cushion.translate(cx, seatY + 0.04, z) };
}

/** A small oak barrel turned stool, iron-hooped, with a knitted cushion. */
function barrelGeometries() {
  const n = 40;
  const h = SEATS[1].y - 0.06;
  const staves = smoothLathe(
    [
      [0, 0],
      [0.24, 0],
      [0.26, 0.03],
      [0.285, h * 0.5],
      [0.26, h - 0.03],
      [0.24, h],
      [0, h],
    ],
    n,
    48,
  );
  mapUV(staves, (x, y, z) => [Math.atan2(z, x) * 2, y * 2]);
  paintLathe(staves, n, (x, y, z, _a, out) => {
    const a = Math.atan2(z, x);
    out.setScalar(0.85 + 0.2 * noise3(x * 8, y * 4, z * 8));
    // the joints between staves
    if (Math.abs(((a / (Math.PI * 2)) * 18) % 1) < 0.04) out.multiplyScalar(0.55);
  });
  const hoops = new Merger();
  for (const y of [0.05, 0.15, h - 0.15, h - 0.05]) {
    const rr = 0.24 + Math.sin((y / h) * Math.PI) * 0.045;
    hoops.add(new THREE.TorusGeometry(rr + 0.004, 0.009, 6, 48).rotateX(Math.PI / 2), trs([0, y, 0]), C('#2a2420'));
  }
  const cushion = smoothLathe(
    [
      [0, 0],
      [0.23, 0],
      [0.26, 0.02],
      [0.25, 0.05],
      [0.2, 0.068],
      [0, 0.072],
    ],
    16,
    40,
  );
  mapUV(cushion, (x, _y, z) => [x * 3, z * 3]);
  paint(cushion, (_x, _y, _z, out) => out.set('#b8423a'));
  return { staves, hoops: hoops.build(), cushion: cushion.translate(0, h - 0.005, 0) };
}

/** A rocking chair built facing +z: turned posts, a spindle back, bowed rockers, a knitted cushion and a crocheted blanket over the back. */
function rockerGeometries() {
  const wood = new Merger();
  const seatY = SEATS[3].y - 0.09;
  const w = 0.66;
  const d = 0.56;
  const R = 2.0;
  // rockers along z
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const zz = -0.62 + t * 1.15;
      pts.push(V((s * w) / 2 - s * 0.02, R - Math.sqrt(R * R - (zz - 0.0) ** 2) + 0.035, zz));
    }
    wood.add(tubeThrough(pts, () => 0.03, 30, 8).geometry);
  }
  // front legs and back posts, the seat frame
  const leg = (x: number, z: number, y0: number, y1: number, lean = 0) => wood.add(tubeThrough([V(x, y0, z), V(x, (y0 + y1) / 2, z - lean * 0.5), V(x, y1, z - lean)], (t) => 0.026 - Math.abs(t - 0.5) * 0.01, 12, 10).geometry);
  for (const s of [-1, 1]) {
    leg((s * w) / 2 - s * 0.02, d / 2 - 0.04, 0.06, seatY + 0.02);
    leg((s * w) / 2 - s * 0.02, -d / 2 + 0.04, 0.06, seatY + 1.0, 0.16);
    wood.add(new THREE.SphereGeometry(0.035, 12, 8), trs([(s * w) / 2 - s * 0.02, seatY + 1.02, -d / 2 + 0.04 - 0.16]));
  }
  wood.add(plank(w, 0.05, d, 0.02, [1 / 1.4, 1 / 1.4]), trs([0, seatY - 0.025, 0]));
  // the back: a curved crest rail and spindles
  const crest: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    crest.push(V(-w / 2 + 0.02 + t * (w - 0.04), seatY + 0.92 + Math.sin(t * Math.PI) * 0.06, -d / 2 + 0.04 - 0.15 - Math.sin(t * Math.PI) * 0.03));
  }
  wood.add(tubeThrough(crest, () => 0.035, 24, 8).geometry);
  for (let k = 0; k < 5; k++) {
    const x = -w / 2 + 0.13 + k * ((w - 0.26) / 4);
    wood.add(tubeThrough([V(x, seatY, -d / 2 + 0.05), V(x, seatY + 0.92, -d / 2 + 0.04 - 0.15)], () => 0.014, 2, 8).geometry);
  }
  // stretchers between the legs
  for (const zz of [d / 2 - 0.04, -d / 2 + 0.04]) wood.add(tubeThrough([V(-w / 2 + 0.02, 0.2, zz), V(w / 2 - 0.02, 0.2, zz)], () => 0.014, 2, 8).geometry);
  // the cushion and the blanket draped over the back
  const cushion = new THREE.BoxGeometry(w - 0.06, 0.07, d - 0.06, 8, 2, 8);
  const p = cushion.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) - (Math.abs(p.getX(i)) / w) ** 2 * 0.06 - (Math.abs(p.getZ(i)) / d) ** 2 * 0.06);
  cushion.computeVertexNormals();
  mapUV(cushion, (x, _y, z) => [x * 2, z * 2]);
  paint(cushion, (_x, _y, _z, out) => out.set('#4a6a9a'));
  cushion.translate(0, seatY + 0.035, 0.01);
  const N = 14;
  const blanket = new THREE.PlaneGeometry(w - 0.02, 1.0, N, 20);
  const bp = blanket.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const v = (bp.getY(i) + 0.5) / 1.0;
    // over the crest: the top third hangs down the back, the rest down the front of the back
    const s = v * 1.0;
    let y: number;
    let z: number;
    const crestY = seatY + 0.98;
    const crestZ = -d / 2 - 0.12;
    if (s < 0.22) {
      y = crestY - (0.22 - s) * 1.4;
      z = crestZ - 0.06;
    } else {
      const t = (s - 0.22) / 0.78;
      y = crestY + 0.03 - t * 0.62;
      z = crestZ + 0.05 + t * 0.14;
    }
    bp.setXYZ(i, x * (1 + 0.04 * Math.sin(v * 9)), y + Math.sin(x * 14) * 0.008, z + Math.sin(x * 9 + v * 6) * 0.015);
  }
  blanket.computeVertexNormals();
  mapUV(blanket, (x, y) => [x * 1.6, y * 1.6]);
  const squares = ['#b8423a', '#e6b02e', '#4a6a9a', '#3a8350', '#e2899a', '#dc6f2a'];
  paint(blanket, (x, y, _z, out) => {
    const gx = Math.floor((x + 0.4) / 0.13);
    const gy = Math.floor((y + 2) / 0.13);
    const fx = ((x + 0.4) / 0.13) % 1;
    const fy = ((y + 2) / 0.13) % 1;
    const ring = Math.max(Math.abs(fx - 0.5), Math.abs(fy - 0.5));
    out.set(ring > 0.42 ? '#2a2420' : ring > 0.28 ? squares[(gx + gy * 3) % squares.length] : ring > 0.15 ? squares[(gx * 2 + gy + 1) % squares.length] : '#efe3c8');
  });
  return { wood: wood.build(), cushion, blanket: twoSided(blanket) };
}

// ---------- the rug ----------

function rugGeometry() {
  const segs = 96;
  const rings = 24;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      // an oval, its edge rolling down to the floor
      pos.push(Math.cos(a) * RUG.rx * v, 0.008 - (v > 0.97 ? (0.005 * (v - 0.97)) / 0.03 : 0), Math.sin(a) * RUG.rz * v);
      uv.push(i / segs, v);
      if (i < segs && j < rings) {
        const a0 = j * (segs + 1) + i;
        idx.push(a0, a0 + 1, a0 + segs + 1, a0 + 1, a0 + segs + 2, a0 + segs + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return paint(g, (x, _y, z, out) => out.setScalar(0.85 + 0.15 * fbm3(x * 2, 1, z * 2)));
}

// ---------- the cat ----------

/** A grey tabby with white socks, curled nose-to-tail. About 0.5 across, lying on y = 0. */
function catGeometry() {
  return cached('ws-cat', () => {
    const body = ellipsoid(0, 0.1, 0, 0.19, 0.105, 0.16);
    const haunch = ellipsoid(-0.09, 0.105, -0.05, 0.12, 0.1, 0.12);
    const head = ellipsoid(0.11, 0.12, 0.12, 0.08, 0.07, 0.08);
    const muzzle = ellipsoid(0.13, 0.1, 0.18, 0.04, 0.03, 0.03);
    const ears = [cone(0.07, 0.17, 0.1, 0.05, 0.23, 0.09, 0.03, 0.005), cone(0.15, 0.17, 0.1, 0.18, 0.225, 0.09, 0.03, 0.005)];
    const paw = ellipsoid(0.02, 0.03, 0.17, 0.05, 0.03, 0.04);
    const tail = chain(
      [
        [-0.22, 0.06, -0.06],
        [-0.2, 0.04, 0.1],
        [-0.08, 0.04, 0.19],
        [0.05, 0.05, 0.22],
        [0.16, 0.06, 0.2],
      ],
      0.038,
      0.024,
      0.02,
    );
    const sdf: SDF = (x, y, z) => {
      let d = smin(body(x, y, z), haunch(x, y, z), 0.06);
      d = smin(d, head(x, y, z), 0.04);
      d = smin(d, muzzle(x, y, z), 0.02);
      for (const e of ears) d = smin(d, e(x, y, z), 0.012);
      d = smin(d, paw(x, y, z), 0.03);
      d = smin(d, tail(x, y, z), 0.025);
      d = smin(d, sphere(0.07, 0.04, 0.16, 0.035)(x, y, z), 0.02);
      d += 0.003 * noise3(x * 60, y * 60, z * 60);
      return Math.max(d, -y);
    };
    const grey = C('#8a8680');
    const dark = C('#3e3a36');
    const white = C('#f2eee6');
    const pink = C('#e0a0a0');
    return meshSDF(sdf, {
      min: [-0.3, -0.01, -0.2],
      max: [0.26, 0.26, 0.28],
      cell: 0.0065,
      paint: (x, y, z, _nx, ny, _nz, out) => {
        out.copy(grey);
        const stripe = Math.sin(x * 50 + noise3(x * 8, y * 8, z * 8) * 3) * 0.5 + 0.5;
        mix(out, out, dark, smoothstep(0.5, 0.85, stripe) * 0.75 * smoothstep(0.03, 0.1, y));
        const sock = Math.hypot(x - 0.03, y - 0.03, z - 0.18) < 0.06 || Math.hypot(x - 0.07, y - 0.04, z - 0.17) < 0.05;
        const chin = Math.hypot(x - 0.13, y - 0.08, z - 0.18) < 0.04;
        if (sock || chin) out.copy(white);
        mix(out, out, white, smoothstep(0.0, -0.6, ny) * 0.3);
        if (y > 0.19 && z > 0.06) mix(out, out, pink, 0.35);
        if (Math.hypot(x - 0.135, y - 0.112, z - 0.205) < 0.011) out.copy(pink);
        if (x > 0.1 && z > 0.17 && y < 0.08 && x < 0.2) mix(out, out, dark, 0.5);
      },
    });
  });
}

function SleepingCat({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const g = catGeometry();
  const m = cornerMats();
  const eyes = useMemo(
    () =>
      once('ws:cat-eyes', () => {
        const e = new Merger();
        for (const s of [-1, 1]) {
          const cx = 0.11 + s * 0.035;
          e.add(tubeThrough([V(cx - 0.016, 0.135, 0.185), V(cx, 0.13, 0.19), V(cx + 0.016, 0.135, 0.186)], () => 0.0032, 8, 4).geometry);
        }
        return paintFlat(e.build(), '#2a2420');
      }),
    [],
  );
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!body.current) return;
    const b = Math.sin(clock.elapsedTime * 1.5) * 0.5 + 0.5;
    body.current.scale.set(1 + b * 0.012, 1 + b * 0.035, 1 + b * 0.02);
  });
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={1.2}>
      <group ref={body}>
        <mesh geometry={g} material={m.fur} castShadow receiveShadow />
        <mesh geometry={eyes} material={m.fur} />
      </group>
    </group>
  );
}

// ---------- assembled ----------

function StoveFire({ m }: { m: KMats }) {
  const fire = useMemo(() => new THREE.MeshBasicMaterial({ map: fireTex(), color: new THREE.Color(1, 1, 1), toneMapped: false }), []);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ map: softDot(), color: new THREE.Color('#ff7a2a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.5 }), []);
  const vent = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a1a'), toneMapped: false }), []);
  const glow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const f = stoveFlicker(clock.elapsedTime);
    fire.color.setScalar(1.25 * f);
    vent.color.setRGB(1.4 * f, 0.42 * f, 0.1 * f);
    glowMat.opacity = 0.42 * f;
    if (glow.current) glow.current.scale.setScalar(1 + (f - 1) * 0.6);
  });
  const g = stoveGeometries();
  return (
    <group position={[STOVE.x, 0.05, STOVE.z]} rotation={[0, STOVE_YAW, 0]}>
      <mesh geometry={g.iron} material={m.iron} castShadow receiveShadow />
      <mesh geometry={g.nickel} material={m.nickel} castShadow />
      {/* the fire through the mica window in the door, and through the ash door's vents */}
      <mesh material={fire} position={[0, 0.74, 0.452]}>
        <planeGeometry args={[0.24, 0.17]} />
      </mesh>
      {[-0.06, -0.02, 0.02, 0.06].map((x) => (
        <mesh key={x} material={vent} position={[x, 0.4, 0.392]}>
          <planeGeometry args={[0.02, 0.06]} />
        </mesh>
      ))}
      {/* warm light pooled on the hearth in front of the door */}
      <mesh ref={glow} material={glowMat} position={[0, 0.006, 0.75]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <planeGeometry args={[1.15, 0.95]} />
      </mesh>
    </group>
  );
}

export function WarmCorner() {
  const m = cornerMats();
  const geo = useMemo(
    () =>
      once('ws:corner', () => ({
        kettle: kettleGeometries(),
        logs: logGeometries(),
        irons: fireIrons(),
        table: tableGeometries(),
        jug: jugAndPlate(),
        candle: candleGeometries(),
        settle: settleGeometries(),
        barrel: barrelGeometries(),
        rocker: rockerGeometries(),
        rug: rugGeometry(),
      })),
    [],
  );
  const stove = stoveGeometries();
  const flame = useMemo(() => new THREE.MeshBasicMaterial({ map: softDot(), color: new THREE.Color('#ffc870').multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  const flameRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (flameRef.current) flameRef.current.scale.set(0.05, 0.09 * (1 + 0.08 * Math.sin(t * 5.3) + 0.05 * Math.sin(t * 8.1)), 1);
  });
  // the mugs, each on the table's edge toward a seat
  const mugs = SEATS.map((s, i) => {
    const dx = s.x - TABLE.x;
    const dz = s.z - TABLE.z;
    const d = Math.hypot(dx, dz);
    return { x: TABLE.x + (dx / d) * 0.6, z: TABLE.z + (dz / d) * 0.6, v: i };
  });
  const s3 = SEATS[3];
  const s1 = SEATS[1];
  return (
    <group>
      <StoveFire m={m} />
      <BelowCeiling>
        <mesh geometry={stove.pipe} material={m.iron} position={[STOVE.x, 0.05, STOVE.z]} castShadow />
      </BelowCeiling>
      <group position={[STOVE.x, 1.38, STOVE.z]} rotation={[0, STOVE_YAW - 0.6, 0]}>
        <mesh geometry={geo.kettle.copper} material={m.copper} castShadow />
        <mesh geometry={geo.kettle.grip} material={m.oak} />
      </group>
      <Steam position={[STOVE.x + 0.17, 1.62, STOVE.z + 0.16]} count={6} height={1.1} spread={0.12} size={0.32} opacity={0.1} speed={0.07} seed={4} />
      <mesh geometry={geo.logs} material={m.logs} castShadow receiveShadow />
      <mesh geometry={geo.irons} material={m.iron} castShadow />
      <mesh geometry={geo.rug} material={m.rug} position={[RUG.x, 0, RUG.z]} receiveShadow userData={{ surface: 'floor' }} />
      <group position={[TABLE.x, 0, TABLE.z]}>
        <mesh geometry={geo.table.slab} material={m.table} castShadow receiveShadow userData={{ surface: 'top' }} />
        <mesh geometry={geo.table.legs} material={m.table} castShadow receiveShadow />
      </group>
      {mugs.map((mg) => (
        <mesh key={mg.v} geometry={mugGeometry(mg.v)} material={m.glaze} position={[mg.x, TABLE.top, mg.z]} rotation={[0, mg.v * 1.7, 0]} castShadow receiveShadow />
      ))}
      <Steam position={[mugs[0].x, TABLE.top + 0.16, mugs[0].z]} count={4} height={0.55} spread={0.04} size={0.14} opacity={0.08} speed={0.06} seed={2} />
      <Steam position={[mugs[2].x, TABLE.top + 0.16, mugs[2].z]} count={4} height={0.55} spread={0.04} size={0.14} opacity={0.08} speed={0.06} seed={7} />
      <mesh geometry={geo.jug} material={m.glaze} position={[TABLE.x - 0.22, TABLE.top, TABLE.z + 0.02]} rotation={[0, 0.6, 0]} castShadow receiveShadow />
      <group position={[TABLE.x + 0.12, TABLE.top, TABLE.z + 0.3]}>
        <mesh geometry={geo.candle.brass} material={m.copper} castShadow />
        <mesh geometry={geo.candle.wax} material={m.glaze} castShadow />
        <mesh ref={flameRef} material={flame} position={[0, 0.245, 0]} renderOrder={3}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </group>
      <mesh geometry={geo.settle.wood} material={m.oak} castShadow receiveShadow />
      <mesh geometry={geo.settle.cushion} material={m.quilt} castShadow receiveShadow />
      <group position={[s1.x, 0, s1.z]}>
        <mesh geometry={geo.barrel.staves} material={m.oak} castShadow receiveShadow />
        <mesh geometry={geo.barrel.hoops} material={m.iron} castShadow />
        <mesh geometry={geo.barrel.cushion} material={m.cloth} castShadow receiveShadow />
      </group>
      <group position={[s3.x, 0, s3.z]} rotation={[0, s3.yaw, 0]}>
        <mesh geometry={geo.rocker.wood} material={m.oak} castShadow receiveShadow />
        <mesh geometry={geo.rocker.cushion} material={m.cloth} castShadow receiveShadow />
        <mesh geometry={geo.rocker.blanket} material={m.cloth} castShadow receiveShadow />
      </group>
      {/* the cat, asleep on the side window's deep sill by the stove */}
      <SleepingCat position={[ROOM.x0 + 0.1, WIN_SIDE.y0 + 0.002, WIN_SIDE.z0 + 0.55]} rotation={Math.PI / 2 + 0.25} />
    </group>
  );
}

