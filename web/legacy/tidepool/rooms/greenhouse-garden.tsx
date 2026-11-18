import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Precipitation, tickWeather, viewColor, weatherUniforms as U, weatherView, WindowWeather } from '../weather';
import { C, canvasTexture, mix, once, paint, rng, smoothstep } from './greenhouse-kit';
import { BAY, CILL_Y, EAVE, END_Z, FLOOR, RAIL_Y, RIDGE, SIDE, WALL_Z } from './greenhouse-plan';

// The night garden beyond the glass, painted in soft layers so it has depth
// when the camera moves: the sky with the moon low over the woods, clipped
// hedges with a lamp and a lit cottage window, and big leaves against the
// glass. (The camera's far plane is 300, so everything stays well inside that.)
//
// It follows the weather: on a clear night stars come out round the moon; rain
// and storm draw a slow-moving cloud deck over the sky and a mist over the
// garden, with rain falling past the glass and drops running down it; snow lays
// snow on the woods, hedges and lawn under a pale sky, with frost on the panes
// and snow lying on the roof glass. Lightning lights the clouds from within.

const CAM = new THREE.Vector3(0, 1.0, 16.5);
/** Where the moon is, seen from the default camera: low over the woods, in the left-hand bay. */
export const MOON_DIR = new THREE.Vector3(-0.47, 0.13, -0.875).normalize();

type R = () => number;
type G = CanvasRenderingContext2D;

// ---------- painting helpers ----------

const css = (a: string, b: string, t: number) => `#${C(a).lerp(C(b), t).getHexString()}`;

/**
 * Paint a layer on a scratch canvas three tiles wide (so shapes and blur wrap
 * across the tile edge), soften it, and copy the middle tile back.
 */
function softLayer(g: G, w: number, h: number, blur: number, seed: number, draw: (c: G, r: R) => void) {
  const a = document.createElement('canvas');
  a.width = w * 3;
  a.height = h;
  const ag = a.getContext('2d') as G;
  for (const dx of [0, w, w * 2]) {
    ag.save();
    ag.translate(dx, 0);
    draw(ag, rng(seed));
    ag.restore();
  }
  if (blur <= 0) {
    g.drawImage(a, w, 0, w, h, 0, 0, w, h);
    return;
  }
  const b = document.createElement('canvas');
  b.width = w * 3;
  b.height = h;
  const bg = b.getContext('2d') as G;
  bg.filter = `blur(${blur}px)`;
  bg.drawImage(a, 0, 0);
  g.drawImage(b, w, 0, w, h, 0, 0, w, h);
}

