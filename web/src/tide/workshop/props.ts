import * as THREE from 'three';
import { mergeParts, paintGeometry } from '../../tank/geo';
import { cached } from '../../tank/sdf';
import { noise3, rng } from '../../tank/util';

// The toymakers' things, in cook metres (see crew/plan.ts): a hand saw, a
// hammer, a plank, the toy train car in progress, a blueprint, a parts tray,
// a sanding block, a ruler and pencil, a paintbrush and a little wooden robot.
// Smooth extruded and lathed shapes, painted per vertex.

const lathe = (pts: [number, number][], seg = 24) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );

function roundedBox(w: number, h: number, d: number, r: number) {
  const s = new THREE.Shape();
  const x = w / 2 - r;
  const z = d / 2 - r;
  s.moveTo(-x, -d / 2);
  s.lineTo(x, -d / 2);
  s.quadraticCurveTo(w / 2, -d / 2, w / 2, -z);
  s.lineTo(w / 2, z);
  s.quadraticCurveTo(w / 2, d / 2, x, d / 2);
  s.lineTo(-x, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, z);
  s.lineTo(-w / 2, -z);
  s.quadraticCurveTo(-w / 2, -d / 2, -x, -d / 2);
  const bevel = Math.min(h * 0.3, r * 0.7);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, h - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 5 });
  g.rotateX(-Math.PI / 2).translate(0, bevel, 0);
  return g;
}

const woodPaint =
  (base: [number, number, number], along: 'x' | 'z' = 'x', freq = 260) =>
  (x: number, y: number, z: number, out: THREE.Color) => {
    const u = along === 'x' ? z : x;
    const grain = 0.5 + 0.5 * Math.sin(u * freq + noise3(x * 30, y * 30, z * 30) * 3);
    out.setRGB(base[0], base[1], base[2]).multiplyScalar(0.84 + 0.16 * grain);
  };

// ---------- materials ----------

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  return {
    painted: new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    wood: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.75 }),
    steel: new THREE.MeshStandardMaterial({ color: '#c8ccd3', metalness: 0.9, roughness: 0.28 }),
    paper: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide }),
    cocoa: new THREE.MeshStandardMaterial({ color: '#5b3a26', roughness: 0.3 }),
    dust: new THREE.MeshBasicMaterial({ color: '#d9b989', transparent: true, opacity: 0.85, depthWrite: false }),
  };
}
export const shopMats = () => (mats ??= makeMats());

// ---------- tools ----------

/** A hand saw: the grip at the origin, the blade forward (+z), teeth down; about 0.22 long. */
export function sawGeometry() {
  return cached('shop-saw', () => {
    const s = new THREE.Shape();
    // the blade in (z, y), tapering toward the tip, a row of teeth along the bottom
    s.moveTo(0.025, 0.018);
    s.lineTo(0.2, 0.006);
    s.lineTo(0.2, -0.012);
    for (let i = 0; i <= 30; i++) {
      const z = 0.2 - (i / 30) * 0.175;
      s.lineTo(z, -0.016 - (i % 2) * 0.004);
    }
    s.lineTo(0.025, -0.024);
    s.lineTo(0.025, 0.018);
    const blade = new THREE.ExtrudeGeometry(s, { depth: 0.0015, bevelEnabled: false, curveSegments: 4 });
    blade.rotateY(-Math.PI / 2).translate(0.00075, 0, 0);
    paintGeometry(blade, (_x, y, _z, out) => out.setRGB(0.6, 0.62, 0.67).multiplyScalar(0.85 + 0.35 * Math.max(0, -y - 0.012) * 40));
    const grip = roundedBox(0.012, 0.05, 0.045, 0.01).rotateX(Math.PI / 2).translate(0, 0.0, -0.002);
    paintGeometry(grip, woodPaint([0.62, 0.36, 0.2], 'x', 400));
    const rivets = [0.008, -0.008].map((y) => new THREE.CylinderGeometry(0.003, 0.003, 0.016, 8).rotateZ(Math.PI / 2).translate(0, y, 0.028));
    rivets.forEach((r) => paintGeometry(r, (_x, _y, _z, out) => out.setRGB(0.85, 0.7, 0.35)));
    return mergeParts([blade, grip, ...rivets], ['position', 'normal', 'color']).scale(1.5, 1.5, 1.5);
  });
}

