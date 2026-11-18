import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Eye } from './Eye';
import { blade, mergeParts, tubeThrough } from './geo';
import { water } from './water';

// The jellyfish: a see-through bell that pulses, glowing at the rim, ruffled
// oral arms and long tentacles drifting in the current. Searching the web, it
// rises toward the surface.

export type JellyPalette = { color: string; rim: string; inner: string; iris: string };
export const JELLY: JellyPalette = { color: '#b7a3f2', rim: '#f3edff', inner: '#ff9fd3', iris: '#3a2d66' };

function jellyMaterial(p: JellyPalette, alpha: number, sway: number, pulse: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: water.time,
      uColor: { value: new THREE.Color(p.color) },
      uRim: { value: new THREE.Color(p.rim) },
      uAlpha: { value: alpha },
      uSway: { value: sway },
      uPulse: { value: pulse },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uSway; uniform float uPulse;
      varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        vec3 p = position;
        float h = clamp((0.36 - p.y) / 0.42, 0.0, 1.0);
        float beat = sin(uTime * 2.1);
        p.xz *= 1.0 + beat * uPulse * 0.12 * h;
        p.y *= 1.0 - beat * uPulse * 0.05;
        float depth = max(0.0, -p.y);
        float ph = atan(position.z, position.x) * 2.0;
        p.x += sin(uTime * 1.4 + depth * 3.0 + ph) * uSway * depth;
        p.z += cos(uTime * 1.1 + depth * 2.6 + ph) * uSway * depth;
        vH = h;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uRim; uniform float uAlpha;
      varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        vec3 c = mix(uColor * 0.6, uRim, f) + uColor * 0.22 * (1.0 - vH);
        gl_FragColor = vec4(c, clamp(uAlpha + f * 0.6, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function bellGeometry() {
  const profile = [
    [0.001, 0.34],
    [0.12, 0.33],
    [0.24, 0.29],
    [0.34, 0.21],
    [0.42, 0.1],
    [0.46, 0.0],
    [0.47, -0.05],
    [0.45, -0.075],
    [0.41, -0.045],
    [0.34, 0.04],
    [0.24, 0.1],
    [0.12, 0.14],
    [0.001, 0.15],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(profile, 72);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0.05) continue;
    const x = p.getX(i);
    const z = p.getZ(i);
    const k = 1 + 0.035 * Math.sin(Math.atan2(z, x) * 16) * (1 - (y + 0.08) / 0.13);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function armsGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const b = blade(0.85, 0.11, { segs: 20, across: 4, ruffle: 0.05, curl: 0.05 });
    b.rotateZ(Math.PI).rotateY(a).translate(Math.cos(a) * 0.05, 0.1, Math.sin(a) * 0.05);
    parts.push(b);
  }
  return mergeParts(parts, ['position', 'normal']);
}

function tentaclesGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const len = 1.1 + (i % 4) * 0.18;
    const pts = [0, 0.33, 0.66, 1].map((f) => new THREE.Vector3(Math.cos(a) * (0.43 - f * 0.06), -0.05 - f * len, Math.sin(a) * (0.43 - f * 0.06)));
    parts.push(tubeThrough(pts, (t) => 0.007 * (1 - t) + 0.003, 24, 4).geometry);
  }
  return mergeParts(parts, ['position', 'normal']);
}

export function Jellyfish({ position, palette = JELLY, rising = true, asleep = false, glow = true }: { position: [number, number, number]; palette?: JellyPalette; rising?: boolean; asleep?: boolean; /** its own soft point light (each light added to a scene recompiles its materials, so a live tank leaves it off) */ glow?: boolean }) {
  const bell = useMemo(bellGeometry, []);
  const arms = useMemo(armsGeometry, []);
  const tentacles = useMemo(tentaclesGeometry, []);
  const bellMat = useMemo(() => jellyMaterial(palette, 0.22, 0, 1), [palette]);
  const armMat = useMemo(() => jellyMaterial(palette, 0.35, 0.05, 0), [palette]);
  const tentMat = useMemo(() => jellyMaterial(palette, 0.45, 0.07, 0), [palette]);
  const innerMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.inner).lerp(new THREE.Color(palette.color), 0.35), transparent: true, opacity: 0.38, toneMapped: false, depthWrite: false }), [palette]);
  const inner = useMemo(() => new THREE.TorusGeometry(0.1, 0.022, 8, 20, Math.PI * 1.2), []);
  useEffect(
    () => () => {
      [bell, arms, tentacles, inner].forEach((g) => g.dispose());
      [bellMat, armMat, tentMat, innerMat].forEach((m) => m.dispose());
    },
    [bell, arms, tentacles, inner, bellMat, armMat, tentMat, innerMat],
  );
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!g.current) return;
    const climb = rising ? ((t * 0.16) % 1.4) - 0.5 : 0;
    g.current.position.set(position[0] + Math.sin(t * 0.3) * 0.15, position[1] + climb + Math.sin(t * 2.1) * 0.04, position[2]);
    g.current.rotation.z = Math.sin(t * 0.5) * 0.08;
  });
  return (
    <group ref={g} position={position}>
      <mesh geometry={tentacles} material={tentMat} renderOrder={1} />
      <mesh geometry={arms} material={armMat} renderOrder={2} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={inner} material={innerMat} position={[Math.cos(i * 1.57) * 0.12, 0.25, Math.sin(i * 1.57) * 0.12]} rotation={[Math.PI / 2, 0, i * 1.57]} scale={0.85} renderOrder={3} />
      ))}
      <mesh geometry={bell} material={bellMat} renderOrder={4} />
      <Eye position={[0.13, 0.16, 0.335]} r={0.048} rotation={[0, 0.35, 0]} lid={palette.color} iris={palette.iris} look={[-0.2, 0.4, 1]} closed={asleep} />
      <Eye position={[-0.13, 0.16, 0.335]} r={0.048} rotation={[0, -0.35, 0]} lid={palette.color} iris={palette.iris} look={[0.2, 0.4, 1]} closed={asleep} />
      {glow && <pointLight color={palette.color} intensity={2.2} distance={3.2} decay={2} position={[0, 0.1, 0]} />}
    </group>
  );
}
