import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Screen, ScreenTex } from '../Desk';

// A ramen-bar work spot: a stove counter the agent stands at (it stands where
// the office chair would be). The pot steams and the burner glows while the
// agent works; the order ticket clipped above shows what the monitor showed.

const TICKET: Record<Screen, THREE.Color> = {
  work: new THREE.Color(1.15, 1.08, 0.95),
  need: new THREE.Color(1.6, 1.4, 0.55),
  idle: new THREE.Color(0.75, 0.72, 0.66),
  off: new THREE.Color('#2a2622'),
};

function Steam({ on, seed }: { on: boolean; seed: number }) {
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(() => [0, 1, 2, 3].map(() => new THREE.MeshBasicMaterial({ color: '#f4efe6', transparent: true, opacity: 0.35, depthWrite: false })), []);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    puffs.current.forEach((m, i) => {
      if (!m) return;
      m.visible = on;
      if (!on) return;
      const ph = (t * 0.45 + i / 4) % 1;
      m.position.set(Math.sin(t * 1.3 + i * 2) * 0.05 * ph, 0.12 + ph * 0.75, Math.cos(t + i) * 0.04 * ph);
      m.scale.setScalar(0.05 + ph * 0.12);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - ph);
    });
  });
  return (
    <group>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(m) => void (puffs.current[i] = m)} material={mats[i]}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}

export function CookStation({ x, z, i, screen, plate, tex }: { x: number; z: number; i: number; screen: Screen; plate?: string; tex: ScreenTex }) {
  const working = screen === 'work';
  const flame = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const ticket = useRef<THREE.MeshBasicMaterial>(null);
  const code = useMemo(() => {
    const t = tex.code.clone();
    t.offset.y = (i * 0.137) % 1;
    t.needsUpdate = true;
    return t;
  }, [tex.code, i]);
  useEffect(() => () => code.dispose(), [code]);
  const plateCol = useMemo(() => (plate ? new THREE.Color(plate).multiplyScalar(1.3) : null), [plate]);
  const fire = useMemo(() => new THREE.Color('#ff8a3c'), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime + i;
    if (working) code.offset.y -= dt * 0.03;
    if (flame.current) flame.current.color.copy(fire).multiplyScalar(working ? 1.6 + Math.sin(t * 13) * 0.25 + Math.sin(t * 7.3) * 0.15 : 0.15);
    if (light.current) light.current.intensity = working ? 2.6 + Math.sin(t * 11) * 0.5 : screen === 'need' ? 1.6 : 0;
    if (ticket.current) {
      const k = screen === 'need' ? 0.85 + Math.abs(Math.sin(t * 2.4)) * 0.3 : 1;
      ticket.current.color.copy(TICKET[screen]).multiplyScalar(k);
    }
  });
  const map = screen === 'work' ? code : screen === 'need' ? tex.alert : screen === 'idle' ? tex.sleep : null;
  return (
    <group position={[x, 0, z]}>
      {/* counter body + steel top */}
      <mesh position={[0, 0.43, -0.02]} castShadow receiveShadow>
        <boxGeometry args={[1.56, 0.86, 0.74]} />
        <meshStandardMaterial color="#6b4a33" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.875, -0.02]} castShadow receiveShadow>
        <boxGeometry args={[1.62, 0.04, 0.8]} />
        <meshStandardMaterial color="#b8bcc4" roughness={0.32} metalness={0.55} />
      </mesh>
      {/* burner + pot */}
      <mesh position={[-0.35, 0.9, -0.08]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.17, 24]} />
        <meshBasicMaterial ref={flame} toneMapped={false} />
      </mesh>
      <group position={[-0.35, 0.9, -0.08]}>
        <mesh position={[0, 0.13, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.18, 0.26, 20]} />
          <meshStandardMaterial color="#c9cdd4" roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.255, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.185, 20]} />
          <meshStandardMaterial color={working ? '#e6a65c' : '#b88a55'} roughness={0.5} />
        </mesh>
        <group position={[0, 0.26, 0]}>
          <Steam on={working} seed={i * 1.7} />
        </group>
      </group>
      {/* cutting board, knife, green onions */}
      <mesh position={[0.32, 0.905, 0.04]} castShadow>
        <boxGeometry args={[0.46, 0.025, 0.3]} />
        <meshStandardMaterial color="#d9b886" roughness={0.8} />
      </mesh>
      <mesh position={[0.4, 0.925, 0.06]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.24, 0.01, 0.04]} />
        <meshStandardMaterial color="#dfe3ea" metalness={0.8} roughness={0.25} />
      </mesh>
      {[0, 1, 2].map((k) => (
        <mesh key={k} position={[0.18 + k * 0.04, 0.93, -0.02]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.16, 6]} />
          <meshStandardMaterial color="#6fae4f" />
        </mesh>
      ))}
      {/* bowl waiting to be filled */}
      <mesh position={[0.62, 0.95, -0.22]} castShadow>
        <cylinderGeometry args={[0.12, 0.07, 0.1, 18]} />
        <meshStandardMaterial color={i % 2 ? '#e9e3d6' : '#2b3a5a'} roughness={0.5} />
      </mesh>
      {/* order ticket on a rail: shows what the agent is on */}
      <mesh position={[0, 1.5, -0.38]}>
        <boxGeometry args={[1.5, 0.03, 0.03]} />
        <meshStandardMaterial color="#8c8f96" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.27, -0.37]} rotation={[0.06, 0, 0]}>
        <planeGeometry args={[0.36, 0.44]} />
        <meshBasicMaterial key={screen} ref={ticket} map={map} color={TICKET[screen]} toneMapped={false} />
      </mesh>
      {plateCol && (
        <mesh position={[0.5, 0.6, 0.355]}>
          <boxGeometry args={[0.32, 0.05, 0.02]} />
          <meshBasicMaterial color={plateCol} toneMapped={false} />
        </mesh>
      )}
      <pointLight ref={light} position={[-0.35, 1.2, 0.2]} color="#ff9a52" intensity={0} distance={2.6} decay={2} />
    </group>
  );
}
