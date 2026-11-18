import * as THREE from 'three';
import { mergeParts, paintGeometry, tubeThrough } from '../../tank/geo';
import { cached } from '../../tank/sdf';
import { noise3, rng } from '../../tank/util';

// The office people's things, in cook metres (see crew/plan.ts): a laptop with
// a softly glowing screen (nothing readable on it), a desk phone and its
// handset, a notepad and pen, a mug, printouts, a clipboard, a paper stack.

const lathe = (pts: [number, number][], seg = 32) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );

function roundedBox(w: number, h: number, d: number, r: number, seg = 3) {
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
  const bevel = Math.min(h * 0.35, r * 0.6);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: 6 });
  g.rotateX(-Math.PI / 2).translate(0, bevel, 0);
  return g;
}

// ---------- materials ----------

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  return {
    alu: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: 0.25, roughness: 0.55, envMapIntensity: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2b2c33', metalness: 0.2, roughness: 0.45 }),
    keys: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.6 }),
    plastic: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.45 }),
    paper: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    coffee: new THREE.MeshStandardMaterial({ color: '#3b2416', roughness: 0.15 }),
    wood: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.7 }),
  };
}
export const officeMats = () => (mats ??= makeMats());

// ---------- laptop ----------

/** The laptop's base (keyboard up), centred on the origin, sitting on y = 0; 0.2 wide, 0.14 deep. The hinge is at z = -0.07. */
export function laptopBaseGeometry() {
  return cached('office-laptop-base', () => {
    const shell = roundedBox(0.2, 0.011, 0.14, 0.012);
    paintGeometry(shell, (_x, _y, _z, out) => out.setRGB(0.36, 0.37, 0.4));
    // the keyboard: a grid of dark keys and a trackpad
    const keys: THREE.BufferGeometry[] = [];
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 13; col++) {
        const k = new THREE.BoxGeometry(0.0115, 0.0016, 0.0105).translate(-0.081 + col * 0.0135, 0.0115, -0.052 + row * 0.0128);
        keys.push(k);
      }
    const space = new THREE.BoxGeometry(0.07, 0.0016, 0.0105).translate(0, 0.0115, -0.052 + 5 * 0.0128);
    const k = mergeParts([...keys, space], ['position', 'normal']);
    paintGeometry(k, (_x, _y, _z, out) => out.setRGB(0.16, 0.16, 0.19));
    const pad = new THREE.BoxGeometry(0.06, 0.0008, 0.034).translate(0, 0.0112, 0.045);
    paintGeometry(pad, (_x, _y, _z, out) => out.setRGB(0.66, 0.67, 0.7));
    return mergeParts([shell, k, pad], ['position', 'normal', 'color']);
  });
}

/** The lid (a flat shell, 0.2 x 0.13), its bottom edge at the origin, standing up along +y, screen side facing +z. */
export function laptopLidGeometry() {
  return cached('office-laptop-lid', () => {
    const g = roundedBox(0.2, 0.007, 0.13, 0.012).rotateX(Math.PI / 2).translate(0, 0.065, 0);
    // after the turn: x across, y up the lid, z through it (the screen is at +z)
    paintGeometry(g, (_x, _y, z, out) => out.setRGB(0.34, 0.35, 0.38).multiplyScalar(z > 0.003 ? 0.35 : 1));
    return g;
  });
}

const screenVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const screenFrag = /* glsl */ `
uniform float uTime;
uniform float uMode;
uniform float uSeed;
uniform float uOn;
varying vec2 vUv;
float h(float n) { return fract(sin(n * 12.9898 + uSeed * 4.1) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  vec3 bg = vec3(0.07, 0.08, 0.12);
  vec3 col = bg;
  float m = uMode;
  if (m < 0.5) {
    // asleep: a dim, slowly breathing wallpaper
    col = mix(vec3(0.06, 0.08, 0.13), vec3(0.12, 0.1, 0.18), uv.y) * (0.6 + 0.2 * sin(uTime * 0.4));
  } else if (m < 1.5) {
    // code: indented lines in a few colours, scrolling up as they are typed
    float rows = 14.0;
    float scroll = uTime * 1.6;
    float r = floor(uv.y * rows + scroll);
    float fy = fract(uv.y * rows + scroll);
    float indent = 0.06 + 0.06 * floor(h(r) * 3.0);
    float len = indent + 0.15 + 0.6 * h(r + 7.0);
    float seg = step(indent, uv.x) * step(uv.x, len) * step(0.3, fy) * step(fy, 0.72);
    vec3 ink = mix(vec3(0.55, 0.78, 0.98), vec3(0.98, 0.72, 0.5), step(0.6, h(r + 3.0)));
    ink = mix(ink, vec3(0.7, 0.92, 0.62), step(0.82, h(r + 11.0)));
    col = mix(bg, ink, seg * (0.55 + 0.45 * step(0.5, fract(uv.x * 9.0 + h(r)))));
    // the cursor
    col += vec3(0.9) * step(abs(uv.y - 0.22), 0.025) * step(abs(uv.x - (indent + 0.35 + 0.3 * fract(uTime))), 0.008) * step(0.5, fract(uTime * 2.0));
  } else if (m < 2.5) {
    // a command running: log lines appearing and a progress bar filling
    float rows = 12.0;
    float r = floor(uv.y * rows + uTime * 0.7);
    float fy = fract(uv.y * rows + uTime * 0.7);
    float len = 0.1 + 0.55 * h(r);
    float line = step(0.06, uv.x) * step(uv.x, len) * step(0.35, fy) * step(fy, 0.65) * step(0.25, uv.y);
    col = mix(bg, vec3(0.62, 0.86, 0.66), line * 0.7);
    float p = fract(uTime * 0.07 + uSeed);
    float bar = step(abs(uv.y - 0.12), 0.035) * step(0.06, uv.x) * step(uv.x, 0.94);
    col = mix(col, vec3(0.2, 0.22, 0.28), bar);
    col = mix(col, vec3(0.48, 0.82, 0.98), bar * step(uv.x, 0.06 + 0.88 * p));
  } else if (m < 3.5) {
    // a document: a pale page with paragraphs and a picture block
    vec3 page = vec3(0.86, 0.87, 0.9);
    float rows = 18.0;
    float r = floor(uv.y * rows);
    float fy = fract(uv.y * rows);
    float len = 0.85 - 0.5 * step(0.8, h(r + floor(uTime * 0.15) * 31.0));
    float line = step(0.1, uv.x) * step(uv.x, len) * step(0.35, fy) * step(fy, 0.62);
    col = mix(page, vec3(0.45, 0.47, 0.55), line);
    float pic = step(0.6, uv.x) * step(uv.x, 0.9) * step(0.55, uv.y) * step(uv.y, 0.85);
    col = mix(col, vec3(0.55, 0.7, 0.85), pic);
  } else {
    // a call: a round picture, and sound waves when someone speaks
    vec2 c = uv - vec2(0.5, 0.58);
    c.x *= 1.5;
    float d = length(c);
    col = mix(vec3(0.1, 0.12, 0.18), vec3(0.16, 0.2, 0.3), uv.y);
    col = mix(col, vec3(0.92, 0.75, 0.55), smoothstep(0.17, 0.16, d));
    float wave = step(abs(uv.y - 0.2), 0.04 + 0.03 * abs(sin(uv.x * 40.0 + uTime * 8.0)) * step(0.3, uv.x) * step(uv.x, 0.7));
    col = mix(col, vec3(0.5, 0.86, 0.7), wave * step(0.3, uv.x) * step(uv.x, 0.7));
  }
  gl_FragColor = vec4(col * uOn, 1.0);
}`;

/** A laptop screen: code, a running command, a document or a call, glowing softly. One material per laptop. */
export function screenMaterial(seed: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMode: { value: 0 }, uSeed: { value: seed % 1 }, uOn: { value: 0.85 } },
    vertexShader: screenVert,
    fragmentShader: screenFrag,
    toneMapped: false,
  });
}

// ---------- phone ----------

