import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Box, Glow } from '../Room';
import type { Mood } from '../textures';
import { WallClock } from '../WallClock';

// The park in late autumn. Same floor plan as the office: picnic tables where
// the desks were, a big tree with blankets as the lounge, a kiosk with a bell
// as the help desk, and the park gate as the door.

const LEAVES = ['#d9822b', '#c4512d', '#e3b23c', '#8a9a3a', '#4f7f3a'];

function gingham(a: string, b: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = b;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = a;
  for (let i = 0; i < 8; i++) {
    g.globalAlpha = 0.55;
    g.fillRect(i * 8, 0, 4, 64);
    g.fillRect(0, i * 8, 64, 4);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

function Ground() {
  return (
    <group>
      {/* the walking lane as a sandy path, plus branches to the kiosk and the big tree */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 1.95]} receiveShadow>
        <planeGeometry args={[18.4, 1.3]} />
        <meshStandardMaterial color="#b49a76" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6.5, 0.006, 3.0]} receiveShadow>
        <planeGeometry args={[1.3, 1.6]} />
        <meshStandardMaterial color="#b49a76" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6.4, 0.006, 0.4]} receiveShadow>
        <planeGeometry args={[1.2, 2.2]} />
        <meshStandardMaterial color="#b49a76" roughness={1} />
      </mesh>
    </group>
  );
}

function Tree({ p, s = 1, seed = 0 }: { p: [number, number]; s?: number; seed?: number }) {
  const cols = [LEAVES[seed % 5], LEAVES[(seed + 2) % 5], LEAVES[(seed + 4) % 5]];
  return (
    <group position={[p[0], 0, p[1]]} scale={s}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.16, 1.4, 8]} />
        <meshStandardMaterial color="#5a3d2a" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <icosahedronGeometry args={[0.75, 0]} />
        <meshStandardMaterial color={cols[0]} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0.38, 1.5, 0.2]} castShadow>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color={cols[1]} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[-0.35, 1.55, -0.15]} castShadow>
        <icosahedronGeometry args={[0.48, 0]} />
        <meshStandardMaterial color={cols[2]} flatShading roughness={0.9} />
      </mesh>
    </group>
  );
}

function Hedge({ p, s }: { p: [number, number, number]; s: [number, number, number] }) {
  return <Box p={p} s={s} c="#3e6b3a" r={1} cast />;
}

function LampPost({ p, night }: { p: [number, number]; night: boolean }) {
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 2.4, 8]} />
        <meshStandardMaterial color="#26282e" metalness={0.4} roughness={0.5} />
      </mesh>
      <Glow p={[0, 2.45, 0]} s={[0.18, 0.24, 0.18]} c="#ffd49a" k={night ? 2.4 : 1.6} />
      <Box p={[0, 2.6, 0]} s={[0.26, 0.05, 0.26]} c="#26282e" />
      <pointLight position={[0, 2.3, 0]} color="#ffc98a" intensity={night ? 7 : 3.5} distance={6} decay={2} />
    </group>
  );
}

