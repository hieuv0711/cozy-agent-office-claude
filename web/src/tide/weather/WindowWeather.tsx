import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PERIOD, tickWeather, U } from './runtime';

// The weather on a pane of glass, drawn as one transparent plane just inside
// it. Rain: beads of water that land, linger and slowly dry, and heavier drops
// sliding down in fits and starts, each leaving a thin wet trail through the
// faint condensation. Snow: frost feathering in from the frame, snow settled
// along the bottom edge and the glazing bars, and a few flakes stuck to the
// glass. The drops act like tiny lenses: a dark rim, the night sky glowing in
// their lower half and a glint of the room's lamplight. All in one fragment
// shader; every animation loops a whole number of times per PERIOD, so the
// shared clock wraps cleanly. A clear night or a sunny day leaves the glass dry
// and the plane hidden.

const MAX_BARS = 12;

const VERT = /* glsl */ `
uniform float uSeed;
varying vec2 vP;
varying float vSeed;
void main() {
  vP = position.xy;
  // a different pattern on every pane, from where the pane is (or a fixed one, for glass that moves)
  vec3 o = modelMatrix[3].xyz;
  vSeed = uSeed > 0.0 ? uSeed : floor(fract(sin(dot(o, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 97.0) + 3.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
#define MAX_BARS ${MAX_BARS}
uniform float uCycle;
uniform float uWet;
uniform float uFrost;
uniform vec2 uSize;
uniform float uRoof;
uniform float uBarsX[MAX_BARS];
uniform float uBarsY[MAX_BARS];
uniform int uNX;
uniform int uNY;
uniform vec3 uWarm;
uniform vec3 uCool;
uniform float uOpacity;
uniform vec2 uClear;
varying vec2 vP;
varying float vSeed;

float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 h22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s / 0.9375;
}
// A cycle repeating about PERIOD / seconds times per period (rounded, so the wrap is seamless).
float loopT(float seconds, float phase) {
  return fract(uCycle * max(1.0, floor(${PERIOD}.0 / seconds + 0.5)) + phase);
}
float loopN(float seconds, float phase) {
  float n = max(1.0, floor(${PERIOD}.0 / seconds + 0.5));
  return mod(floor(uCycle * n + phase), n);
}
void over(inout vec4 acc, vec3 c, float a) {
  a = clamp(a, 0.0, 1.0);
  acc = vec4(c * a, a) + acc * (1.0 - a);
}

// Distance to the nearest frame member across x and across y (the pane's edges
// and its glazing bars), and the height above the nearest ledge below.
vec3 frame(vec2 p) {
  vec2 h = uSize * 0.5;
  float dx = min(p.x + h.x, h.x - p.x);
  float dy = min(p.y + h.y, h.y - p.y);
  float below = p.y + h.y;
  for (int i = 0; i < MAX_BARS; i++) {
    if (i >= uNX) break;
    dx = min(dx, abs(p.x - uBarsX[i]));
  }
  for (int i = 0; i < MAX_BARS; i++) {
    if (i >= uNY) break;
    float d = p.y - uBarsY[i];
    dy = min(dy, abs(d));
    if (d >= 0.0) below = min(below, d);
  }
  return vec3(dx, dy, below);
}

// A drop on the glass works like a tiny lens: its edge bends the light away (a
// dark ring), its lower half shows the sky above it upside down (a soft glow low
// in the drop), and the room's lamps glint on it.
// d: offset from its centre, r: radius.
void lens(inout vec4 acc, vec2 d, float r, float px, float amt, float glint) {
  float l = length(d);
  float body = 1.0 - smoothstep(r - px, r + px, l);
  if (body < 0.001) return;
  float e = l / r;
  float rim = smoothstep(0.45, 1.0, e);
  float low = smoothstep(-0.25, 0.75, -d.y / r) * (1.0 - 0.6 * smoothstep(0.8, 1.0, e));
  float gl = 1.0 - smoothstep(r * 0.15 - px * 0.5, r * 0.15 + px, length(d - vec2(-0.32, 0.38) * r));
  over(acc, vec3(0.0), body * (0.1 + 0.32 * rim) * amt);
  over(acc, uCool, body * low * 0.34 * amt);
  over(acc, uWarm, gl * glint * 0.55 * amt);
}

// Beads in cells cell units wide (dens of them hold one); each pops in, lingers
// and slowly shrinks away over life seconds.
void beads(inout vec4 acc, vec2 p, float cell, float dens, float life, float salt, float px, float amt) {
  vec2 g = p / cell + salt;
  vec2 id = floor(g);
  float n = h21(id);
  if (n > dens) return;
  float t = loopT(life, h21(id + 4.7));
  float grow = smoothstep(0.0, 0.012, t) * (1.0 - smoothstep(0.55, 1.0, t));
  vec2 c = (h22(id + 2.3) - 0.5) * 0.42;
  float r = mix(0.1, 0.3, h21(id + 9.1)) * mix(0.5, 1.0, grow) * cell;
  vec2 d = (fract(g) - 0.5 - c) * cell;
  d.y *= 0.9;
  float vis = smoothstep(0.8, 2.2, r / px) * grow * amt;
  if (vis < 0.004) return;
  lens(acc, d, r, px, vis, step(0.62, h21(id + 6.6)) * step(0.025, r));
}

// Heavier drops sliding down in fits and starts (columns colW wide, dens of them
// dripping), each leaving a thin wet trail with tiny beads along it.
void drips(inout vec4 acc, inout float wiped, vec2 p, float colW, float dens, float speed, float salt, float px, float amt) {
  float ci = floor(p.x / colW + salt);
  float n = h21(vec2(ci, 7.7 + salt));
  if (n > dens) return;
  float k = n / dens;
  float H = uSize.y;
  float travel = H * 1.3 + 0.8;
  float run = travel / (speed * (0.6 + 0.8 * k));
  float ph = h21(vec2(ci, 1.3 + salt));
  float t = loopT(run, ph);
  float N = 4.0 + floor(k * 3.0);
  float prog = t - sin(t * 6.2831853 * N) / (6.2831853 * N);   // it pauses N times on the way down
  float top = H * 0.5 - H * 0.4 * h21(vec2(ci, loopN(run, ph) + salt));
  float y0 = top - prog * travel;
  float x0 = (ci + 0.5 - salt) * colW + (h21(vec2(ci, 3.3 + salt)) - 0.5) * colW * 0.45;
  float x = p.x - x0 - (sin(p.y * 3.1 + n * 40.0) * 0.024 + sin(p.y * 7.9 + n * 9.0) * 0.009);
  if (abs(x) > colW * 0.5) return;
  float r = mix(0.042, 0.066, k);
  float appear = smoothstep(0.0, 0.03, t) * amt;
  lens(acc, vec2(x, (p.y - y0) * 0.8), r, px, appear * smoothstep(0.6, 2.0, r / px), 1.0);
  float above = p.y - y0;
  if (above <= 0.0 || above > top - y0) return;
  float trailLen = 0.7 + 1.2 * k;
  float fade = exp(-above / trailLen) * appear;
  float tw = r * 0.26;
  float wv = max(tw, px * 0.7);
  float trail = (1.0 - smoothstep(wv - px * 0.5, wv + px * 0.5, abs(x))) * fade * (tw / wv);
  wiped = max(wiped, (1.0 - smoothstep(r * 0.7, r * 1.6, abs(x))) * exp(-above / (trailLen * 3.0)) * appear);
  over(acc, uCool, trail * 0.3);
  // tiny beads left behind on the trail
  float bc = 0.07;
  float bi = floor(p.y / bc);
  if (h21(vec2(ci * 7.0 + bi, salt + 2.0)) > 0.5) {
    float br = r * mix(0.22, 0.4, h21(vec2(bi, ci)));
    lens(acc, vec2(x, (fract(p.y / bc) - 0.5) * bc), br, px, exp(-above / (trailLen * 1.6)) * appear * smoothstep(0.6, 1.8, br / px), 0.0);
  }
}

// A little frost feathering in from the frame, mostly in the corners.
void frost(inout vec4 acc, vec2 q, vec3 fr) {
  float e = min(fr.x, fr.y);
  float corner = 1.0 - smoothstep(0.0, 0.7, max(fr.x, fr.y));
  float n1 = fbm(q * 1.8);
  float reach = (0.015 + 0.07 * n1 + 0.22 * corner * corner) * smoothstep(0.0, 0.8, uFrost);
  float m = 1.0 - smoothstep(reach * 0.2, reach, e);
  if (m < 0.003) return;
  vec2 s = q * 15.0;
  vec2 warp = vec2(vnoise(q * 3.0), vnoise(q * 3.0 + 7.0));
  float a1 = 1.0 - abs(vnoise(s + warp * 6.0) * 2.0 - 1.0);
  float a2 = 1.0 - abs(vnoise(s * 2.3 - warp * 4.0 + 4.0) * 2.0 - 1.0);
  float cry = pow(a1, 6.0) * 0.6 + pow(a2, 7.0) * 0.4;
  float grain = vnoise(q * 60.0);
  vec3 col = mix(vec3(0.46, 0.53, 0.63), uWarm * 0.62, 0.35);
  over(acc, col, m * (0.1 + 0.42 * cry + 0.08 * grain) * (0.55 + 0.45 * (1.0 - smoothstep(0.0, reach, e))));
}

// Snow settled along the bottom of the pane and on the glazing bars, drifted up in the corners.
void ledges(inout vec4 acc, vec2 q, vec3 fr, float px) {
  float h = 0.035 + 0.06 * vnoise(vec2(q.x * 2.4, 1.0)) + 0.025 * vnoise(vec2(q.x * 8.0, 5.0));
  h += 0.09 * (1.0 - smoothstep(0.0, 0.35, fr.x));
  h *= smoothstep(0.1, 0.9, uFrost);
  float m = 1.0 - smoothstep(h - px, h + px, fr.z);
  if (m < 0.003) return;
  float lit = smoothstep(h * 0.2, h, fr.z);
  vec3 shade = mix(vec3(0.26, 0.3, 0.38), uWarm * 0.3, 0.3);
  vec3 top = mix(vec3(0.6, 0.65, 0.74), uWarm * 0.72, 0.35);
  over(acc, mix(shade, top, lit), m * 0.94);
}

// Snow lying on a roof pane, seen from below: soft, uneven, lit by the room.
void roofSnow(inout vec4 acc, vec2 q, vec3 fr) {
  float n = fbm(q * 0.45) * 0.65 + fbm(q * 2.2 + 7.0) * 0.35;
  float low = 1.0 - smoothstep(0.0, 1.8, fr.z);
  float edge = 1.0 - smoothstep(0.0, 0.25, min(fr.x, fr.y));
  float cov = smoothstep(0.36, 0.6, n + 0.25 * low + 0.2 * edge - 0.35 * (1.0 - uFrost)) * uFrost;
  vec3 col = mix(vec3(0.3, 0.33, 0.4), uWarm * 0.42 + vec3(0.06, 0.07, 0.09), 0.5) * (0.75 + 0.5 * n);
  over(acc, col, cov * (0.62 + 0.3 * n));
}

// A few flakes stuck to the glass, mostly near the frame; each melts away in time.
void flakes(inout vec4 acc, vec2 q, vec3 fr, float px) {
  float cell = 0.13;
  vec2 g = q / cell + 41.0;
  vec2 id = floor(g);
  float near = 1.0 - smoothstep(0.0, 0.6, min(fr.x, fr.y));
  if (h21(id + 1.9) > 0.02 + 0.14 * near) return;
  float t = loopT(36.0, h21(id + 8.3));
  float life = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.7, 1.0, t)) * uFrost;
  vec2 c = (h22(id + 5.1) - 0.5) * 0.5;
  vec2 d = (fract(g) - 0.5 - c) * cell;
  float r = mix(0.012, 0.026, h21(id + 2.2)) * mix(0.4, 1.0, life);
  float ang = atan(d.y, d.x) + h21(id) * 6.2831853;
  float star = r * (0.7 + 0.3 * abs(cos(ang * 3.0)));
  float m = 1.0 - smoothstep(star - px, star + px, length(d));
  over(acc, mix(vec3(0.62, 0.68, 0.78), uWarm * 0.75, 0.3), m * 0.9 * life * smoothstep(0.5, 1.5, r / px));
}

void main() {
  vec2 p = vP;
  // glass you look through keeps its middle clear: skip that part before any work
  float keep = 1.0;
  if (uClear.y > 0.0) {
    keep = smoothstep(uClear.x, uClear.y, length(p / (uSize * 0.5)));
    if (keep < 0.002) discard;
  }
  vec2 q = p + vSeed * vec2(3.17, 1.73);   // pattern coordinates, different on every pane
  float px = max(max(fwidth(p.x), fwidth(p.y)), 1e-5);
  vec3 fr = frame(p);
  vec4 drops = vec4(0.0);
  float wiped = 0.0;
  if (uWet > 0.003) {
    float w = uWet;
    beads(drops, q, 0.17, 0.45, 26.0, 0.0, px, w);
    beads(drops, q, 0.075, 0.24, 17.0, 3.7, px, w * 0.7);
    drips(drops, wiped, q, 0.34, 0.26, 0.3, 0.0, px, w);
  }
  vec4 back = vec4(0.0);
  // a faint condensation on the glass, heavier low down, wiped clear where drops ran
  float mist = uWet * 0.7 + uFrost * 0.35;
  if (mist > 0.003) {
    float hz = 0.45 + 0.55 * fbm(q * 0.7);
    float low = 1.0 - smoothstep(-0.45, 0.35, p.y / max(uSize.y, 0.01));
    float a = (0.05 + 0.07 * low) * hz * mist * (1.0 - 0.9 * wiped);
    over(back, mix(uCool, uWarm, 0.3) * 0.55, a);
  }
  if (uFrost > 0.003) {
    if (uRoof > 0.5) roofSnow(back, q, fr);
    else frost(back, q, fr);
  }
  vec4 acc = drops + back * (1.0 - drops.a);
  if (uFrost > 0.003) {
    if (uRoof < 0.5) ledges(acc, q, fr, px);
    flakes(acc, q, fr, px);
  }
  acc *= uOpacity * keep;
  if (acc.a < 0.002) discard;
  gl_FragColor = acc;
}`;