/** A desk phone's base: a sloped body with a keypad, a cradle on the left; sits on y = 0, about 0.1 x 0.09. */
export function phoneBaseGeometry() {
  return cached('office-phone-base', () => {
    const body = roundedBox(0.1, 0.03, 0.09, 0.014);
    const p = body.attributes.position;
    // slope the top toward the user (+z)
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.015) p.setY(i, p.getY(i) - (p.getZ(i) + 0.045) * 0.14);
    body.computeVertexNormals();
    paintGeometry(body, (_x, _y, _z, out) => out.setRGB(0.2, 0.21, 0.24));
    const keys: THREE.BufferGeometry[] = [];
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++) keys.push(new THREE.BoxGeometry(0.011, 0.004, 0.009).translate(0.012 + c * 0.014, 0.027 - (0.01 + r * 0.013) * 0.14 - 0.004, -0.02 + r * 0.013));
    const k = mergeParts(keys, ['position', 'normal']);
    paintGeometry(k, (_x, _y, _z, out) => out.setRGB(0.82, 0.82, 0.8));
    return mergeParts([body, k], ['position', 'normal', 'color']);
  });
}

/** The handset: earpiece at +y, mouthpiece at -y, the grip at the origin; about 0.11 long. */
export function handsetGeometry() {
  return cached('office-handset', () => {
    const pts = [new THREE.Vector3(0, -0.05, 0.012), new THREE.Vector3(0, -0.025, 0.0), new THREE.Vector3(0, 0.025, 0.0), new THREE.Vector3(0, 0.05, 0.012)];
    const grip = tubeThrough(pts, () => 0.0095, 16, 8).geometry;
    const ear = lathe(
      [
        [0, 0],
        [0.017, 0.0],
        [0.019, 0.008],
        [0.014, 0.014],
        [0, 0.014],
      ],
      18,
    )
      .rotateX(-Math.PI / 2)
      .translate(0, 0.055, 0.004);
    const mouth = ear.clone().translate(0, -0.11, 0);
    const g = mergeParts([grip, ear, mouth], ['position', 'normal']);
    paintGeometry(g, (_x, _y, _z, out) => out.setRGB(0.2, 0.21, 0.24));
    return g;
  });
}

// ---------- on the desk ----------

/** A notepad (yellow, ruled) lying flat, 0.07 x 0.09, on y = 0. */
export function notepadGeometry() {
  return cached('office-notepad', () => {
    const g = new THREE.BoxGeometry(0.07, 0.006, 0.09, 6, 1, 18).translate(0, 0.003, 0);
    paintGeometry(g, (x, y, z, out) => {
      out.setRGB(0.98, 0.9, 0.55);
      if (y > 0.005 && Math.abs(Math.sin(z * 210)) > 0.93 && Math.abs(x) < 0.03) out.setRGB(0.55, 0.62, 0.8);
      if (y > 0.005 && z < -0.036) out.setRGB(0.85, 0.36, 0.3);
    });
    return g;
  });
}

/** A pen along +z, nib at +z. */
export function penGeometry() {
  return cached('office-pen', () => {
    const body = new THREE.CylinderGeometry(0.0036, 0.0036, 0.06, 10).rotateX(Math.PI / 2);
    paintGeometry(body, (_x, _y, z, out) => out.setRGB(0.15, 0.25, 0.55).multiplyScalar(z < -0.02 ? 1.4 : 1));
    const tip = new THREE.ConeGeometry(0.0036, 0.01, 10).rotateX(Math.PI / 2).translate(0, 0, 0.035);
    paintGeometry(tip, (_x, _y, _z, out) => out.setRGB(0.75, 0.75, 0.78));
    return mergeParts([body, tip], ['position', 'normal', 'color']);
  });
}

const MUG_GLAZES: [number, number, number][] = [
  [0.85, 0.42, 0.32],
  [0.32, 0.5, 0.72],
  [0.95, 0.85, 0.6],
  [0.45, 0.62, 0.45],
  [0.88, 0.88, 0.86],
];
/** A coffee mug with a handle (toward +x), base on y = 0; about 0.04 across. */
export function mugGeometry(variant: number) {
  const v = ((Math.floor(variant) % MUG_GLAZES.length) + MUG_GLAZES.length) % MUG_GLAZES.length || 0;
  return cached(`office-mug:${v}`, () => {
    const body = lathe(
      [
        [0, 0],
        [0.019, 0],
        [0.021, 0.004],
        [0.022, 0.05],
        [0.0205, 0.052],
        [0.0195, 0.008],
        [0, 0.008],
      ],
      28,
    );
    const handle = new THREE.TorusGeometry(0.013, 0.0035, 8, 16, Math.PI * 1.15).rotateZ(-Math.PI * 0.57).translate(0.022, 0.027, 0);
    const g = mergeParts([body, handle], ['position', 'normal']);
    const [r, gg, b] = MUG_GLAZES[v];
    paintGeometry(g, (x, y, z, out) => {
      out.setRGB(r, gg, b).multiplyScalar(0.92 + 0.08 * noise3(x * 200, y * 200, z * 200));
      if (y < 0.003) out.setRGB(0.62, 0.5, 0.4);
    });
    return g;
  });
}