/** Snow lying on the upper side of a round lump of foliage (clipped to the lump). */
function snowCap(c: G, x: number, y: number, s: number, snow: string) {
  c.save();
  c.beginPath();
  c.arc(x, y, s, 0, Math.PI * 2);
  c.clip();
  const g = c.createLinearGradient(0, y - s, 0, y - s * 0.1);
  g.addColorStop(0, snow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(x - s * 0.1, y - s * 0.95, s * 1.15, s * 0.78, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** A leafy crown lit softly from the upper left: lumps painted back to front (with snow on their tops if `snow`). */
function crown(c: G, cx: number, cy: number, rx: number, ry: number, r: R, light: string, dark: string, lumps = 18, snow?: string) {
  c.fillStyle = dark;
  c.beginPath();
  c.ellipse(cx, cy, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2);
  c.fill();
  const pts = Array.from({ length: lumps }, () => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.75;
    return { x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, s: (0.28 + r() * 0.22) * Math.min(rx, ry) };
  }).sort((p, q) => q.y - p.y);
  for (const p of pts) {
    // lumps higher up and further left catch more moon
    const lit = smoothstep(cy + ry, cy - ry, p.y) * 0.75 + smoothstep(cx + rx, cx - rx, p.x) * 0.25;
    const grad = c.createRadialGradient(p.x - p.s * 0.35, p.y - p.s * 0.45, p.s * 0.1, p.x, p.y, p.s * 1.05);
    grad.addColorStop(0, css(dark, light, 0.35 + lit * 0.65));
    grad.addColorStop(1, dark);
    c.fillStyle = grad;
    c.beginPath();
    c.arc(p.x, p.y, p.s, 0, Math.PI * 2);
    c.fill();
    if (snow) snowCap(c, p.x, p.y, p.s, snow);
  }
}

function conifer(c: G, x: number, base: number, w: number, h: number, r: R, light: string, dark: string, snow?: string) {
  const grad = c.createLinearGradient(x - w / 2, base - h, x + w / 3, base);
  grad.addColorStop(0, light);
  grad.addColorStop(0.55, dark);
  c.fillStyle = grad;
  c.beginPath();
  c.moveTo(x, base - h);
  const tiers = 7 + Math.floor(r() * 4);
  // each tier's tip and the notch under it, right side then left, for the snow on the boughs
  const right: [number, number, number, number][] = [];
  const left: [number, number, number, number][] = [];
  for (let i = 1; i <= tiers; i++) {
    const t = i / tiers;
    const tx = x + (w / 2) * t * (1 + (r() - 0.5) * 0.25);
    const ty = base - h + h * t * 0.94;
    c.lineTo(tx, ty);
    c.lineTo(x + (w / 2) * t * 0.6, base - h + h * (t + 0.035) * 0.94);
    right.push([tx, ty, x + (w / 2) * (t - 1 / tiers) * 0.6, base - h + h * (t - 1 / tiers + 0.035) * 0.94]);
  }
  c.lineTo(x + w * 0.04, base);
  c.lineTo(x - w * 0.04, base);
  for (let i = tiers; i >= 1; i--) {
    const t = i / tiers;
    c.lineTo(x - (w / 2) * t * 0.6, base - h + h * (t + 0.035) * 0.94);
    const tx = x - (w / 2) * t * (1 + (r() - 0.5) * 0.25);
    const ty = base - h + h * t * 0.94;
    c.lineTo(tx, ty);
    left.push([tx, ty, x - (w / 2) * (t - 1 / tiers) * 0.6, base - h + h * (t - 1 / tiers + 0.035) * 0.94]);
  }
  c.closePath();
  c.fill();
  if (snow) {
    c.strokeStyle = snow;
    c.lineCap = 'round';
    c.lineWidth = Math.max(1.5, w * 0.05);
    for (const [tx, ty, nx, ny] of [...right, ...left]) {
      c.beginPath();
      c.moveTo(nx, ny);
      c.lineTo(tx, ty);
      c.stroke();
    }
  }
}

function glow(c: G, x: number, y: number, rad: number, rgb: string, a: number) {
  const b = c.createRadialGradient(x, y, 0, x, y, rad);
  b.addColorStop(0, `rgba(${rgb},${a})`);
  b.addColorStop(0.3, `rgba(${rgb},${a * 0.35})`);
  b.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = b;
  c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

function mistBand(g: G, w: number, top: number, bottom: number, rgb: string, a: number) {
  const m = g.createLinearGradient(0, top, 0, bottom);
  m.addColorStop(0, `rgba(${rgb},0)`);
  m.addColorStop(1, `rgba(${rgb},${a})`);
  g.fillStyle = m;
  g.fillRect(0, top, w, bottom - top);
}

// ---------- the sky ----------

const SKY_R = 240;
const SKY_C = new THREE.Vector3(0, 0, 20);

function skyGeometry() {
  const g = new THREE.SphereGeometry(SKY_R, 64, 32);
  const zen = C('#030b13');
  const mid = C('#08202c');
  const hor = C('#1a3f4b');
  const moonGlow = C('#4f7a87');
  const d = new THREE.Vector3();
  paint(g, (x, y, z, out) => {
    d.set(x, y, z).normalize();
    const e = Math.asin(Math.max(-1, Math.min(1, d.y)));
    mix(out, hor, mid, smoothstep(0.0, 0.22, e));
    mix(out, out, zen, smoothstep(0.22, 0.9, e));
    const a = Math.acos(Math.max(-1, Math.min(1, d.dot(MOON_DIR))));
    mix(out, out, moonGlow, Math.exp(-(a * a) / 0.02) * 0.8 + Math.exp(-(a * a) / 0.16) * 0.3);
  });
  // the same dome under cloud: rain (dark, the moon a faint smudge) and snow (pale, lit by the snow below)
  const variant = (zenH: string, midH: string, horH: string, glowH: string, glowK: number) => {
    const z0 = C(zenH);
    const m0 = C(midH);
    const h0 = C(horH);
    const gl = C(glowH);
    const p = g.attributes.position;
    const out = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      d.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const e = Math.asin(Math.max(-1, Math.min(1, d.y)));
      mix(c, h0, m0, smoothstep(0.0, 0.3, e));
      mix(c, c, z0, smoothstep(0.3, 1.1, e));
      const a = Math.acos(Math.max(-1, Math.min(1, d.dot(MOON_DIR))));
      mix(c, c, gl, Math.exp(-(a * a) / 0.06) * glowK);
      out[i * 3] = c.r;
      out[i * 3 + 1] = c.g;
      out[i * 3 + 2] = c.b;
    }
    return new THREE.BufferAttribute(out, 3);
  };
  g.setAttribute('colorWet', variant('#04080b', '#0a161b', '#1c2c31', '#2b3d43', 0.45));
  g.setAttribute('colorSnow', variant('#121920', '#232e36', '#46525b', '#5c6871', 0.35));
  return g;
}

const SKY_VERT = /* glsl */ `
attribute vec3 colorWet;
attribute vec3 colorSnow;
uniform vec3 uView;
varying vec3 vCol;
varying vec3 vDir;
void main() {
  vCol = color * uView.x + colorWet * uView.y + colorSnow * uView.z;
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// The dome's colours for the weather, stars on a clear night, a cloud deck that
// drifts slowly round the sky in rain and snow, and lightning glowing in it.
const SKY_FRAG = /* glsl */ `
uniform vec3 uView;
uniform float uStorm;
uniform float uFlash;
uniform float uCycle;
varying vec3 vCol;
varying vec3 vDir;
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float h31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vn3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vn3(p);
    p = p * 2.03 + 3.7;
    a *= 0.5;
  }
  return s / 0.97;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = vCol;
  float el = d.y;
  if (uView.x > 0.003) {
    // stars: one chance in a few per square degree, a pixel or so across, twinkling a little
    vec2 g = vec2(atan(d.x, -d.z), asin(clamp(el, -1.0, 1.0))) * 57.29578;
    vec2 id = floor(g);
    float h = h21(id);
    if (h < 0.3) {
      vec2 c = vec2(h21(id + 3.1), h21(id + 7.7)) * 0.7 + 0.15;
      vec2 f = (fract(g) - c) * vec2(cos(g.y / 57.29578), 1.0);
      float px = max(fwidth(g.y), 1e-4);
      float b = pow(h21(id + 5.3), 3.0);
      float r = mix(0.6, 1.3, b) * px;
      float star = (1.0 - smoothstep(r * 0.3, r, length(f))) * (0.3 + 0.7 * b);
      float tw = 0.8 + 0.2 * sin(6.2831853 * (uCycle * floor(400.0 + 900.0 * h21(id + 2.0)) + h));
      col += vec3(0.82, 0.88, 1.0) * star * tw * smoothstep(0.05, 0.3, el) * uView.x;
    }
  }
  float deck = uView.y + uView.z;
  float cl = 0.0;
  if (deck > 0.003) {
    float a = 6.2831853 * uCycle; // one slow turn round the sky per period
    vec3 q = vec3(d.x * cos(a) - d.z * sin(a), d.y, d.x * sin(a) + d.z * cos(a));
    cl = smoothstep(0.38, 0.78, fbm3(q * vec3(2.4, 5.0, 2.4))) * smoothstep(-0.02, 0.1, el);
    float snowy = uView.z / max(deck, 1e-3);
    vec3 lit = mix(vec3(0.05, 0.068, 0.078), vec3(0.17, 0.19, 0.215), snowy);
    col = mix(col, lit * (0.75 + 0.7 * cl), cl * 0.8 * deck);
  }
  col *= 1.0 - 0.38 * uStorm;
  col += uFlash * (0.03 + 0.55 * cl * deck) * vec3(0.62, 0.68, 0.86);
  col *= 1.0 + uFlash * 1.1;
  gl_FragColor = vec4(col, 1.0);
}`;

function moonTexture() {
  return canvasTexture(
    'gh-moon',
    256,
    256,
    (g, w) => {
      const c = w / 2;
      const R0 = w * 0.42;
      const disc = g.createRadialGradient(c - 12, c - 14, 4, c, c, R0);
      disc.addColorStop(0, '#fbfaf0');
      disc.addColorStop(0.7, '#e8eadc');
      disc.addColorStop(1, '#c4cfc6');
      g.fillStyle = disc;
      g.beginPath();
      g.arc(c, c, R0, 0, Math.PI * 2);
      g.fill();
      // the seas: a chain of soft grey patches across the upper left, like the real moon
      g.save();
      g.beginPath();
      g.arc(c, c, R0, 0, Math.PI * 2);
      g.clip();
      const seas: [number, number, number, number][] = [
        [-0.35, -0.3, 0.3, 0.2],
        [-0.05, -0.38, 0.2, 0.17],
        [0.12, -0.12, 0.22, 0.15],
        [-0.42, 0.05, 0.26, 0.16],
        [-0.15, 0.1, 0.16, 0.12],
        [0.28, -0.32, 0.12, 0.12],
        [-0.25, 0.42, 0.12, 0.1],
      ];
      for (const [x0, y0, rad0, a] of seas) {
        const x = c + x0 * R0;
        const y = c + y0 * R0;
        const rad = rad0 * R0;
        const b = g.createRadialGradient(x, y, 0, x, y, rad);
        b.addColorStop(0, `rgba(128,142,146,${a})`);
        b.addColorStop(0.6, `rgba(128,142,146,${a * 0.6})`);
        b.addColorStop(1, 'rgba(128,142,146,0)');
        g.fillStyle = b;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      g.restore();
    },
    { wrap: false },
  );
}

function haloTexture() {
  return canvasTexture(
    'gh-halo',
    256,
    256,
    (g, w) => {
      const c = w / 2;
      const b = g.createRadialGradient(c, c, 0, c, c, c);
      b.addColorStop(0, 'rgba(225,242,240,0.6)');
      b.addColorStop(0.1, 'rgba(195,224,226,0.3)');
      b.addColorStop(0.35, 'rgba(120,170,180,0.09)');
      b.addColorStop(1, 'rgba(120,170,180,0)');
      g.fillStyle = b;
      g.fillRect(0, 0, w, w);
    },
    { wrap: false },
  );
}

/** Ragged cloud banks, silvered where they pass the moon (the centre of the texture). */
function cloudTexture() {
  return canvasTexture(
    'gh-clouds',
    1024,
    512,
    (g, w, h) => {
      const r = rng(9);
      const bank = (y: number, thick: number, n: number, a: number) => {
        for (let i = 0; i < n; i++) {
          const x = r() * w;
          const yy = y + (r() - 0.5) * thick;
          const rx = 40 + r() * 130;
          const ry = rx * (0.16 + r() * 0.18);
          const dx = (x - w / 2) / (w / 2);
          const dy = (yy - h / 2) / (h / 2);
          const lit = Math.exp(-(dx * dx * 7 + dy * dy * 5));
          const col = C('#183440').lerp(C('#a8c4cc'), lit * 0.85);
          const s = `${Math.round(Math.pow(col.r, 1 / 2.2) * 255)},${Math.round(Math.pow(col.g, 1 / 2.2) * 255)},${Math.round(Math.pow(col.b, 1 / 2.2) * 255)}`;
          const b = g.createRadialGradient(x, yy, 0, x, yy, rx);
          b.addColorStop(0, `rgba(${s},${a})`);
          b.addColorStop(1, `rgba(${s},0)`);
          g.save();
          g.translate(x, yy);
          g.scale(1, ry / rx);
          g.translate(-x, -yy);
          g.fillStyle = b;
          g.fillRect(x - rx, yy - rx, rx * 2, rx * 2);
          g.restore();
        }
      };
      bank(h * 0.16, 60, 60, 0.38);
      bank(h * 0.36, 50, 36, 0.28);
      bank(h * 0.6, 40, 40, 0.42);
      bank(h * 0.82, 60, 70, 0.5);
      g.globalCompositeOperation = 'destination-in';
      const fx = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w / 2);
      fx.addColorStop(0, 'rgba(0,0,0,1)');
      fx.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fx;
      g.fillRect(0, 0, w, h);
    },
    { wrap: false },
  );
}

function Sky() {
  const sky = useMemo(() => once('gh-sky', skyGeometry), []);
  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: { uView: U.uView, uStorm: U.uStorm, uFlash: U.uFlash, uCycle: U.uCycle },
        vertexColors: true,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  );
  const moon = moonTexture();
  const halo = haloTexture();
  const clouds = cloudTexture();
  const at = (dist: number) => CAM.clone().addScaledVector(MOON_DIR, dist);
  // the moon, its halo and the moonlit clouds belong to the clear night: they fade behind the weather
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const moonMat = useRef<THREE.MeshBasicMaterial>(null);
  const cloudMat = useRef<THREE.MeshBasicMaterial>(null);
  const moonGroup = useRef<THREE.Group>(null);
  useFrame(() => {
    const clear = tickWeather().uView.value.x;
    if (haloMat.current) haloMat.current.opacity = clear;
    if (moonMat.current) moonMat.current.opacity = clear;
    if (cloudMat.current) cloudMat.current.opacity = clear;
    if (moonGroup.current) moonGroup.current.visible = clear > 0.002;
  });
  return (
    <group>
      <mesh geometry={sky} material={skyMat} position={SKY_C} renderOrder={-10} />
      <group ref={moonGroup}>
        <group position={at(225)} onUpdate={(o) => o.lookAt(CAM)}>
          <mesh scale={52}>
            <planeGeometry />
            <meshBasicMaterial ref={haloMat} map={halo} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
          <mesh scale={10.5}>
            <planeGeometry />
            <meshBasicMaterial ref={moonMat} map={moon} transparent depthWrite={false} color={new THREE.Color('#ffffff').multiplyScalar(1.3)} toneMapped={false} />
          </mesh>
        </group>
        <group position={at(210)} onUpdate={(o) => o.lookAt(CAM)}>
          <mesh scale={[210, 105, 1]}>
            <planeGeometry />
            <meshBasicMaterial ref={cloudMat} map={clouds} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ---------- the woods, the garden and the shrubs at the glass ----------

/** Far woods in two misty rows (snow-laden in the snow). The ring is 64 units tall, its foot 4 below the lawn. */
function woodsTexture(snow = false) {
  return canvasTexture(snow ? 'gh-woods-snow' : 'gh-woods', 2048, 512, (g, w, h) => {
    const px = h / 64;
    const ground = h - 4 * px;
    const row = (c: G, r: R, n: number, minH: number, maxH: number, light: string, dark: string, cap?: string) => {
      for (let i = 0; i < n; i++) {
        const x = (i / n) * w + (r() - 0.5) * (w / n) * 1.2;
        const H = (minH + r() * (maxH - minH)) * px;
        const kind = r();
        if (kind < 0.22) conifer(c, x, ground, H * 0.4, H, r, light, dark, cap);
        else if (kind < 0.35) crown(c, x, ground - H * 0.52, H * 0.12, H * 0.48, r, light, dark, 10, cap);
        else {
          c.fillStyle = dark;
          c.fillRect(x - 2, ground - H * 0.45, 4, H * 0.45);
          crown(c, x, ground - H * 0.6, H * (0.26 + r() * 0.14), H * 0.36, r, light, dark, 20, cap);
        }
      }
    };
    softLayer(g, w, h, 3.2, 23, (c, r) => row(c, r, 30, 24, 36, snow ? '#2c434b' : '#335e68', snow ? '#14262c' : '#183a44', snow ? 'rgba(128,145,156,0.95)' : undefined));
    mistBand(g, w, ground - 26 * px, ground, snow ? '70,84,94' : '46,90,98', snow ? 0.6 : 0.65);
    softLayer(g, w, h, 1.6, 41, (c, r) => row(c, r, 44, 13, 24, snow ? '#223a3f' : '#28494d', snow ? '#0b1a1e' : '#0d2428', snow ? 'rgba(140,156,166,0.95)' : undefined));
    mistBand(g, w, ground - 9 * px, ground + 2, snow ? '78,92,102' : '40,80,86', 0.5);
    g.fillStyle = snow ? '#3e4a52' : '#0f2629';
    g.fillRect(0, ground, w, h - ground);
  });
}

/**
 * The garden: clipped hedges, topiary, a rose arch, two lamps on posts and a
 * cottage with a lit window. The ring is 30 units tall, its foot 2 below the lawn.
 */
function gardenTexture(snow = false) {
  return canvasTexture(snow ? 'gh-garden-snow' : 'gh-garden', 2048, 320, (g, w, h) => {
    const px = h / 30;
    const ground = h - 2 * px;
    const light = '#2c5049';
    const dark = '#0a1c19';
    const cap = snow ? 'rgba(132,148,158,0.95)' : undefined;
    // the cottage, far off on the right of the tile
    const cx = w * 0.78;
    softLayer(g, w, h, 1, 3, (c) => {
      const grad = c.createLinearGradient(cx - 80, ground - 24 * px, cx + 60, ground);
      grad.addColorStop(0, snow ? '#6a7880' : '#264247');
      grad.addColorStop(0.6, '#0c1a1d');
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(cx - 70, ground);
      c.lineTo(cx - 70, ground - 15 * px);
      c.lineTo(cx, ground - 24 * px);
      c.lineTo(cx + 70, ground - 15 * px);
      c.lineTo(cx + 70, ground);
      c.fill();
      c.fillStyle = '#0c1a1d';
      c.fillRect(cx + 30, ground - 26 * px, 10, 8 * px);
      if (snow) {
        // snow along the roof and on the chimney
        c.strokeStyle = '#8796a0';
        c.lineWidth = 5;
        c.lineJoin = 'round';
        c.beginPath();
        c.moveTo(cx - 72, ground - 15 * px);
        c.lineTo(cx, ground - 24 * px);
        c.lineTo(cx + 72, ground - 15 * px);
        c.stroke();
        c.fillStyle = '#8796a0';
        c.fillRect(cx + 29, ground - 26 * px - 3, 12, 4);
      }
    });
    glow(g, cx - 24, ground - 9 * px, 80, '255,186,105', 0.32);
    g.fillStyle = '#ffc77e';
    g.fillRect(cx - 38, ground - 12 * px, 28, 6 * px);
    g.fillStyle = '#4a3320';
    g.fillRect(cx - 25, ground - 12 * px, 2, 6 * px);
    g.fillRect(cx - 38, ground - 9.2 * px, 28, 2);
    // hedges with gaps, lit along their tops
    softLayer(g, w, h, 1.2, 61, (c, r) => {
      let x = 0;
      while (x < w) {
        const len = 120 + r() * 260;
        const H = (6 + r() * 5) * px;
        const grad = c.createLinearGradient(0, ground - H, 0, ground);
        grad.addColorStop(0, snow ? '#7f8e97' : light);
        grad.addColorStop(snow ? 0.12 : 0.3, snow ? css(dark, '#6a7a83', 0.5) : css(dark, light, 0.3));
        grad.addColorStop(1, dark);
        c.fillStyle = grad;
        c.beginPath();
        c.roundRect(x, ground - H, len, H + 2, 12);
        c.fill();
        for (let k = 0; k < len / 10; k++) {
          const lx = x + 8 + r() * (len - 16);
          const ly = ground - H + 3 + r() * 5;
          const s = 4 + r() * 6;
          const lg = c.createRadialGradient(lx - s * 0.3, ly - s * 0.4, 0, lx, ly, s);
          lg.addColorStop(0, snow ? '#8796a0' : css(dark, light, 0.9));
          lg.addColorStop(1, snow ? '#5d6c75' : css(dark, light, 0.45));
          c.fillStyle = lg;
          c.beginPath();
          c.arc(lx, ly, s, 0, Math.PI * 2);
          c.fill();
        }
        x += len + 20 + r() * 120;
      }
      // topiary in front of the hedges
      for (let i = 0; i < 14; i++) {
        const tx = r() * w;
        const s = (2.2 + r() * 2.2) * px;
        if (r() < 0.5) crown(c, tx, ground - s, s, s, r, light, dark, 8, cap);
        else conifer(c, tx, ground, s * 1.6, s * 3.4, r, light, dark, cap);
      }
    });
    // a rose arch with pale roses
    softLayer(g, w, h, 0.8, 7, (c, r) => {
      const ax = w * 0.3;
      c.strokeStyle = '#1b322f';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(ax - 40, ground);
      c.lineTo(ax - 40, ground - 14 * px);
      c.arc(ax, ground - 14 * px, 40, Math.PI, 0);
      c.lineTo(ax + 40, ground);
      c.stroke();
      for (let i = 0; i < 46; i++) {
        const a = Math.PI + r() * Math.PI;
        const onArch = r() < 0.55;
        const side = r() < 0.5 ? 40 : -40;
        const x = onArch ? ax + Math.cos(a) * 40 : ax + side;
        const y = onArch ? ground - 14 * px + Math.sin(a) * 40 : ground - r() * 14 * px;
        c.fillStyle = snow ? css('#1a272b', '#76858e', r()) : css('#0b1f1c', '#25433e', r());
        c.beginPath();
        c.arc(x + (r() - 0.5) * 10, y + (r() - 0.5) * 10, 4 + r() * 6, 0, Math.PI * 2);
        c.fill();
      }
      for (let i = 0; i < 16; i++) {
        const a = Math.PI + r() * Math.PI;
        c.fillStyle = snow ? 'rgba(170,182,192,0.75)' : 'rgba(214,192,204,0.7)';
        c.beginPath();
        c.arc(ax + Math.cos(a) * 42, ground - 14 * px + Math.sin(a) * 42, 2.2, 0, Math.PI * 2);
        c.fill();
      }
    });
    // two lamps on posts, each with a pool of light on the lawn
    for (const lx of [w * 0.12, w * 0.56]) {
      glow(g, lx, ground - 2, 100, '255,176,96', 0.16);
      g.fillStyle = '#132622';
      g.fillRect(lx - 2, ground - 21 * px, 4, 21 * px);
      g.fillRect(lx - 7, ground - 22.5 * px, 14, 2 * px);
      glow(g, lx, ground - 21 * px, 64, '255,196,120', 0.5);
      g.fillStyle = '#ffe4b6';
      g.beginPath();
      g.arc(lx, ground - 21 * px, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = snow ? '#3c4850' : '#0c1d1a';
    g.fillRect(0, ground, w, h - ground);
    mistBand(g, w, ground - 5 * px, ground, snow ? '84,98,108' : '50,90,92', 0.3);
  });
}

/**
 * Big leaves right outside the glass: hostas, ferns and pale hydrangea heads,
 * beaded with rain (or, in the snow, laden with it and banked in a drift). 64 x 12 units.
 */
function shrubTexture(snow = false) {
  return canvasTexture(snow ? 'gh-shrubs-snow' : 'gh-shrubs', 2048, 384, (g, w, h) => {
    const px = h / 12;
    const ground = h + 6;
    const light = '#1f3a34';
    const dark = '#040b09';
    const heads: [number, number, number][] = [];
    softLayer(g, w, h, 1.4, 88, (c, r) => {
      for (let cx = 40; cx < w; cx += 90 + r() * 140) {
        const H = (5.5 + r() * 4.5) * px;
        const kind = r();
        if (kind < 0.4) {
          crown(c, cx, ground - H * 0.5, H * 0.8, H * 0.55, r, light, dark, 26, snow ? 'rgba(110,126,136,0.95)' : undefined);
          for (let k = 0; k < 5; k++) heads.push([cx + (r() - 0.5) * H * 1.2, ground - H * (0.5 + r() * 0.42), H * (0.1 + r() * 0.06)]);
        } else if (kind < 0.7) {
          // a fern: arching fronds of little leaflets
          for (let f = 0; f < 9; f++) {
            const a = -Math.PI / 2 + (f / 8 - 0.5) * 2.4;
            const len = H * (0.85 + r() * 0.4);
            const ex = cx + Math.cos(a) * len;
            const ey = ground + Math.sin(a) * len * 0.9;
            const mx = cx + Math.cos(a) * len * 0.4;
            const my = ground - len * 0.95;
            for (let p = 1; p < 14; p++) {
              const t = p / 14;
              const qx = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * mx + t * t * ex;
              const qy = (1 - t) * (1 - t) * ground + 2 * (1 - t) * t * my + t * t * ey;
              c.fillStyle = css(dark, light, 0.25 + (1 - t) * 0.5 * (f / 8));
              c.beginPath();
              c.ellipse(qx, qy, 11 * (1 - t * 0.7), 3.5, a + 0.7, 0, Math.PI * 2);
              c.ellipse(qx, qy, 11 * (1 - t * 0.7), 3.5, a - 0.7, 0, Math.PI * 2);
              c.fill();
            }
          }
        } else {
          // a hosta: broad leaves fanning from the ground
          for (let f = 0; f < 11; f++) {
            const a = (r() - 0.5) * 2.6;
            const len = H * (0.5 + r() * 0.45);
            c.save();
            c.translate(cx + (r() - 0.5) * H * 0.3, ground);
            c.rotate(a);
            const lg = c.createLinearGradient(-len * 0.3, -len, len * 0.3, 0);
            lg.addColorStop(0, css(dark, light, 0.8 + r() * 0.2));
            lg.addColorStop(1, dark);
            c.fillStyle = lg;
            c.beginPath();
            c.ellipse(0, -len * 0.55, len * 0.32, len * 0.5, 0, 0, Math.PI * 2);
            c.fill();
            c.restore();
          }
        }
      }
    });
    // hydrangea heads catching the moonlight, and rain beads on the leaves
    const r = rng(90);
    for (const [hx, hy, hr] of heads)
      for (let d = 0; d < 30; d++) {
        const a = r() * Math.PI * 2;
        const dd = Math.sqrt(r()) * hr;
        g.fillStyle = snow ? `rgba(${150 + r() * 30},${160 + r() * 25},${172 + r() * 25},${0.45 + r() * 0.3})` : `rgba(${130 + r() * 40},${156 + r() * 30},${186 + r() * 30},${0.3 + r() * 0.3})`;
        g.beginPath();
        g.arc(hx + Math.cos(a) * dd, hy + Math.sin(a) * dd, 2 + r() * 2.2, 0, Math.PI * 2);
        g.fill();
      }
    for (let k = 0; k < 160; k++) {
      // (drawn in the same order as ever, so the beads stay where they were)
      const a = 0.2 + r() * 0.35;
      const x = r() * w;
      const y = h * 0.35 + r() * h * 0.65;
      const rad = 0.8 + r() * 1.2;
      if (snow) continue;
      g.fillStyle = `rgba(170,205,212,${a})`;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    if (snow) {
      // a drift banked against the glass, its crest catching the light
      const rr = rng(95);
      const crest: number[] = [];
      for (let x = 0; x <= w + 16; x += 16) crest.push(h * (0.8 - 0.06 * Math.sin(x / 150) - 0.04 * Math.sin(x / 47 + 2) - rr() * 0.025));
      const fill = g.createLinearGradient(0, h * 0.7, 0, h);
      fill.addColorStop(0, '#56646d');
      fill.addColorStop(1, '#2c363d');
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(0, h);
      crest.forEach((y, i) => g.lineTo(i * 16, y));
      g.lineTo(w, h);
      g.fill();
      g.strokeStyle = 'rgba(150,164,176,0.55)';
      g.lineWidth = 2;
      g.beginPath();
      crest.forEach((y, i) => (i ? g.lineTo(i * 16, y) : g.moveTo(0, y)));
      g.stroke();
    }
  });
}

function ringGeometry(radius: number, height: number) {
  return new THREE.CylinderGeometry(radius, radius, height, 128, 1, true);
}

const LAWN = { clear: C('#0a1a18'), wet: C('#08140f'), snow: C('#2f3a41') };

function Grounds() {
  // each painted ring blends to its snowy version in the snow; rain washes a mist over it
  const woods = useMemo(() => {
    const t = woodsTexture().clone();
    t.repeat.set(-4, 1);
    t.needsUpdate = true;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.02, side: THREE.BackSide, depthWrite: false, toneMapped: false });
    return weatherView(m, { clear: () => t, snow: () => woodsTexture(true) }, { storm: 0.32, flashGain: 1.6, flashLift: 0.02, mist: '#1f3036', mistAmount: 0.35 });
  }, []);
  const garden = useMemo(() => {
    const t = gardenTexture().clone();
    t.repeat.set(-5, 1);
    t.offset.x = 0.35;
    t.needsUpdate = true;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.02, side: THREE.BackSide, depthWrite: false, toneMapped: false });
    return weatherView(m, { clear: () => t, snow: () => gardenTexture(true) }, { storm: 0.3, flashGain: 1.4, flashLift: 0.015, mist: '#1d2c30', mistAmount: 0.22 });
  }, []);
  const leafy = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ map: shrubTexture(), transparent: true, alphaTest: 0.02, depthWrite: false, toneMapped: false });
    return weatherView(m, { clear: () => shrubTexture(), snow: () => shrubTexture(true) }, { storm: 0.25, flashGain: 1.2, flashLift: 0.01 });
  }, []);
  const lawn = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    tickWeather();
    if (lawn.current) viewColor(lawn.current.color, LAWN.clear, LAWN.wet, LAWN.snow);
  });
  const woodsGeo = useMemo(() => once('gh-woods-ring', () => ringGeometry(150, 64)), []);
  const gardenGeo = useMemo(() => once('gh-garden-ring', () => ringGeometry(62, 30)), []);
  return (
    <group>
      {/* the lawn, out to the woods */}
      <mesh position={[0, FLOOR - 0.04, 20]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[200, 48]} />
        <meshBasicMaterial ref={lawn} color="#0a1a18" toneMapped={false} />
      </mesh>
      <mesh geometry={woodsGeo} material={woods} position={[0, FLOOR - 4 + 32, 20]} renderOrder={-5} />
      <mesh geometry={gardenGeo} material={garden} position={[0, FLOOR - 2 + 15, 16]} renderOrder={-4} />
      {/* shrubs against the back and side glass */}
      <mesh material={leafy} position={[0, FLOOR + 6, WALL_Z - 3.2]} renderOrder={-3}>
        <planeGeometry args={[64, 12]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={leafy} position={[s * (SIDE + 3.5), FLOOR + 6, 26]} rotation={[0, -s * (Math.PI / 2), 0]} renderOrder={-3}>
          <planeGeometry args={[64, 12]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- rain ----------

function streakTexture() {
  return canvasTexture('gh-streaks', 256, 512, (g, w, h) => {
    const r = rng(5);
    for (let i = 0; i < 150; i++) {
      const x = r() * w;
      const y = r() * h;
      const len = 26 + r() * 50;
      const a = 0.15 + r() * 0.45;
      for (const dy of [0, -h]) {
        const grad = g.createLinearGradient(x, y + dy, x - len * 0.12, y + dy + len);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(255,255,255,${a})`);
        g.strokeStyle = grad;
        g.lineWidth = 1 + r() * 0.6;
        g.beginPath();
        g.moveTo(x, y + dy);
        g.lineTo(x - len * 0.12, y + dy + len);
        g.stroke();
      }
    }
  });
}