export interface WindowWeatherProps {
  /** The pane's size; the plane lies in the xy plane, centred, facing +z. */
  width: number;
  height: number;
  /**
   * Glazing bars across the pane, in its own coordinates (x of the upright bars,
   * y of the cross bars, at most 12 each): frost gathers along them and snow
   * settles on top of the cross bars.
   */
  bars?: { x?: number[]; y?: number[] };
  /** A roof pane: snow lies across it instead of along the bottom (its local -y must point down the slope). */
  roof?: boolean;
  /** Draw on this shape instead of a width x height rectangle (keep it inside that rectangle, centred on it). */
  geometry?: THREE.BufferGeometry;
  /** The room's light caught by the drops, frost and snow (default warm lamplight). */
  warm?: THREE.ColorRepresentation;
  /** The night sky seen through the drops (default a cool blue). */
  cool?: THREE.ColorRepresentation;
  opacity?: number;
  /** Draw after the glass (default 4). */
  renderOrder?: number;
  /** Keep the middle clear: inner and outer radius, as fractions of the half size (0 at the centre, 1 at the edges' middles). */
  clearCenter?: [number, number];
  /** A fixed pattern, for glass that moves with the camera (any whole number above 0). */
  seed?: number;
}

/**
 * The weather on a window: put it just inside the glass, the same size as the
 * pane. Drops and drips for rain; frost, settled snow and a few flakes for
 * snow; nothing for a clear night or a sunny day. One shader, one draw call,
 * hidden when the glass is dry and clear.
 */
