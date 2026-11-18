import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Everything under water shares one clock, wobbling caustic light from the
// surface, and (for plants) a gentle sway in the current.

export const water = { time: { value: 0 } };

const CAUSTIC = /* glsl */ `
float tankCaustic(vec2 uv, float time) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}`;

export type Underwater = {
  /** Strength of the caustic light on surfaces facing up. */
  caustics?: number;
  /** Sway of the whole plant in the current; needs aSway (0 at the root, 1 at the top). */
  sway?: number;
  /** Extra flutter along the normal; needs aFlutter. */
  flutter?: number;
  /** Bright vertex colours glow (anemone tips). */
  glow?: number;
  /** Tail wag for instanced fish swimming along +z. */
  wag?: number;
  /** Thin, leafy things let light through: a soft glow that is strongest at grazing angles. */
  translucent?: number;
};

export function underwater<T extends THREE.Material>(mat: T, o: Underwater = {}): T {
  const caustics = o.caustics ?? 0.55;
  const swaying = (o.sway ?? 0) > 0 || (o.flutter ?? 0) > 0;
  const wagging = (o.wag ?? 0) > 0;
  const glowing = (o.glow ?? 0) > 0;
  const lucent = (o.translucent ?? 0) > 0;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = water.time;
    shader.uniforms.uCaustic = { value: caustics };
    shader.uniforms.uSway = { value: o.sway ?? 0 };
    shader.uniforms.uFlutter = { value: o.flutter ?? 0 };
    shader.uniforms.uGlow = { value: o.glow ?? 0 };
    shader.uniforms.uWag = { value: o.wag ?? 0 };
    shader.uniforms.uTrans = { value: o.translucent ?? 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime; uniform float uSway; uniform float uFlutter; uniform float uWag;
varying vec3 vTankWorld;
${swaying ? 'attribute float aSway; attribute float aFlutter;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
${
  swaying
    ? `{
  vec4 root = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
  root = instanceMatrix * root;
  #endif
  root = modelMatrix * root;
  float ph = root.x * 0.9 + root.z * 0.7;
  float hh = aSway * aSway;
  transformed.x += sin(uTime * 0.75 + ph + position.y * 0.4) * uSway * hh;
  transformed.z += cos(uTime * 0.6 + ph * 1.3) * uSway * 0.6 * hh;
  transformed += objectNormal * sin(uTime * 2.4 + ph * 2.0 + position.y * 7.0) * uFlutter * aFlutter;
}`
    : ''
}
${
  wagging
    ? `{
  float ph = float(gl_InstanceID) * 1.7;
  float k = smoothstep(0.06, -0.2, position.z);
  transformed.x += sin(uTime * 9.0 + ph - position.z * 16.0) * uWag * k;
}`
    : ''
}`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
{
  vec4 tw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  tw = instanceMatrix * tw;
  #endif
  vTankWorld = (modelMatrix * tw).xyz;
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime; uniform float uCaustic; uniform float uGlow; uniform float uTrans;
varying vec3 vTankWorld;
${CAUSTIC}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
${
  glowing
    ? `#ifdef USE_COLOR
  totalEmissiveRadiance += vColor.rgb * smoothstep(0.5, 0.95, max(vColor.r, max(vColor.g, vColor.b))) * uGlow;
#endif`
    : ''
}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
{
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float facing = clamp(dot(normal, upV) * 0.65 + 0.35, 0.0, 1.0);
  // The pattern sits around 0.2 between its lines and peaks near 1.25 on them:
  // keep only the lines, so caustics sparkle instead of lifting the whole floor.
  float c = tankCaustic(vTankWorld.xz * 0.42 + vTankWorld.y * 0.07, uTime * 0.42);
  c = max(c - 0.2, 0.0);
  reflectedLight.directDiffuse += diffuseColor.rgb * c * uCaustic * facing * 0.55;
}
${
  lucent
    ? `{
  float graze = 1.0 - abs(dot(normal, normalize(vViewPosition)));
  totalEmissiveRadiance += diffuseColor.rgb * uTrans * (0.35 + 0.65 * graze * graze);
}`
    : ''
}`,
      );
  };
  mat.customProgramCacheKey = () => `tank:${swaying ? 1 : 0}${wagging ? 1 : 0}${glowing ? 1 : 0}${lucent ? 1 : 0}`;
  return mat;
}

/** Soft, slightly glossy skin for the creatures. */
export function skin(o: { roughness?: number; sheen?: number; clearcoat?: number; caustics?: number; transparent?: boolean; opacity?: number } = {}) {
  return underwater(
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: o.roughness ?? 0.48,
      clearcoat: o.clearcoat ?? 0.35,
      clearcoatRoughness: 0.32,
      sheen: o.sheen ?? 0.6,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color('#ffffff'),
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
    }),
    { caustics: o.caustics ?? 0.5 },
  );
}

/** Ticks the shared water clock. Mount once per scene. */
export function WaterClock() {
  useFrame(({ clock }) => {
    water.time.value = clock.elapsedTime;
  });
  return null;
}

/** A soft studio environment for gloss on eyes and wet skin, made locally (no downloads). */
export function useTankEnvironment(intensity = 0.45) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pm.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene, intensity]);
}