function Pond() {
  const ducks = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ducks.current) return;
    const t = clock.elapsedTime * 0.12;
    ducks.current.children.forEach((d, i) => {
      const a = t + i * 2.1;
      d.position.set(Math.cos(a) * (1.4 - i * 0.3), 0.06, Math.sin(a) * 0.35);
      d.rotation.y = -a + Math.PI;
    });
  });
  return (
    <group position={[-1.9, 0, -5.35]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} scale={[2.4, 0.6, 1]} receiveShadow>
        <circleGeometry args={[1, 40]} />
        <meshStandardMaterial color="#3d6f8f" roughness={0.15} metalness={0.25} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} scale={[2.6, 0.72, 1]}>
        <ringGeometry args={[0.9, 1, 40]} />
        <meshStandardMaterial color="#8a8273" roughness={1} />
      </mesh>
      <group ref={ducks}>
        {[0, 1, 2].map((i) => (
          <group key={i}>
            <mesh castShadow scale={[1, 0.7, 1.4]}>
              <sphereGeometry args={[0.09, 12, 8]} />
              <meshStandardMaterial color={i === 1 ? '#8a6a4a' : '#f2efe8'} />
            </mesh>
            <mesh position={[0, 0.08, 0.1]}>
              <sphereGeometry args={[0.05, 10, 8]} />
              <meshStandardMaterial color={i === 1 ? '#2f5a3a' : '#f2efe8'} />
            </mesh>
            <mesh position={[0, 0.07, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.02, 0.05, 6]} />
              <meshStandardMaterial color="#e3a23c" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Gate() {
  return (
    <group>
      {[2.7, 4.4].map((z) => (
        <group key={z}>
          <Box p={[-9.0, 0.75, z]} s={[0.4, 1.5, 0.4]} c="#8a8273" cast />
          <Box p={[-9.0, 1.55, z]} s={[0.5, 0.1, 0.5]} c="#6e675b" />
        </group>
      ))}
      <Box p={[-9.0, 2.3, 3.55]} s={[0.08, 0.08, 1.9]} c="#26282e" />
      <mesh position={[-9.0, 2.05, 3.55]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.85, 0.035, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#26282e" metalness={0.4} roughness={0.5} />
      </mesh>
      <Hedge p={[-9.0, 0.35, -1.75]} s={[0.5, 0.7, 8.6]} />
      <Hedge p={[-9.0, 0.35, 5.3]} s={[0.5, 0.7, 1.6]} />
    </group>
  );
}

// The lounge: a big tree, a bench under it and picnic blankets on the grass.
function BigTree() {
  const tex = useMemo(() => gingham('#b8352c', '#f2ead8'), []);
  const tex2 = useMemo(() => gingham('#2e5a8c', '#f2ead8'), []);
  useEffect(
    () => () => {
      tex.dispose();
      tex2.dispose();
    },
    [tex, tex2],
  );
  return (
    <group>
      <group position={[8.4, 0, -5.4]}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.36, 2.2, 10]} />
          <meshStandardMaterial color="#4f3524" roughness={0.95} />
        </mesh>
        {[
          [-1.2, 2.7, 1.0, 1.25, 0],
          [0, 3.0, 0.2, 1.4, 1],
          [-2.2, 2.5, 1.6, 1.0, 2],
          [-0.8, 3.2, 1.9, 1.05, 3],
          [0.4, 2.4, 1.4, 0.9, 4],
        ].map(([x, y, z, r, c], i) => (
          <mesh key={i} position={[x, y, z]} castShadow>
            <icosahedronGeometry args={[r, 0]} />
            <meshStandardMaterial color={LEAVES[c]} flatShading roughness={0.9} />
          </mesh>
        ))}
      </group>
      {/* bench at the back, facing the park */}
      <Box p={[6.5, 0.44, -5.15]} s={[2.4, 0.06, 0.55]} c="#8a6040" cast />
      <Box p={[6.5, 0.78, -5.42]} s={[2.4, 0.42, 0.06]} c="#8a6040" cast />
      {[-1.05, 1.05].map((dx) => (
        <Box key={dx} p={[6.5 + dx, 0.22, -5.15]} s={[0.08, 0.44, 0.5]} c="#26282e" />
      ))}
      {/* blankets under the low seats */}
      <mesh position={[4.85, 0.012, -2.5]} rotation={[-Math.PI / 2, 0, 0.3]} receiveShadow>
        <planeGeometry args={[1.5, 1.2]} />
        <meshStandardMaterial map={tex} roughness={1} />
      </mesh>
      <mesh position={[7.95, 0.012, -2.35]} rotation={[-Math.PI / 2, 0, -0.25]} receiveShadow>
        <planeGeometry args={[1.5, 1.2]} />
        <meshStandardMaterial map={tex2} roughness={1} />
      </mesh>
      {/* basket */}
      <Box p={[5.5, 0.14, -2.9]} s={[0.42, 0.26, 0.3]} c="#b4834f" cast />
    </group>
  );
}

// The help spot: a little park kiosk with a bell; its lamp turns yellow when someone waits.
function Kiosk({ needsYou }: { needsYou: boolean }) {
  const lamp = useRef<THREE.MeshBasicMaterial>(null);
  const bang = useRef<THREE.Group>(null);
  const yellow = useMemo(() => new THREE.Color('#FFD84A'), []);
  const warm = useMemo(() => new THREE.Color('#ffd49a'), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    lamp.current?.color.copy(needsYou ? yellow : warm).multiplyScalar(needsYou ? 2 + Math.sin(t * 3) * 0.5 : 1.1);
    if (bang.current) {
      bang.current.visible = needsYou;
      bang.current.position.y = 2.0 + Math.sin(t * 3) * 0.05;
    }
  });
  return (
    <group position={[6.5, 0, 4.25]}>
      <Box p={[0, 0.5, 0]} s={[2.6, 1.0, 0.7]} c="#2f5a4a" cast />
      <Box p={[0, 1.03, 0]} s={[2.8, 0.06, 0.85]} c="#8a6040" cast />
      {[-1.25, 1.25].map((x) => (
        <Box key={x} p={[x, 1.6, 0.3]} s={[0.08, 1.2, 0.08]} c="#26282e" />
      ))}
      <Box p={[0, 2.25, 0.1]} s={[3.0, 0.08, 1.1]} c="#b8352c" cast rot={[0.12, 0, 0]} />
      {/* notice board */}
      <Box p={[-0.6, 1.5, 0.32]} s={[0.9, 0.6, 0.04]} c="#b4834f" />
      {[
        [-0.8, 1.55, '#f2ead8'],
        [-0.45, 1.45, '#e3b23c'],
        [-0.65, 1.36, '#9fc4e8'],
      ].map(([x, y, c], i) => (
        <mesh key={i} position={[x as number, y as number, 0.345]}>
          <planeGeometry args={[0.24, 0.2]} />
          <meshStandardMaterial color={c as string} />
        </mesh>
      ))}
      <mesh position={[0.7, 1.1, 0.1]} castShadow>
        <sphereGeometry args={[0.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#E9C46A" metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh position={[0.4, 2.0, 0.3]}>
        <sphereGeometry args={[0.14, 14, 10]} />
        <meshBasicMaterial ref={lamp} toneMapped={false} />
      </mesh>
      <group ref={bang} position={[1.15, 2.0, 0.2]}>
        <Glow p={[0, 0.12, 0]} s={[0.07, 0.24, 0.07]} c="#FFD84A" k={2.4} />
        <mesh>
          <sphereGeometry args={[0.05, 12, 8]} />
          <meshBasicMaterial color={new THREE.Color('#FFD84A').multiplyScalar(2.4)} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// Fireflies drift around the hedges and the big tree after dusk.
function Fireflies({ count = 28 }: { count?: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const r = Math.sin(i * 91.7) * 43758.5453;
        const f = r - Math.floor(r);
        const zone = i % 3;
        const base: [number, number] = zone === 0 ? [-8.2, -2 + f * 8] : zone === 1 ? [5 + f * 3.5, -4.8 + f * 2] : [-4 + f * 6, -5.2];
        return { base, ph: f * 10, sp: 0.3 + f * 0.5 };
      }),
    [count],
  );
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#e6f27a').multiplyScalar(2.2), toneMapped: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const s = seeds[i];
      const a = t * s.sp + s.ph;
      m.position.set(s.base[0] + Math.sin(a) * 0.6, 0.5 + Math.sin(a * 1.7) * 0.35 + 0.4, s.base[1] + Math.cos(a * 0.8) * 0.6);
      m.scale.setScalar(Math.max(0.2, Math.sin(a * 2.3) * 0.5 + 0.5));
    });
  });
  return (
    <group>
      {seeds.map((_, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} material={mat}>
          <sphereGeometry args={[0.025, 6, 4]} />
        </mesh>
      ))}
    </group>
  );
}