export function WindowWeather({ width, height, bars, roof = false, geometry, warm = '#ffcf94', cool = '#7d9cc8', opacity = 1, renderOrder = 4, clearCenter, seed = 0 }: WindowWeatherProps) {
  const plane = useMemo(() => geometry ?? new THREE.PlaneGeometry(width, height), [geometry, width, height]);
  useEffect(
    () => () => {
      if (!geometry) plane.dispose();
    },
    [plane, geometry],
  );
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uCycle: U.uCycle,
          uWet: U.uWet,
          uFrost: U.uFrost,
          uSize: { value: new THREE.Vector2(1, 1) },
          uRoof: { value: 0 },
          uBarsX: { value: new Array<number>(MAX_BARS).fill(0) },
          uBarsY: { value: new Array<number>(MAX_BARS).fill(0) },
          uNX: { value: 0 },
          uNY: { value: 0 },
          uWarm: { value: new THREE.Color() },
          uCool: { value: new THREE.Color() },
          uOpacity: { value: 1 },
          uClear: { value: new THREE.Vector2(0, 0) },
          uSeed: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        premultipliedAlpha: true,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const bx = bars?.x ?? [];
  const by = bars?.y ?? [];
  useLayoutEffect(() => {
    const u = mat.uniforms;
    u.uSize.value.set(width, height);
    u.uRoof.value = roof ? 1 : 0;
    for (let i = 0; i < MAX_BARS; i++) {
      u.uBarsX.value[i] = bx[i] ?? 0;
      u.uBarsY.value[i] = by[i] ?? 0;
    }
    u.uNX.value = Math.min(MAX_BARS, bx.length);
    u.uNY.value = Math.min(MAX_BARS, by.length);
    u.uWarm.value.set(warm);
    u.uCool.value.set(cool);
    u.uOpacity.value = opacity;
    u.uClear.value.set(clearCenter?.[0] ?? 0, clearCenter?.[1] ?? 0);
    u.uSeed.value = seed;
  });
  const mesh = useRef<THREE.Mesh>(null);
  // drawn (fully discarded) for the first frames, so the shader compiles on load rather than at the change of weather
  const warmup = useRef(0);
  useFrame(() => {
    tickWeather();
    if (mesh.current) mesh.current.visible = U.uWet.value > 0.003 || U.uFrost.value > 0.003 || warmup.current++ < 3;
  });
  return <mesh ref={mesh} geometry={plane} material={mat} renderOrder={renderOrder} />;
}