const sheetTex = new Map<number, THREE.CanvasTexture>();
/** A printout: a heading bar, paragraphs, a small chart (nothing readable). */
export function sheetTexture(seed: number) {
  let t = sheetTex.get(seed % 5);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 168;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = rng(seed * 53 + 9);
  g.fillStyle = '#f6f4ee';
  g.fillRect(0, 0, 128, 168);
  g.fillStyle = '#3d4a66';
  g.fillRect(12, 12, 60 + r() * 30, 7);
  g.fillStyle = '#8a8f9c';
  for (let y = 30; y < 150; y += 7) {
    if (r() < 0.12) {
      y += 6;
      continue;
    }
    g.fillRect(12, y, 70 + r() * 34, 2.4);
  }
  g.fillStyle = '#7fa4c8';
  for (let i = 0; i < 5; i++) {
    const h = 8 + r() * 22;
    g.fillRect(84 + i * 7, 130 - h, 5, h);
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  sheetTex.set(seed % 5, t);
  return t;
}

/** A sheet of paper, 0.12 x 0.16, gently curved, facing +z. */
export function sheetGeometry() {
  return cached('office-sheet', () => {
    const g = new THREE.PlaneGeometry(0.12, 0.16, 6, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, -0.01 * Math.pow(p.getX(i) / 0.06, 2) + 0.003 * Math.sin(p.getY(i) * 24));
    g.computeVertexNormals();
    paintGeometry(g, (_x, _y, _z, out) => out.setRGB(1, 1, 1));
    return g;
  });
}

/** A clipboard with paper, facing +z, the clip at +y; 0.1 x 0.13. */
export function clipboardGeometry() {
  return cached('office-clipboard', () => {
    const board = roundedBox(0.1, 0.006, 0.135, 0.008).rotateX(Math.PI / 2);
    paintGeometry(board, (x, y, _z, out) => out.setRGB(0.6, 0.42, 0.26).multiplyScalar(0.9 + 0.1 * Math.sin(y * 300 + x * 40)));
    const sheet = new THREE.BoxGeometry(0.086, 0.11, 0.001).translate(0, -0.008, 0.0045);
    paintGeometry(sheet, (_x, y, _z, out) => {
      out.setRGB(0.97, 0.96, 0.92);
      if (Math.abs(Math.sin(y * 260)) > 0.9 && y < 0.035) out.setRGB(0.6, 0.62, 0.68);
    });
    const clip = new THREE.BoxGeometry(0.04, 0.016, 0.008).translate(0, 0.06, 0.006);
    paintGeometry(clip, (_x, _y, _z, out) => out.setRGB(0.8, 0.8, 0.84));
    return mergeParts([board, sheet, clip], ['position', 'normal', 'color']);
  });
}

/** A stack of printed pages, lying flat, on y = 0 (n sheets). */
export function paperStackGeometry(n: number) {
  return cached(`office-stack:${n}`, () => {
    const r = rng(n * 17 + 3);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.BoxGeometry(0.1, 0.0035, 0.13).rotateY((r() - 0.5) * 0.25).translate((r() - 0.5) * 0.01, 0.002 + i * 0.0038, (r() - 0.5) * 0.01);
      parts.push(paintGeometry(s, (_x, _y, _z, out) => out.setRGB(0.96, 0.95, 0.91).multiplyScalar(i % 2 ? 0.97 : 1)));
    }
    return mergeParts(parts, ['position', 'normal', 'color']);
  });
}