// A few leaves always on their way down from the big tree.
function Leaves() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(() => LEAVES.slice(0, 3).map((c) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide })), []);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const ph = (t * 0.08 + i * 0.137) % 1;
      m.position.set(7.2 - (i % 4) * 0.7 + Math.sin(t * 0.9 + i) * 0.4, 3.2 - ph * 3.1, -4.4 + ((i * 37) % 7) * 0.3 + ph * 0.8);
      m.rotation.set(t * 1.3 + i, t * 0.7 + i * 2, t * 0.5);
    });
  });
  return (
    <group>
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} material={mats[i % 3]}>
          <planeGeometry args={[0.09, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

export function ParkScene({ mood, needsYou }: { mood: Mood; needsYou: boolean }) {
  const night = mood !== 'dusk';
  return (
    <group>
      <Ground />
      <Gate />
      <Hedge p={[-5.9, 0.35, -6.05]} s={[6.2, 0.7, 0.5]} />
      <Hedge p={[3.0, 0.35, -6.05]} s={[4.0, 0.7, 0.5]} />
      <Pond />
      <Tree p={[-7.6, -5.3]} s={1.15} seed={0} />
      <Tree p={[4.4, -5.6]} s={0.95} seed={1} />
      <Tree p={[-8.3, 5.4]} s={0.9} seed={2} />
      <Tree p={[2.6, 5.4]} s={0.8} seed={3} />
      <Tree p={[-4.2, 5.6]} s={0.85} seed={4} />
      <BigTree />
      <Kiosk needsYou={needsYou} />
      {/* a park clock on a post by the path; it runs the Pomodoro too */}
      <group position={[1.0, 0, 3.05]}>
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 2.4, 8]} />
          <meshStandardMaterial color="#26282e" metalness={0.4} roughness={0.5} />
        </mesh>
        <WallClock position={[0, 2.62, 0.04]} size={0.26} frame="#26282e" />
      </group>
      <LampPost p={[-6.2, 2.85]} night={night} />
      <LampPost p={[-1.2, 2.85]} night={night} />
      <LampPost p={[3.4, 2.85]} night={night} />
      <LampPost p={[4.1, -3.9]} night={night} />
      {night && <Fireflies />}
      <Leaves />
    </group>
  );
}
