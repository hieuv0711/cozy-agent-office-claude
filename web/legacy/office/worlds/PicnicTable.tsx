import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Screen, ScreenTex } from '../Desk';
import { SEAT_OFFSET } from '../layout';

// A park work spot: a picnic table with a laptop. The agent sits on the bench
// where the office chair would be.

const TINT: Record<Screen, THREE.Color> = {
  work: new THREE.Color(1.35, 1.25, 1.15),
  need: new THREE.Color(1.9, 1.65, 0.7),
  idle: new THREE.Color(0.75, 0.72, 0.9),
  off: new THREE.Color('#141822'),
};
const LIGHT: Record<Screen, string> = { work: '#ffd7a8', need: '#FFD84A', idle: '#9aa7d8', off: '#000000' };
const WOOD = '#8a6040';
const WOOD_DARK = '#5e3f29';

function Bench({ z }: { z: number }) {
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.06, 0.32]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {[-0.65, 0.65].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]}>
          <boxGeometry args={[0.06, 0.44, 0.28]} />
          <meshStandardMaterial color={WOOD_DARK} />
        </mesh>
      ))}
    </group>
  );
}

export function PicnicTable({ x, z, i, screen, plate, tex }: { x: number; z: number; i: number; screen: Screen; plate?: string; tex: ScreenTex }) {
  const scr = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const code = useMemo(() => {
    const t = tex.code.clone();
    t.offset.y = (i * 0.137) % 1;
    t.needsUpdate = true;
    return t;
  }, [tex.code, i]);
  useEffect(() => () => code.dispose(), [code]);
  const plateCol = useMemo(() => (plate ? new THREE.Color(plate).multiplyScalar(1.3) : null), [plate]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (screen === 'work') code.offset.y -= dt * (0.035 + (i % 3) * 0.01);
    if (scr.current) scr.current.color.copy(TINT[screen]).multiplyScalar(screen === 'need' ? 0.75 + Math.abs(Math.sin(t * 2.4)) * 0.4 : 1);
    if (light.current) light.current.intensity = screen === 'off' ? 0 : screen === 'need' ? 3 + Math.sin(t * 2.4) : screen === 'work' ? 2.4 : 0.8;
  });
  const map = screen === 'work' ? code : screen === 'need' ? tex.alert : screen === 'idle' ? tex.sleep : null;
  return (
    <group position={[x, 0, z]}>
      {/* table top from planks */}
      {[-0.27, -0.09, 0.09, 0.27].map((dz) => (
        <mesh key={dz} position={[0, 0.74, dz]} castShadow receiveShadow>
          <boxGeometry args={[1.62, 0.05, 0.16]} />
          <meshStandardMaterial color={WOOD} roughness={0.85} />
        </mesh>
      ))}
      {[-0.62, 0.62].map((lx) => (
        <group key={lx} position={[lx, 0, 0]}>
          <mesh position={[0, 0.37, 0.2]} rotation={[0.42, 0, 0]}>
            <boxGeometry args={[0.07, 0.86, 0.07]} />
            <meshStandardMaterial color={WOOD_DARK} />
          </mesh>
          <mesh position={[0, 0.37, -0.2]} rotation={[-0.42, 0, 0]}>
            <boxGeometry args={[0.07, 0.86, 0.07]} />
            <meshStandardMaterial color={WOOD_DARK} />
          </mesh>
        </group>
      ))}
      <Bench z={SEAT_OFFSET} />
      <Bench z={-SEAT_OFFSET} />
      {/* laptop, open toward the bench */}
      <mesh position={[0, 0.775, 0.08]}>
        <boxGeometry args={[0.5, 0.02, 0.34]} />
        <meshStandardMaterial color="#c9ccd3" metalness={0.5} roughness={0.35} />
      </mesh>
      <group position={[0, 0.78, -0.09]} rotation={[-0.32, 0, 0]}>
        <mesh position={[0, 0.17, 0]} castShadow>
          <boxGeometry args={[0.5, 0.34, 0.015]} />
          <meshStandardMaterial color="#c9ccd3" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.17, 0.009]}>
          <planeGeometry args={[0.46, 0.3]} />
          <meshBasicMaterial key={screen} ref={scr} map={map} color={TINT[screen]} toneMapped={false} />
        </mesh>
      </group>
      {/* thermos and a paper bag */}
      <mesh position={[0.6, 0.86, -0.15]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.2, 12]} />
        <meshStandardMaterial color={i % 2 ? '#3f6e8c' : '#b34a3a'} roughness={0.5} />
      </mesh>
      {i % 2 === 0 && (
        <mesh position={[-0.58, 0.83, -0.12]} rotation={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[0.18, 0.14, 0.12]} />
          <meshStandardMaterial color="#c9a46a" roughness={0.95} />
        </mesh>
      )}
      {plateCol && (
        <mesh position={[0.5, 0.7, 0.33]}>
          <boxGeometry args={[0.3, 0.04, 0.02]} />
          <meshBasicMaterial color={plateCol} toneMapped={false} />
        </mesh>
      )}
      <pointLight ref={light} position={[0, 1.05, 0.35]} color={LIGHT[screen]} intensity={0} distance={2.6} decay={2} />
    </group>
  );
}
