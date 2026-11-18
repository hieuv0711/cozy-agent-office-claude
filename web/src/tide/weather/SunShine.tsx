import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PERIOD, tickWeather, U } from './runtime';

// The sun coming in through a room's windows on a sunny day: a warm patch of
// light where each window's shape lands on the floor (and on any desk or bench
// top it crosses), with the glazing bars' thin shadows in it; a soft beam of
// light in the air from the window down to the patch; and a few motes of dust
// drifting in the beam. All of it fades with the sunshine and is hidden in any
// other weather, so it costs nothing at night or in the rain.
//
// Cost when shown: a patch is one quad per window and surface (it brightens
// what is under it); a beam is one box per window, drawn only where the beam
// is on screen, whose shader works out how far the eye's ray runs through the
// beam (no full-screen pass); the motes are a few dozen points per window.

export interface SunWindow {
  /** The opening's centre, in the room's own coordinates. */
  c: [number, number, number];
  /** Its width (along the wall) and height. */
  w: number;
  h: number;
  /** Which wall: 0 for the back wall (the opening lies in x and y), π/2 for the left wall (in z and y). */
  yaw: number;
  /** Panes across and up: the glazing bars throw thin shadows into the light. */
  panes?: [number, number];
  /** An arched head: how much higher the crown is than the springing, as a share of the height. */
  arch?: number;
}

/** A level rectangle the sun can land on (the floor, a desk top), or the round top inside it. */
export interface SunSurface {
  y: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  round?: boolean;
}

export interface SunShineProps {
  windows: SunWindow[];
  /** The direction the sunlight travels: into the room and down. */
  dir: [number, number, number];
  /** Where it lands: the floor first, then any tops it crosses. */
  surfaces: SunSurface[];
  /** How strong the patches are (1 = the default). */
  patch?: number;
  /** How bright the beams are (1 = the default; 0 = no beams). */
  beam?: number;
  /** Dust motes per window (0 = none). */
  motes?: number;
  /** The sunlight's colour. */
  color?: THREE.ColorRepresentation;
}

/** The window's frame in the room: its lower left corner, and its width and height as vectors. */
function frameOf(win: SunWindow) {
  const right = new THREE.Vector3(Math.cos(win.yaw), 0, -Math.sin(win.yaw));
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Vector3(...win.c);
  const W = right.clone().multiplyScalar(win.w);
  const H = up.clone().multiplyScalar(win.h);
  const O = c.clone().addScaledVector(W, -0.5).addScaledVector(H, -0.5);
  return { O, W, H };
}

// ---------- the window's shape (shared by the patch and the beam) ----------

const SHAPE = /* glsl */ `
uniform vec2 uPanes;
uniform float uArch;
// The window's light at (a, b) across and up the opening: 1 in the glass, soft at its edges,
// a thin shadow under each glazing bar, nothing above an arched head.
float windowLight(vec2 ab, float soft) {
  float m = smoothstep(0.0, soft, ab.x) * smoothstep(0.0, soft, 1.0 - ab.x) * smoothstep(0.0, soft, ab.y) * smoothstep(0.0, soft, 1.0 - ab.y);
  if (uArch > 0.0) {
    // the head is an arc through both springings and the crown
    float rise = uArch;
    float R = (0.25 + rise * rise) / (2.0 * rise);
    float cy = 1.0 - R;
    float d = length(vec2(ab.x - 0.5, (ab.y - cy)));
    m *= 1.0 - smoothstep(R - soft, R, d) * step(1.0 - rise, ab.y);
  }
  vec2 g = ab * uPanes;
  vec2 f = abs(fract(g) - 0.5);
  // inside the frame only: the bars between the panes
  float bx = uPanes.x > 1.0 ? smoothstep(0.5 - 0.016 * uPanes.x, 0.5, f.x) * step(0.5 / uPanes.x, ab.x) * step(ab.x, 1.0 - 0.5 / uPanes.x) : 0.0;
  float by = uPanes.y > 1.0 ? smoothstep(0.5 - 0.016 * uPanes.y, 0.5, f.y) * step(0.5 / uPanes.y, ab.y) * step(ab.y, 1.0 - 0.5 / uPanes.y) : 0.0;
  return m * (1.0 - 0.6 * max(bx, by));
}`;

// ---------- patches ----------

const PATCH_VERT = /* glsl */ `
attribute vec2 aAb;
varying vec2 vAb;
varying vec3 vW;
void main() {
  vAb = aAb;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PATCH_FRAG = /* glsl */ `