/** A claw hammer: the grip at the origin, the handle forward (+z), the head at its end with the striking face down. */
export function hammerGeometry() {
  return cached('shop-hammer', () => {
    const handle = lathe(
      [
        [0, -0.02],
        [0.0085, -0.02],
        [0.009, 0.0],
        [0.0075, 0.06],
        [0.0068, 0.1],
        [0, 0.1],
      ],
      14,
    ).rotateX(Math.PI / 2);
    paintGeometry(handle, woodPaint([0.72, 0.5, 0.3], 'z', 300));
    const head = new THREE.CylinderGeometry(0.0115, 0.0125, 0.045, 14).translate(0, -0.012, 0).translate(0, 0, 0.105);
    const claw = new THREE.CylinderGeometry(0.004, 0.008, 0.035, 8).rotateX(-0.6).translate(0, 0.02, 0.098);
    const h = mergeParts([head, claw], ['position', 'normal']);
    paintGeometry(h, (_x, y, _z, out) => out.setRGB(0.36, 0.37, 0.4).multiplyScalar(y < -0.03 ? 1.7 : 1));
    return mergeParts([handle, h], ['position', 'normal', 'color']).scale(1.5, 1.5, 1.5);
  });
}

/** A plank lying along x on y = 0: 0.39 long, 0.085 wide. */
export function plankGeometry() {
  return cached('shop-plank', () => paintGeometry(roundedBox(0.39, 0.026, 0.085, 0.005), woodPaint([0.86, 0.68, 0.46], 'x', 240)));
}

/** The toy in progress: a little wooden train engine (0.13 long), base on y = 0, facing +x. */
export function trainGeometry() {
  return cached('shop-train', () => {
    const boiler = new THREE.CylinderGeometry(0.022, 0.022, 0.07, 18).rotateZ(Math.PI / 2).translate(0.015, 0.042, 0);
    paintGeometry(boiler, (_x, _y, _z, out) => out.setRGB(0.78, 0.22, 0.18));
    const cab = roundedBox(0.045, 0.055, 0.05, 0.006).translate(-0.04, 0.02, 0);
    paintGeometry(cab, (x, y, _z, out) => out.setRGB(0.22, 0.38, 0.62).multiplyScalar(y > 0.065 ? 0.8 : 1 + 0 * x));
    const base = roundedBox(0.13, 0.014, 0.05, 0.005).translate(0, 0.012, 0);
    paintGeometry(base, woodPaint([0.82, 0.62, 0.4], 'x'));
    const chimney = lathe(
      [
        [0, 0],
        [0.008, 0],
        [0.008, 0.02],
        [0.012, 0.028],
        [0, 0.028],
      ],
      14,
    ).translate(0.035, 0.06, 0);
    paintGeometry(chimney, (_x, _y, _z, out) => out.setRGB(0.2, 0.2, 0.22));
    const wheels: THREE.BufferGeometry[] = [];
    for (const x of [-0.04, 0.035])
      for (const z of [-0.027, 0.027]) {
        const w = new THREE.CylinderGeometry(0.014, 0.014, 0.008, 16).rotateX(Math.PI / 2).translate(x, 0.014, z);
        paintGeometry(w, (px, py, _z, out) => out.setRGB(0.95, 0.8, 0.3).multiplyScalar(Math.hypot(px - x, py - 0.014) < 0.005 ? 0.5 : 1));
        wheels.push(w);
      }
    return mergeParts([base, boiler, cab, chimney, ...wheels], ['position', 'normal', 'color']).scale(1.4, 1.4, 1.4);
  });
}

