import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

// Little signs above creatures ("?" when one needs you, "z" when asleep) and bubbles.

export function glyphTexture(glyph: string, fg: string, bg: string, ring = 'rgba(255,255,255,0.0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  g.fillStyle = bg;
  g.beginPath();
  g.arc(64, 60, 50, 0, Math.PI * 2);
  g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = ring;
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = fg;
  g.font = '800 70px "M PLUS Rounded 1c", "Nunito", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, 64, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A floating "?" that bobs gently: this one needs you. */
export function AskSign({ position, size = 0.42 }: { position: [number, number, number]; size?: number }) {
  const tex = useMemo(() => glyphTexture('?', '#3a2c00', '#ffd84a', 'rgba(255,255,255,0.6)'), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ clock }) => {
    const s = ref.current;
    if (!s) return;
    const t = clock.elapsedTime;
    s.position.y = position[1] + Math.sin(t * 2.2) * 0.05;
    const k = size * (1 + Math.max(0, Math.sin(t * 4.4)) * 0.06);
    s.scale.set(k, k, k);
  });
  return (
    <sprite ref={ref} position={position} scale={size}>
      <spriteMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

/** Three little "z"s drifting up: asleep. */
export function SleepZs({ position }: { position: [number, number, number] }) {
  const tex = useMemo(() => glyphTexture('z', '#5b4a6b', 'rgba(255,255,255,0.82)'), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current?.children.forEach((c, i) => {
      const k = (t * 0.16 + i / 3) % 1;
      c.position.set(Math.sin(t * 0.8 + i * 2) * 0.08 + k * 0.12, k * 0.9, 0);
      (c as THREE.Sprite).material.opacity = Math.min(1, (1 - k) * 1.6) * Math.min(1, k * 6);
      c.scale.setScalar(0.12 + k * 0.1);
    });
  });
  return (
    <group ref={ref} position={position}>
      {[0, 1, 2].map((i) => (
        <sprite key={i}>
          <spriteMaterial map={tex} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

const bubbleGeo = new THREE.SphereGeometry(1, 20, 14);
let bubbleMat: THREE.ShaderMaterial | null = null;

// A bubble is mostly see-through: a bright rim where you look across its skin,
// a faint tint, and two catchlights that stay put relative to the viewer.
function bubbleMaterial() {
  if (!bubbleMat)
    bubbleMat = new THREE.ShaderMaterial({
      uniforms: { uTint: { value: new THREE.Color('#bdf3ff') } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 p = vec4(position, 1.0);
          vec3 n = normal;
          #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          n = mat3(instanceMatrix) * n;
          #endif
          vec4 mv = modelViewMatrix * p;
          vN = normalize(normalMatrix * n);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec3 n = normalize(vN);
          float rim = pow(1.0 - abs(dot(n, normalize(vV))), 2.2);
          float spec = smoothstep(0.88, 0.94, dot(n, normalize(vec3(-0.45, 0.55, 0.7))));
          float spec2 = smoothstep(0.94, 0.975, dot(n, normalize(vec3(0.5, -0.45, 0.75)))) * 0.55;
          vec3 c = mix(uTint * 0.7, vec3(1.0), rim * 0.75) + vec3(spec + spec2);
          float a = clamp(0.05 + rim * 0.8 + spec + spec2, 0.0, 1.0);
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
  return bubbleMat;
}

/** A stream of bubbles from origin along dir. */
export function Bubbles({ origin, dir = [0, 1, 0], count = 16, speed = 0.9, spread = 0.1, size = 0.05, rise = 3.5 }: { origin: [number, number, number]; dir?: [number, number, number]; count?: number; speed?: number; spread?: number; size?: number; rise?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({ ph: i / count, wob: Math.random() * 6, s: 0.55 + Math.random() * 0.9 })), [count]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), v: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    const im = ref.current;
    if (!im) return;
    const t = clock.elapsedTime;
    seeds.forEach((b, i) => {
      const k = (t * speed * 0.25 + b.ph) % 1;
      const d = k * rise;
      tmp.v.set(
        origin[0] + dir[0] * d + Math.sin(t * 2 + b.wob) * spread * k,
        origin[1] + dir[1] * d + d * d * 0.1 * (1 - dir[1]),
        origin[2] + dir[2] * d + Math.cos(t * 1.7 + b.wob) * spread * k,
      );
      const s = size * b.s * (0.5 + k * 0.7) * Math.min(1, k * 8);
      tmp.s.set(s, s, s);
      tmp.m.compose(tmp.v, tmp.q, tmp.s);
      im.setMatrixAt(i, tmp.m);
    });
    im.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[bubbleGeo, bubbleMaterial(), count]} frustumCulled={false} />;
}
