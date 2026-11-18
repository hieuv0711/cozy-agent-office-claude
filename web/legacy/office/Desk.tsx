import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SEAT_OFFSET } from './layout';

export type Screen = 'work' | 'need' | 'idle' | 'off';

export interface ScreenTex {
  code: THREE.Texture;
  alert: THREE.Texture;
  sleep: THREE.Texture;
}

const TINT: Record<Screen, THREE.Color> = {
  work: new THREE.Color(1.45, 1.3, 1.2),
  need: new THREE.Color(1.9, 1.65, 0.7),
  idle: new THREE.Color(0.8, 0.82, 0.95),
  off: new THREE.Color('#121420'),
};
const LIGHT: Record<Screen, string> = { work: '#FFB878', need: '#FFD84A', idle: '#9aa3c8', off: '#000000' };

function Chair() {
  return (
    <group position={[0, 0, SEAT_OFFSET]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.52, 0.08, 0.5]} />
        <meshStandardMaterial color="#50557a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.8, 0.26]} castShadow>
        <boxGeometry args={[0.5, 0.56, 0.07]} />
        <meshStandardMaterial color="#454866" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.42, 8]} />
        <meshStandardMaterial color="#2b2d40" />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.04, 12]} />
        <meshStandardMaterial color="#2b2d40" />
      </mesh>
    </group>
  );
}

export function Desk({ x, z, i, screen, plate, tex }: { x: number; z: number; i: number; screen: Screen; plate?: string; tex: ScreenTex }) {
  const scr = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  // each desk scrolls its own copy of the code texture
  const code = useMemo(() => {
    const t = tex.code.clone();
    t.offset.y = (i * 0.137) % 1;
    t.needsUpdate = true;
    return t;
  }, [tex.code, i]);
  useEffect(() => () => code.dispose(), [code]);
  const plateCol = useMemo(() => (plate ? new THREE.Color(plate).multiplyScalar(1.6) : null), [plate]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (screen === 'work') code.offset.y -= dt * (0.035 + (i % 3) * 0.01);
    const m = scr.current;
    if (m) {
      let k = 1;
      if (screen === 'need') k = 0.7 + Math.abs(Math.sin(t * 3)) * 0.5;
      else if (screen === 'work') k = 0.96 + Math.sin(t * 6 + i) * 0.04;
      m.color.copy(TINT[screen]).multiplyScalar(k);
    }
    if (light.current) light.current.intensity = screen === 'off' ? 0 : screen === 'need' ? 4.5 + Math.sin(t * 3) * 1.5 : screen === 'work' ? 3.6 : 1.2;
  });
  const map = screen === 'work' ? code : screen === 'need' ? tex.alert : screen === 'idle' ? tex.sleep : null;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.06, 0.78]} />
        <meshStandardMaterial color="#454866" roughness={0.55} />
      </mesh>
      {[
        [-0.68, -0.33],
        [0.68, -0.33],
        [-0.68, 0.33],
        [0.68, 0.33],
      ].map(([lx, lz], k) => (
        <mesh key={k} position={[lx, 0.36, lz]}>
          <boxGeometry args={[0.05, 0.72, 0.05]} />
          <meshStandardMaterial color="#2b2d40" />
        </mesh>
      ))}
      {/* monitor */}
      <mesh position={[0, 0.87, -0.24]}>
        <boxGeometry args={[0.08, 0.22, 0.06]} />
        <meshStandardMaterial color="#2b2d40" />
      </mesh>
      <mesh position={[0, 1.12, -0.25]} castShadow>
        <boxGeometry args={[0.94, 0.56, 0.05]} />
        <meshStandardMaterial color="#1B1630" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.12, -0.222]}>
        <planeGeometry args={[0.86, 0.48]} />
        <meshBasicMaterial key={screen} ref={scr} map={map} color={TINT[screen]} toneMapped={false} />
      </mesh>
      {/* keyboard, mug, little things */}
      <mesh position={[0, 0.785, 0.1]}>
        <boxGeometry args={[0.52, 0.025, 0.17]} />
        <meshStandardMaterial color="#2E2754" />
      </mesh>
      <mesh position={[0.56, 0.82, 0.05]} castShadow>
        <cylinderGeometry args={[0.05, 0.045, 0.11, 12]} />
        <meshStandardMaterial color={i % 2 ? '#e8836b' : '#f6f1e4'} />
      </mesh>
      {i % 3 === 0 && (
        <group position={[-0.58, 0.77, -0.15]}>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.07, 0.06, 0.12, 10]} />
            <meshStandardMaterial color="#C9775A" />
          </mesh>
          <mesh position={[0, 0.18, 0]}>
            <icosahedronGeometry args={[0.11, 0]} />
            <meshStandardMaterial color="#45C08F" flatShading />
          </mesh>
        </group>
      )}
      {i % 3 === 1 && (
        <mesh position={[-0.5, 0.785, 0.12]} rotation={[0, 0.3, 0]}>
          <boxGeometry args={[0.3, 0.02, 0.22]} />
          <meshStandardMaterial color="#E9E4F7" />
        </mesh>
      )}
      {plateCol && (
        <mesh position={[0.45, 0.66, 0.395]}>
          <boxGeometry args={[0.36, 0.06, 0.02]} />
          <meshBasicMaterial color={plateCol} toneMapped={false} />
        </mesh>
      )}
      <pointLight ref={light} position={[0, 1.15, 0.35]} color={LIGHT[screen]} intensity={0} distance={3.2} decay={2} />
      <Chair />
    </group>
  );
}