const printTex = new Map<number, THREE.CanvasTexture>();
/** A blueprint: blue paper, a white grid and the outline of a toy (nothing readable). */
export function blueprintTexture(seed: number) {
  let t = printTex.get(seed % 3);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = rng(seed * 11 + 2);
  g.fillStyle = '#2a5a9a';
  g.fillRect(0, 0, 192, 128);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  for (let x = 0; x < 192; x += 12) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  for (let y = 0; y < 128; y += 12) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(192, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  // a toy engine in side view: body, cab, chimney, wheels, and a few dimension lines
  g.strokeRect(50, 52, 70, 26);
  g.strokeRect(112, 38, 30, 40);
  g.strokeRect(66, 34, 10, 18);
  for (const x of [64, 98, 130]) {
    g.beginPath();
    g.arc(x, 86, 9, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(50, 108);
  g.lineTo(142, 108);
  g.moveTo(50, 104);
  g.lineTo(50, 112);
  g.moveTo(142, 104);
  g.lineTo(142, 112);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(14, 14 + i * 7, 20 + r() * 16, 2);
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  printTex.set(seed % 3, t);
  return t;
}

/** A blueprint sheet, 0.28 x 0.19, gently curled, facing +z. */
export function blueprintGeometry() {
  return cached('shop-blueprint', () => {
    const g = new THREE.PlaneGeometry(0.28, 0.19, 10, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, -0.02 * Math.pow(p.getX(i) / 0.14, 2));
    g.computeVertexNormals();
    return g;
  });
}

/** A rolled blueprint lying along x on y = 0. */
export function blueprintRollGeometry() {
  return cached('shop-blueprint-roll', () => {
    const g = new THREE.CylinderGeometry(0.013, 0.013, 0.2, 16).rotateZ(Math.PI / 2).translate(0, 0.013, 0);
    paintGeometry(g, (x, y, z, out) => {
      out.setRGB(0.18, 0.38, 0.66);
      if (Math.abs(x) > 0.097) out.setRGB(0.85, 0.88, 0.95);
      if (Math.abs(Math.atan2(y - 0.013, z)) > 2.9) out.multiplyScalar(0.8);
    });
    return g;
  });
}

/** A parts tray: a little wooden box of wheels, pegs and gears, base on y = 0 (0.12 x 0.08). */
export function partsTrayGeometry() {
  return cached('shop-tray', () => {
    const parts: THREE.BufferGeometry[] = [];
    const wall = (w: number, d: number, x: number, z: number) => parts.push(paintGeometry(new THREE.BoxGeometry(w, 0.028, d).translate(x, 0.014, z), woodPaint([0.7, 0.5, 0.32], w > d ? 'x' : 'z')));
    parts.push(paintGeometry(new THREE.BoxGeometry(0.12, 0.004, 0.08).translate(0, 0.002, 0), woodPaint([0.62, 0.44, 0.28])));
    wall(0.12, 0.005, 0, -0.0375);
    wall(0.12, 0.005, 0, 0.0375);
    wall(0.005, 0.08, -0.0575, 0);
    wall(0.005, 0.08, 0.0575, 0);
    wall(0.004, 0.07, -0.019, 0);
    wall(0.004, 0.07, 0.019, 0);
    const r = rng(9);
    // wheels in the left compartment, pegs in the middle, gears on the right
    for (let i = 0; i < 6; i++) {
      const w = new THREE.CylinderGeometry(0.011, 0.011, 0.006, 14).rotateX(Math.PI / 2 - 0.4 + r() * 0.8).translate(-0.038 + (r() - 0.5) * 0.02, 0.012 + i * 0.002, (r() - 0.5) * 0.05);
      parts.push(paintGeometry(w, (_x, _y, _z, out) => out.setRGB(0.95, 0.78, 0.3)));
    }
    for (let i = 0; i < 7; i++) {
      const p = new THREE.CylinderGeometry(0.0035, 0.0035, 0.03, 8).rotateZ(Math.PI / 2 + (r() - 0.5) * 0.6).rotateY(r() * Math.PI).translate((r() - 0.5) * 0.02, 0.01 + i * 0.002, (r() - 0.5) * 0.05);
      parts.push(paintGeometry(p, (_x, _y, _z, out) => out.setRGB(0.86, 0.68, 0.46)));
    }
    for (let i = 0; i < 3; i++) {
      const g = gearGeometry().clone().translate(0.038 + (r() - 0.5) * 0.015, 0.008 + i * 0.004, -0.02 + i * 0.02);
      parts.push(g);
    }
    return mergeParts(parts, ['position', 'normal', 'color']).scale(1.3, 1.3, 1.3);
  });
}

/** A small gear, flat, base on y = 0. */
export function gearGeometry() {
  return cached('shop-gear', () => {
    const s = new THREE.Shape();
    const n = 10;
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? 0.0105 : 0.0135;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.003, 0, Math.PI * 2, true);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2);
    paintGeometry(g, (_x, _y, _z, out) => out.setRGB(0.55, 0.42, 0.25));
    return g;
  });
}

/** A toy wheel, held up to look at: a disc on its edge (facing +z). */
export function wheelGeometry() {
  return cached('shop-wheel', () => {
    const g = new THREE.CylinderGeometry(0.014, 0.014, 0.008, 18).rotateX(Math.PI / 2);
    paintGeometry(g, (x, y, _z, out) => out.setRGB(0.95, 0.78, 0.3).multiplyScalar(Math.hypot(x, y) < 0.005 ? 0.5 : 1));
    return g;
  });
}

/** A sanding block: wood on top, sandpaper underneath; 0.05 x 0.03, base on y = 0. */
export function sandingBlockGeometry() {
  return cached('shop-sander', () => {
    const top = paintGeometry(roundedBox(0.05, 0.016, 0.03, 0.004).translate(0, 0.003, 0), woodPaint([0.75, 0.55, 0.35]));
    const paper = paintGeometry(new THREE.BoxGeometry(0.052, 0.003, 0.032).translate(0, 0.0015, 0), (x, _y, z, out) => out.setRGB(0.55, 0.4, 0.3).multiplyScalar(0.85 + 0.3 * noise3(x * 900, 0, z * 900)));
    return mergeParts([top, paper], ['position', 'normal', 'color']);
  });
}

/** A wooden ruler along x, on y = 0. */
export function rulerGeometry() {
  return cached('shop-ruler', () =>
    paintGeometry(new THREE.BoxGeometry(0.16, 0.003, 0.016, 32, 1, 2).translate(0, 0.0015, 0), (x, y, z, out) => {
      out.setRGB(0.93, 0.82, 0.55);
      if (y > 0.002 && z < -0.002 && Math.abs(Math.sin(x * 200)) > 0.85) out.setRGB(0.2, 0.18, 0.15);
    }),
  );
}

/** A pencil along +z, the point at +z. */
export function pencilGeometry() {
  return cached('shop-pencil', () => {
    const body = new THREE.CylinderGeometry(0.0034, 0.0034, 0.055, 6).rotateX(Math.PI / 2);
    paintGeometry(body, (_x, _y, _z, out) => out.setRGB(0.95, 0.72, 0.15));
    const cone = new THREE.ConeGeometry(0.0034, 0.012, 6).rotateX(Math.PI / 2).translate(0, 0, 0.0335);
    paintGeometry(cone, (_x, _y, z, out) => (z > 0.037 ? out.setRGB(0.15, 0.15, 0.15) : out.setRGB(0.9, 0.78, 0.6)));
    return mergeParts([body, cone], ['position', 'normal', 'color']);
  });
}

/** A paintbrush along +z, bristles at +z. */
export function brushGeometry() {
  return cached('shop-brush', () => {
    const handle = new THREE.CylinderGeometry(0.003, 0.0045, 0.06, 8).rotateX(Math.PI / 2);
    paintGeometry(handle, (_x, _y, _z, out) => out.setRGB(0.75, 0.2, 0.18));
    const ferrule = new THREE.CylinderGeometry(0.0038, 0.0035, 0.01, 8).rotateX(Math.PI / 2).translate(0, 0, 0.034);
    paintGeometry(ferrule, (_x, _y, _z, out) => out.setRGB(0.8, 0.8, 0.82));
    const tuft = new THREE.ConeGeometry(0.004, 0.014, 8).rotateX(Math.PI / 2).translate(0, 0, 0.045);
    paintGeometry(tuft, (_x, _y, z, out) => (z > 0.046 ? out.setRGB(0.3, 0.55, 0.85) : out.setRGB(0.55, 0.42, 0.3)));
    return mergeParts([handle, ferrule, tuft], ['position', 'normal', 'color']);
  });
}

/** A little wooden wind-up robot (0.07 tall), base on y = 0, facing +z. */
export function robotGeometry() {
  return cached('shop-robot', () => {
    const parts: THREE.BufferGeometry[] = [];
    const paint = (g: THREE.BufferGeometry, c: [number, number, number]) => parts.push(paintGeometry(g, (x, y, z, out) => out.setRGB(c[0], c[1], c[2]).multiplyScalar(0.92 + 0.08 * noise3(x * 300, y * 300, z * 300))));
    paint(roundedBox(0.04, 0.035, 0.028, 0.005).translate(0, 0.012, 0), [0.25, 0.45, 0.7]);
    paint(roundedBox(0.03, 0.026, 0.026, 0.006).translate(0, 0.048, 0), [0.88, 0.75, 0.55]);
    for (const s of [-1, 1]) {
      paint(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 8).translate(s * 0.01, 0.006, 0), [0.3, 0.3, 0.32]);
      paint(new THREE.CylinderGeometry(0.004, 0.004, 0.022, 8).rotateZ(Math.PI / 2 - s * 0.5).translate(s * 0.026, 0.03, 0), [0.25, 0.45, 0.7]);
      paint(new THREE.SphereGeometry(0.003, 8, 6).translate(s * 0.007, 0.06, 0.0135), [0.1, 0.1, 0.1]);
    }
    paint(new THREE.CylinderGeometry(0.0012, 0.0012, 0.012, 6).translate(0, 0.078, 0), [0.6, 0.6, 0.62]);
    paint(new THREE.SphereGeometry(0.003, 8, 6).translate(0, 0.085, 0), [0.9, 0.3, 0.25]);
    // the wind-up key on its back
    paint(new THREE.BoxGeometry(0.018, 0.012, 0.002).translate(0, 0.03, -0.022), [0.85, 0.7, 0.3]);
    return mergeParts(parts, ['position', 'normal', 'color']).scale(1.5, 1.5, 1.5);
  });
}