/** Soft flakes of a few sizes on a transparent tile, for snow falling far off. */
function flakeTexture() {
  return canvasTexture('gh-flakes', 256, 512, (g, w, h) => {
    const r = rng(12);
    for (let i = 0; i < 120; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 1.2 + Math.pow(r(), 2) * 3.2;
      const a = 0.35 + r() * 0.55;
      for (const dy of [0, -h, h]) {
        const b = g.createRadialGradient(x, y + dy, 0, x, y + dy, rad);
        b.addColorStop(0, `rgba(255,255,255,${a})`);
        b.addColorStop(0.5, `rgba(255,255,255,${a * 0.6})`);
        b.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = b;
        g.fillRect(x - rad, y + dy - rad, rad * 2, rad * 2);
      }
    }
  });
}

/**
 * Rain and snow far beyond the glass, as painted sheets scrolling down (the
 * near rain and snow are particles): heavier and faster in a storm, flickering
 * with the lightning; slow drifting flakes in the snow.
 */
function FarFall() {
  const layers = useMemo(() => {
    const streaks = streakTexture();
    const flakes = flakeTexture();
    return [
      { z: WALL_Z - 9, w: 90, h: 55, tile: [9, 18], speed: 1.7, opacity: 0.13, snowTile: [10, 20], drift: 0.09, snowOpacity: 0.5 },
      { z: WALL_Z - 20, w: 140, h: 70, tile: [16, 30], speed: 1.1, opacity: 0.1, snowTile: [16, 32], drift: 0.06, snowOpacity: 0.38 },
    ].map((l, i) => {
      const rt = streaks.clone();
      rt.repeat.set(l.w / l.tile[0], l.h / l.tile[1]);
      rt.offset.x = i * 0.37;
      rt.needsUpdate = true;
      const st = flakes.clone();
      st.repeat.set(l.w / l.snowTile[0], l.h / l.snowTile[1]);
      st.offset.x = i * 0.53;
      st.needsUpdate = true;
      const rain = new THREE.MeshBasicMaterial({ map: rt, color: '#9fc0cc', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const snow = new THREE.MeshBasicMaterial({ map: st, color: '#aebbc8', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      return { ...l, rt, st, rain, snow, sway: i * 1.7 };
    });
  }, []);
  const rainMesh = useRef<(THREE.Mesh | null)[]>([]);
  const snowMesh = useRef<(THREE.Mesh | null)[]>([]);
  const base = useMemo(() => new THREE.Color('#9fc0cc'), []);
  useFrame(({ clock }, dt) => {
    const u = tickWeather();
    const step = Math.min(dt, 0.1);
    const rain = u.uRain.value;
    const storm = u.uStorm.value;
    const snow = u.uSnow.value;
    // the same gusts as the near rain (see Precipitation)
    const c = u.uCycle.value * Math.PI * 2;
    const gust = 1 + storm * (0.32 * Math.sin(c * 113) + 0.18 * Math.sin(c * 271 + 1.3));
    layers.forEach((l, i) => {
      l.rt.offset.y += step * l.speed * (1 + 0.6 * storm);
      l.rt.offset.x += step * l.speed * 0.1 * storm * gust;
      l.rain.opacity = l.opacity * rain * (1 + 0.7 * storm);
      l.rain.color.copy(base).multiplyScalar(1 + u.uFlash.value * 3);
      l.st.offset.y += step * l.drift;
      l.st.offset.x = Math.sin(clock.elapsedTime * 0.23 + l.sway) * 0.04;
      l.snow.opacity = l.snowOpacity * snow;
      const rm = rainMesh.current[i];
      const sm = snowMesh.current[i];
      if (rm) rm.visible = rain > 0.003;
      if (sm) sm.visible = snow > 0.003;
    });
  });
  return (
    <group>
      {/* drawn after the garden ring and before the shrubs at the glass, which are nearer */}
      {layers.map((l, i) => (
        <group key={i} position={[0, FLOOR + l.h / 2, l.z]}>
          <mesh ref={(m) => void (rainMesh.current[i] = m)} material={l.rain} renderOrder={-3.4 - i * 0.2}>
            <planeGeometry args={[l.w, l.h]} />
          </mesh>
          <mesh ref={(m) => void (snowMesh.current[i] = m)} material={l.snow} renderOrder={-3.4 - i * 0.2}>
            <planeGeometry args={[l.w, l.h]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------- the weather on the glass ----------

/** Turns a pane lying in xy so its x runs along the house (z) and its y up the roof slope on side s. */
function roofQuaternion(s: 1 | -1) {
  const a = Math.atan2(RIDGE - EAVE, SIDE);
  const X = new THREE.Vector3(0, 0, 1);
  const Y = new THREE.Vector3(-s * Math.cos(a), Math.sin(a), 0);
  const Z = new THREE.Vector3().crossVectors(X, Y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

/**
 * Drops, drips, frost and snow on every pane: the back wall up to the eaves and
 * its gable, both side walls and both roof slopes. Frost and settled snow follow
 * the glazing (posts every bay, the laps, the transom rail, the rafters and
 * purlins); on the roof the snow lies across the glass.
 */
function GlassWeather() {
  const lowY = (CILL_Y + EAVE) / 2;
  const lowH = EAVE - CILL_Y;
  const gableY = (EAVE + RIDGE) / 2;
  const len = END_Z - WALL_Z;
  const zc = (END_Z + WALL_Z) / 2;
  const slopeLen = Math.hypot(SIDE, RIDGE - EAVE);
  const g = useMemo(
    () =>
      once('gh-glass-weather', () => {
        const gable = new THREE.Shape();
        const hh = (RIDGE - EAVE) / 2;
        gable.moveTo(-SIDE, -hh);
        gable.lineTo(SIDE, -hh);
        gable.lineTo(0, hh);
        gable.closePath();
        // posts along the back wall, every bay along the sides and roof
        const posts = Array.from({ length: 7 }, (_, k) => -SIDE + BAY * (k + 1));
        const along = Array.from({ length: 11 }, (_, k) => WALL_Z + BAY * (k + 1) - zc);
        return { gable: new THREE.ShapeGeometry(gable), posts, along, roof: [roofQuaternion(-1), roofQuaternion(1)] };
      }),
    [zc],
  );
  const wallBars = { y: [1.3 - lowY, RAIL_Y - lowY] };
  return (
    <group>
      <group position={[0, lowY, WALL_Z + 0.03]}>
        <WindowWeather width={SIDE * 2} height={lowH} bars={{ x: g.posts, ...wallBars }} renderOrder={3} />
      </group>
      <group position={[0, gableY, WALL_Z + 0.03]}>
        <WindowWeather width={SIDE * 2} height={RIDGE - EAVE} geometry={g.gable} bars={{ x: g.posts, y: [12.6 - gableY, 16.8 - gableY] }} renderOrder={3} />
      </group>
      {([-1, 1] as const).map((s) => (
        <group key={`side${s}`} position={[s * (SIDE - 0.05), lowY, zc]} rotation={[0, (-s * Math.PI) / 2, 0]}>
          <WindowWeather width={len} height={lowH} bars={{ x: s > 0 ? g.along : g.along.map((x) => -x), ...wallBars }} renderOrder={3} />
        </group>
      ))}
      {([-1, 1] as const).map((s, i) => (
        <group key={`roof${s}`} position={[(s * SIDE) / 2, gableY + 0.1, zc]} quaternion={g.roof[i]}>
          <WindowWeather roof width={len} height={slopeLen} bars={{ x: g.along, y: [(0.34 - 0.5) * slopeLen, (0.67 - 0.5) * slopeLen] }} renderOrder={3} />
        </group>
      ))}
    </group>
  );
}

export function Garden() {
  return (
    <group>
      <Sky />
      <Grounds />
      <FarFall />
      {/* rain and snow falling just outside the back and side walls, catching the festoon lights near the glass */}
      <Precipitation min={[-27, FLOOR, WALL_Z - 9]} max={[27, RIDGE + 2, WALL_Z - 0.45]} glow={{ position: [0, 5, WALL_Z + 0.4], radius: 10, strength: 0.16 }} />
      {([-1, 1] as const).map((s) => (
        <Precipitation key={s} min={[s * (SIDE + 0.45), FLOOR, WALL_Z - 9]} max={[s * (SIDE + 7), EAVE + 6, END_Z]} density={0.4} />
      ))}
      <GlassWeather />
    </group>
  );
}