uniform float uSun;
uniform vec3 uColor;
uniform vec4 uClip;
uniform float uRound;
varying vec2 vAb;
varying vec3 vW;
${SHAPE}
void main() {
  if (vW.x < uClip.x || vW.x > uClip.z || vW.z < uClip.y || vW.z > uClip.w) discard;
  if (uRound > 0.5) {
    vec2 e = (vW.xz - (uClip.xy + uClip.zw) * 0.5) / ((uClip.zw - uClip.xy) * 0.5);
    if (dot(e, e) > 1.0) discard;
  }
  float l = windowLight(vAb, 0.07) * uSun;
  if (l < 0.002) discard;
  // multiplied into what is under it (blending: dst * (1 + src)), several times over: sunlight is far
  // brighter than lamplight, and the floor's grain shows through
  gl_FragColor = vec4(uColor * l, 1.0);
}`;

// ---------- beams ----------

const BEAM_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BEAM_FRAG = /* glsl */ `
uniform float uSun;
uniform float uStrength;
uniform vec3 uColor;
uniform mat4 uInv;      // the room to the beam's own box (0..1 across, up the window, along the light)
uniform float uFloor;
varying vec3 vW;
${SHAPE}
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vW - ro);
  // the eye's ray in the beam's box: where it goes in and out
  vec3 o = (uInv * vec4(ro, 1.0)).xyz;
  vec3 d = (uInv * vec4(rd, 0.0)).xyz;
  vec3 inv = 1.0 / d;
  vec3 t0 = (vec3(0.0) - o) * inv;
  vec3 t1 = (vec3(1.0) - o) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float a = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  float b = min(min(tmax.x, tmax.y), tmax.z);
  // and not below the floor
  if (rd.y < 0.0) b = min(b, (uFloor - ro.y) / rd.y);
  float len = b - a;
  if (len <= 0.0) discard;
  vec3 m = o + d * (a + b) * 0.5;
  // light along the beam: strongest by the window, fading as it nears the floor
  float along = 1.0 - smoothstep(0.15, 1.0, m.z);
  float dens = windowLight(m.xy, 0.16) * (0.35 + 0.65 * along);
  float k = (1.0 - exp(-len * 0.32)) * dens * uStrength * uSun;
  if (k < 0.002) discard;
  gl_FragColor = vec4(uColor * k, k);
}`;

// ---------- dust ----------

const MOTE_VERT = /* glsl */ `
uniform float uCycle;
uniform float uSun;
uniform vec3 uO;
uniform vec3 uWv;
uniform vec3 uHv;
uniform vec3 uLv;
uniform float uFloor;
uniform float uPx;
attribute vec4 aSeed;   // across, up, along (0..1), phase
attribute vec2 aRate;   // drifts and twinkles per period (whole numbers)
varying float vA;
${SHAPE}
void main() {
  float s = 6.2831853 * (uCycle * aRate.x + aSeed.w);
  vec3 ab = aSeed.xyz + vec3(sin(s) * 0.03, sin(s * 0.7 + 1.3) * 0.04 + 0.02 * sin(s * 2.0), cos(s) * 0.02);
  vec3 p = uO + uWv * ab.x + uHv * ab.y + uLv * ab.z;
  float inside = windowLight(ab.xy, 0.2) * step(uFloor + 0.05, p.y) * (1.0 - smoothstep(0.6, 1.0, ab.z));
  float tw = 0.55 + 0.45 * sin(6.2831853 * (uCycle * aRate.y + aSeed.w * 3.1));
  vA = inside * tw * uSun;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uPx * 0.035 / -mv.z, 1.0, 4.0);
  gl_Position = projectionMatrix * mv;
  if (vA < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const MOTE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vA * 0.7;
  gl_FragColor = vec4(uColor * a, a);
}`;

/** How many times a motion of about `seconds` fits in the shared clock's period (a whole number: seamless). */
const PERIOD_CYCLES = (seconds: number) => Math.max(1, Math.round(PERIOD / seconds));

function rnd(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sunshine through a room's windows on a sunny day: patches on the floor and
 * tops, soft beams, and dust in them. Mount it in the room (its coordinates).
 */
export function SunShine({ windows, dir, surfaces, patch = 1, beam = 1, motes = 40, color = '#ffd29a' }: SunShineProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const built = useMemo(() => {
    const d = new THREE.Vector3(...dir).normalize();
    const floor = surfaces[0]?.y ?? 0;
    const sun = { value: 0 };
    const col = new THREE.Color(color);
    const cycle = U.uCycle;
    const patches: { geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial }[] = [];
    const beams: { geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial; matrix: THREE.Matrix4 }[] = [];
    const dust: { geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial }[] = [];
    const px = { value: 1000 };
    windows.forEach((win, wi) => {
      const { O, W, H } = frameOf(win);
      const shape = { uPanes: { value: new THREE.Vector2(...(win.panes ?? [1, 1])) }, uArch: { value: win.arch ?? 0 } };
      // patches: the window's corners carried along the light onto each surface
      for (const s of surfaces) {
        if (d.y >= -0.01) break;
        const corner = (a: number, b: number) => {
          const p = O.clone().addScaledVector(W, a).addScaledVector(H, b);
          return p.addScaledVector(d, (s.y - p.y) / d.y);
        };
        const q = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(q.flatMap((v) => [v.x, s.y + 0.004, v.z]), 3));
        geo.setAttribute('aAb', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        geo.computeBoundingSphere();
        const mat = new THREE.ShaderMaterial({
          vertexShader: PATCH_VERT,
          fragmentShader: PATCH_FRAG,
          uniforms: { uSun: sun, uColor: { value: col.clone().multiplyScalar(5.5 * patch) }, uClip: { value: new THREE.Vector4(s.x0, s.z0, s.x1, s.z1) }, uRound: { value: s.round ? 1 : 0 }, ...shape },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.CustomBlending,
          blendEquation: THREE.AddEquation,
          blendSrc: THREE.DstColorFactor,
          blendDst: THREE.OneFactor,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
        patches.push({ geo, mat });
      }
      // the beam: the window swept along the light far enough for its head to reach the floor
      if (beam > 0 && d.y < -0.01) {
        const len = (O.y + H.y - floor) / -d.y;
        const L = d.clone().multiplyScalar(len);
        const matrix = new THREE.Matrix4().makeBasis(W, H, L).setPosition(O);
        const inv = matrix.clone().invert();
        const mat = new THREE.ShaderMaterial({
          vertexShader: BEAM_VERT,
          fragmentShader: BEAM_FRAG,
          uniforms: { uSun: sun, uStrength: { value: 0.24 * beam }, uColor: { value: col.clone() }, uInv: { value: inv }, uFloor: { value: floor }, ...shape },
          transparent: true,
          depthWrite: false,
          side: THREE.FrontSide,
          blending: THREE.AdditiveBlending,
          premultipliedAlpha: true,
        });
        const geo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
        beams.push({ geo, mat, matrix });
        // dust in it
        if (motes > 0) {
          const r = rnd(97 + wi * 31);
          const seed = new Float32Array(motes * 4);
          const rate = new Float32Array(motes * 2);
          for (let i = 0; i < motes; i++) {
            seed.set([0.08 + r() * 0.84, 0.06 + r() * 0.88, r() * 0.7, r()], i * 4);
            rate[i * 2] = PERIOD_CYCLES(14 + r() * 22);
            rate[i * 2 + 1] = PERIOD_CYCLES(2.5 + r() * 4);
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(motes * 3), 3));
          g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
          g.setAttribute('aRate', new THREE.Float32BufferAttribute(rate, 2));
          const m = new THREE.ShaderMaterial({
            vertexShader: MOTE_VERT,
            fragmentShader: MOTE_FRAG,
            uniforms: { uCycle: cycle, uSun: sun, uO: { value: O }, uWv: { value: W }, uHv: { value: H }, uLv: { value: L }, uFloor: { value: floor }, uPx: px, uColor: { value: col.clone().multiplyScalar(1.4) }, ...shape },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            premultipliedAlpha: true,
          });
          dust.push({ geo: g, mat: m });
        }
      }
    });
    return { sun, px, patches, beams, dust };
    // the windows and surfaces are fixed for a room
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(
    () => () => {
      for (const p of [...built.patches, ...built.beams, ...built.dust]) {
        p.geo.dispose();
        p.mat.dispose();
      }
    },
    [built],
  );
  const group = useRef<THREE.Group>(null);
  // drawn (with nothing showing) for the first frames, so the shaders compile on load rather than at the change of weather
  const warmup = useRef(0);
  useFrame(() => {
    // the weather's sun eases out slowly at the very end: the last 1% is let go at once (it reaches nothing
    // there), so the sun stops drawing about six seconds after it goes in, with no step in the light
    const s = Math.max(0, (tickWeather().uSun.value - 0.01) / 0.99);
    built.sun.value = s;
    const rows = Math.max(1, size.height * dpr);
    built.px.value = camera.isPerspectiveCamera ? rows / (2 * Math.tan((camera.fov * Math.PI) / 360)) : rows;
    if (group.current) group.current.visible = s > 0 || warmup.current++ < 3;
  });
  return (
    <group ref={group} visible={false}>
      {built.patches.map((p, i) => (
        <mesh key={`p${i}`} geometry={p.geo} material={p.mat} renderOrder={3} />
      ))}
      {built.beams.map((b, i) => (
        <mesh key={`b${i}`} geometry={b.geo} material={b.mat} matrixAutoUpdate={false} matrix={b.matrix} renderOrder={8} />
      ))}
      {built.dust.map((m, i) => (
        <points key={`d${i}`} geometry={m.geo} material={m.mat} frustumCulled={false} renderOrder={9} />
      ))}
    </group>
  );
}
