import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PERIOD, tickWeather, U } from './runtime';

// Rain and snow falling through a box outside the windows. Each drop or flake
// is one instanced quad animated entirely in the vertex shader (no per-frame
// work on the CPU): rain is a thin streak, motion-blurred along its fall and
// turned to face the camera; snow is a soft round flake that sways as it
// drifts down. Every motion loops a whole number of times per PERIOD, so the
// shared clock can wrap without a jump.

const HIDE = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; vUv = vec2(0.0); vW = vec3(0.0); return;';

const RAIN_VERT = /* glsl */ `
uniform float uCycle;
uniform vec3 uMin;
uniform vec3 uMax;
uniform float uShow;   // which share of the streaks is falling (by rank)
uniform float uPx;     // world size of a pixel at distance 1
uniform float uLen;    // streak length
attribute vec4 aSeed;  // x, z in the box (0..1), fall phase, random
attribute vec2 aRate;  // falls per PERIOD (whole), rank (0..1)
varying vec2 vUv;
varying float vA;
varying vec3 vW;
void main() {
  if (aRate.y >= uShow) { ${HIDE} }
  vec3 size = uMax - uMin;
  float f = fract(aSeed.z + uCycle * aRate.x);       // 0 at the top of the box, 1 at the bottom
  float lean = 0.06 * (0.8 + 0.4 * aSeed.w);          // a breath of wind: sideways per unit of fall
  float fallen = f * size.y;
  vec3 head = vec3(uMin.x + fract(aSeed.x + lean * fallen / size.x) * size.x, uMax.y - fallen, uMin.z + aSeed.y * size.z);
  vec3 headW = (modelMatrix * vec4(head, 1.0)).xyz;
  vec3 dir = normalize(mat3(modelMatrix) * vec3(lean, -1.0, 0.0));
  vec3 toCam = cameraPosition - headW;
  float dist = length(toCam);
  vec3 side = normalize(cross(toCam, dir)); // screen right, so the quad keeps its winding
  float w = mix(0.008, 0.017, aSeed.w);
  float wpx = max(w, dist * uPx * 0.9);              // never thinner than about a pixel...
  float len = uLen * mix(0.7, 1.25, aSeed.w);
  vA = (w / wpx) * smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.94, 1.0, f)) * mix(0.55, 1.0, aSeed.w); // ...but fainter
  vec3 p = headW - dir * (position.y * len) + side * (position.x * wpx);
  vUv = vec2(position.x * 2.0, position.y);
  vW = head - normalize(vec3(lean, -1.0, 0.0)) * (position.y * len); // in the box's own space, for the glow
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uGlowPos;
uniform vec3 uGlowCol;
uniform float uGlowR;
varying vec2 vUv;
varying float vA;
varying vec3 vW;
void main() {
  float across = 1.0 - abs(vUv.x);
  float along = smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y)); // a bright head, a fading tail
  float a = across * across * along * vA * uOpacity;
  vec3 col = uColor;
  if (uGlowR > 0.0) {
    vec3 d = vW - uGlowPos;
    col += uGlowCol * exp(-dot(d, d) / (uGlowR * uGlowR));
  }
  gl_FragColor = vec4(col * a, a);
}`;

const SNOW_VERT = /* glsl */ `
uniform float uCycle;
uniform vec3 uMin;
uniform vec3 uMax;
uniform float uShow;
uniform float uPx;
uniform float uSize;   // flake radius
attribute vec4 aSeed;  // x, z in the box (0..1), fall phase, random
attribute vec4 aRate;  // falls per PERIOD, sways per PERIOD (whole numbers), sway phase, rank
varying vec2 vUv;
varying float vA;
varying vec3 vW;
void main() {
  if (aRate.w >= uShow) { ${HIDE} }
  vec3 size = uMax - uMin;
  float f = fract(aSeed.z + uCycle * aRate.x);
  float fallen = f * size.y;
  float s = 6.2831853 * (uCycle * aRate.y + aRate.z);
  float amp = mix(0.1, 0.45, aSeed.w);
  vec3 c = vec3(
    uMin.x + fract(aSeed.x + 0.1 * fallen / size.x) * size.x + sin(s) * amp,
    uMax.y - fallen,
    uMin.z + aSeed.y * size.z + cos(s) * amp * 0.6);
  vec3 cw = (modelMatrix * vec4(c, 1.0)).xyz;
  vec4 mv = viewMatrix * vec4(cw, 1.0);
  float r = uSize * mix(0.55, 1.35, aSeed.w * aSeed.w);
  float rpx = max(r, -mv.z * uPx * 1.1);
  float k = r / rpx;
  vA = k * k * smoothstep(0.0, 0.04, f) * (1.0 - smoothstep(0.95, 1.0, f)) * mix(0.65, 1.0, fract(aSeed.w * 7.31));
  mv.xy += position.xy * 2.0 * rpx;
  vUv = position.xy * 2.0;
  vW = c; // in the box's own space, for the glow
  gl_Position = projectionMatrix * mv;
}`;

const SNOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uGlowPos;
uniform vec3 uGlowCol;
uniform float uGlowR;
varying vec2 vUv;
varying float vA;
varying vec3 vW;
void main() {
  float d = length(vUv);
  float a = (1.0 - smoothstep(0.25, 1.0, d)) * vA * uOpacity;
  vec3 col = uColor;
  if (uGlowR > 0.0) {
    vec3 g = vW - uGlowPos;
    col += uGlowCol * exp(-dot(g, g) / (uGlowR * uGlowR));
  }
  gl_FragColor = vec4(col * a, a);
}`;

/** One quad: x across (-0.5..0.5), y along (0 at the head of a streak, 1 at its tail; centred for flakes). */
function quad(centred: boolean) {
  const g = new THREE.InstancedBufferGeometry();
  const y0 = centred ? -0.5 : 0;
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, y0, 0, 0.5, y0, 0, 0.5, y0 + 1, 0, -0.5, y0 + 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** A seeded random stream, so a box always gets the same drops. */
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

/** Rain: falls at 45 to 75 units a second (about 4.5 to 7.5 m/s at 10 cm a unit). */
function rainGeometry(n: number, H: number) {
  const g = quad(false);
  const r = rnd(9001 + n);
  const seed = new Float32Array(n * 4);
  const rate = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    seed.set([r(), r(), r(), r()], i * 4);
    const speed = 45 + r() * 30;
    rate[i * 2] = Math.max(1, Math.round((speed * PERIOD) / H));
    rate[i * 2 + 1] = (i + r()) / n; // evenly spread ranks, so density fades smoothly
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.setAttribute('aRate', new THREE.InstancedBufferAttribute(rate, 2));
  g.instanceCount = n;
  return g;
}

/** Snow: drifts down at 3 to 5.5 units a second, swaying once every 2 to 5 seconds. */
function snowGeometry(n: number, H: number) {
  const g = quad(true);
  const r = rnd(4242 + n);
  const seed = new Float32Array(n * 4);
  const rate = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    seed.set([r(), r(), r(), r()], i * 4);
    const speed = 3 + r() * 2.5;
    rate[i * 4] = Math.max(1, Math.round((speed * PERIOD) / H));
    rate[i * 4 + 1] = Math.round(PERIOD / (2 + r() * 3));
    rate[i * 4 + 2] = r();
    rate[i * 4 + 3] = (i + r()) / n;
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.setAttribute('aRate', new THREE.InstancedBufferAttribute(rate, 4));
  g.instanceCount = n;
  return g;
}

export interface PrecipitationProps {
  /** The box the rain or snow falls through, in its parent's coordinates (world space when the parent is untransformed). */
  min: [number, number, number];
  max: [number, number, number];
  /** Scales how much falls (1 = the default density). */
  density?: number;
  /** A light the falling rain and snow catch, e.g. the room's glow spilling out through the glass (same coordinates as min and max). */
  glow?: { position: [number, number, number]; radius: number; color?: THREE.ColorRepresentation; strength?: number };
  renderOrder?: number;
}

/**
 * Falling rain streaks or snowflakes in a box outside the windows: nothing on
 * a clear night or a sunny day, steady rain, drifting snow. Two draw calls at
 * most, and none when nothing is falling.
 */
export function Precipitation({ min, max, density = 1, glow, renderOrder = 1 }: PrecipitationProps) {
  const W = Math.abs(max[0] - min[0]);
  const H = Math.max(0.5, Math.abs(max[1] - min[1]));
  const D = Math.abs(max[2] - min[2]);
  // as many as the box's broad face needs: about 3.4 streaks and 1.4 flakes per square unit at full strength
  const face = Math.max(W, D) * H;
  const nRain = Math.max(16, Math.min(16000, Math.ceil(face * 3.4 * density)));
  const nSnow = Math.max(16, Math.min(12000, Math.ceil(face * 1.4 * density)));
  const rainGeo = useMemo(() => rainGeometry(nRain, H), [nRain, H]);
  const snowGeo = useMemo(() => snowGeometry(nSnow, H), [nSnow, H]);
  useEffect(() => () => rainGeo.dispose(), [rainGeo]);
  useEffect(() => () => snowGeo.dispose(), [snowGeo]);

  const mats = useMemo(() => {
    const box = { uMin: { value: new THREE.Vector3() }, uMax: { value: new THREE.Vector3() }, uPx: { value: 0.001 } };
    const glowU = { uGlowPos: { value: new THREE.Vector3() }, uGlowCol: { value: new THREE.Color(0, 0, 0) }, uGlowR: { value: 0 } };
    const rain = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      uniforms: {
        ...box,
        ...glowU,
        uCycle: U.uCycle,
        uShow: { value: 0 },
        uLen: { value: 1.05 },
        uColor: { value: new THREE.Color('#8ea3b8') },
        uOpacity: { value: 0.42 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
    });
    const snow = new THREE.ShaderMaterial({
      vertexShader: SNOW_VERT,
      fragmentShader: SNOW_FRAG,
      uniforms: {
        ...box,
        ...glowU,
        uCycle: U.uCycle,
        uShow: { value: 0 },
        uSize: { value: 0.05 },
        uColor: { value: new THREE.Color('#c6d2e2') },
        uOpacity: { value: 0.85 },
      },
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
    });
    return { rain, snow, box, glowU };
  }, []);
  useEffect(() => () => {
    mats.rain.dispose();
    mats.snow.dispose();
  }, [mats]);

  useLayoutEffect(() => {
    mats.box.uMin.value.set(Math.min(min[0], max[0]), Math.min(min[1], max[1]), Math.min(min[2], max[2]));
    mats.box.uMax.value.set(Math.max(min[0], max[0]), Math.max(min[1], max[1]), Math.max(min[2], max[2]));
    const g = mats.glowU;
    if (glow) {
      g.uGlowPos.value.set(...glow.position);
      g.uGlowCol.value.set(glow.color ?? '#ffb873').multiplyScalar(glow.strength ?? 0.5);
      g.uGlowR.value = glow.radius;
    } else g.uGlowR.value = 0;
  });

  const rainMesh = useRef<THREE.Mesh>(null);
  const snowMesh = useRef<THREE.Mesh>(null);
  // drawn (with nothing showing) for the first frames, so their shaders compile on load rather than at the change of weather
  const warmup = useRef(0);
  useFrame((state) => {
    tickWeather();
    const cam = state.camera as THREE.PerspectiveCamera;
    const rows = Math.max(1, state.size.height * state.viewport.dpr);
    mats.box.uPx.value = cam.isPerspectiveCamera ? (2 * Math.tan((cam.fov * Math.PI) / 360)) / (rows * (cam.zoom || 1)) : 0.002;
    const rain = U.uRain.value;
    const snow = U.uSnow.value;
    mats.rain.uniforms.uShow.value = rain * 0.6;
    mats.snow.uniforms.uShow.value = snow;
    const warming = warmup.current++ < 3;
    if (rainMesh.current) rainMesh.current.visible = rain > 0.003 || warming;
    if (snowMesh.current) snowMesh.current.visible = snow > 0.003 || warming;
  });

  return (
    <>
      <mesh ref={rainMesh} geometry={rainGeo} material={mats.rain} frustumCulled={false} renderOrder={renderOrder} />
      <mesh ref={snowMesh} geometry={snowGeo} material={mats.snow} frustumCulled={false} renderOrder={renderOrder} />
    </>
  );
}
