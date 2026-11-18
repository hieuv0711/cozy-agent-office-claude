import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '../audio';
import { plankTexture, rainTexture, skyTexture, type Mood } from './textures';
import { WallClock } from './WallClock';

const WALL = '#2B2D40';
const WALL_DARK = '#232536';
const TRIM = '#3B3E55';

export function Box({ p, s, c, r = 0.85, cast = false, receive = true, rot }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: number; cast?: boolean; receive?: boolean; rot?: [number, number, number] }) {
  return (
    <mesh position={p} rotation={rot} castShadow={cast} receiveShadow={receive}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={r} />
    </mesh>
  );
}

export function Glow({ p, s, c, k = 2.2, rot }: { p: [number, number, number]; s: [number, number, number]; c: string; k?: number; rot?: [number, number, number] }) {
  const col = useMemo(() => new THREE.Color(c).multiplyScalar(k), [c, k]);
  return (
    <mesh position={p} rotation={rot}>
      <boxGeometry args={s} />
      <meshBasicMaterial color={col} toneMapped={false} />
    </mesh>
  );
}

function Floor() {
  const tex = useMemo(() => plankTexture(), []);
  return (
    <group>
      <Box p={[0, -0.3, 0]} s={[18.7, 0.6, 12.7]} c="#17182A" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[18.4, 12.4]} />
        <meshStandardMaterial map={tex} roughness={0.92} />
      </mesh>
    </group>
  );
}

function BackWall({ mood }: { mood: Mood }) {
  const sky = useMemo(() => skyTexture(mood), [mood]);
  useEffect(() => () => sky.dispose(), [sky]);
  const rain = useMemo(() => (mood === 'rain' ? rainTexture() : null), [mood]);
  useEffect(() => () => rain?.dispose(), [rain]);
  useFrame((_, dt) => {
    if (rain) rain.offset.y += dt * 1.4;
  });
  const z = -6.1;
  return (
    <group>
      {/* wall pieces around the window opening (x -6.4..2.6, y 0.95..3.05) */}
      <Box p={[-7.825, 1.8, z]} s={[2.85, 3.6, 0.25]} c={WALL} />
      <Box p={[5.925, 1.8, z]} s={[6.65, 3.6, 0.25]} c={WALL} />
      <Box p={[-1.9, 0.475, z]} s={[9, 0.95, 0.25]} c={WALL_DARK} />
      <Box p={[-1.9, 3.325, z]} s={[9, 0.55, 0.25]} c={WALL} />
      {/* sky + city */}
      <mesh position={[-1.9, 2.0, -6.24]}>
        <planeGeometry args={[9, 2.1]} />
        <meshBasicMaterial map={sky} toneMapped={false} />
      </mesh>
      {rain && (
        <mesh position={[-1.9, 2.0, -6.2]}>
          <planeGeometry args={[9, 2.1]} />
          <meshBasicMaterial map={rain} transparent opacity={0.85} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {/* frame + mullions */}
      <Box p={[-1.9, 0.98, -5.92]} s={[9.2, 0.07, 0.42]} c={TRIM} />
      <Box p={[-1.9, 3.03, -6.0]} s={[9.2, 0.06, 0.14]} c={TRIM} />
      {[-4.6, -2.8, -1.0, 0.8].map((x) => (
        <Box key={x} p={[x, 2.0, -6.0]} s={[0.06, 2.1, 0.08]} c={TRIM} />
      ))}
      <Box p={[-1.9, 2.05, -6.0]} s={[9, 0.05, 0.06]} c={TRIM} />
      {/* sill plants */}
      {[-5.6, -3.4, 1.9].map((x, i) => (
        <group key={x} position={[x, 1.02, -5.85]}>
          <mesh position={[0, 0.08, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.07, 0.16, 10]} />
            <meshStandardMaterial color={i === 1 ? '#E9C46A' : '#C9775A'} />
          </mesh>
          <mesh position={[0, 0.24, 0]} castShadow>
            <icosahedronGeometry args={[0.13, 0]} />
            <meshStandardMaterial color="#45C08F" flatShading />
          </mesh>
        </group>
      ))}
      <NeonMoon />
    </group>
  );
}

function NeonMoon() {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const base = useMemo(() => new THREE.Color('#FFC9A3'), []);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const k = 1.5 + Math.sin(clock.elapsedTime * 1.3) * 0.15 + audio.beat() * 0.6;
    mat.current.color.copy(base).multiplyScalar(k);
  });
  return (
    <group position={[5.6, 2.25, -5.95]}>
      <mesh rotation={[0, 0, 0.9]}>
        <torusGeometry args={[0.42, 0.035, 10, 48, Math.PI * 1.25]} />
        <meshBasicMaterial ref={mat} toneMapped={false} />
      </mesh>
      <Glow p={[0.62, 0.32, 0]} s={[0.22, 0.03, 0.02]} c="#FFE3B8" k={1.5} />
      <Glow p={[0.62, 0.32, 0]} s={[0.03, 0.22, 0.02]} c="#FFE3B8" k={1.5} />
    </group>
  );
}

function LeftWall() {
  const x = -9.1;
  return (
    <group>
      {/* pieces around the door (z 2.75..4.35, height 2.5) */}
      <Box p={[x, 1.8, -1.7375]} s={[0.25, 3.6, 8.975]} c={WALL} />
      <Box p={[x, 1.8, 5.2875]} s={[0.25, 3.6, 1.875]} c={WALL} />
      <Box p={[x, 3.05, 3.55]} s={[0.25, 1.1, 1.6]} c={WALL} />
      {/* hallway glimpse */}
      <mesh position={[-9.3, 1.25, 3.55]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.6, 2.5]} />
        <meshBasicMaterial color="#3A3550" toneMapped={false} />
      </mesh>
      <Box p={[-8.98, 1.25, 2.72]} s={[0.12, 2.5, 0.08]} c={TRIM} />
      <Box p={[-8.98, 1.25, 4.38]} s={[0.12, 2.5, 0.08]} c={TRIM} />
      <Box p={[-8.98, 2.52, 3.55]} s={[0.12, 0.08, 1.74]} c={TRIM} />
      {/* exit sign */}
      <Glow p={[-8.95, 2.82, 3.55]} s={[0.04, 0.16, 0.46]} c="#7FD39A" k={1.3} />
      {/* whiteboard */}
      <group position={[-8.94, 1.7, -2.1]} rotation={[0, Math.PI / 2, 0]}>
        <Box p={[0, 0, 0]} s={[2.3, 1.25, 0.04]} c="#3d4058" />
        <mesh position={[0, 0, 0.025]}>
          <planeGeometry args={[2.15, 1.1]} />
          <meshStandardMaterial color="#E9E4F7" roughness={0.4} />
        </mesh>
        {[
          [-0.6, 0.3, 0.7, '#d55181'],
          [-0.45, 0.12, 1.0, '#3987e5'],
          [-0.55, -0.06, 0.8, '#9085e9'],
          [0.5, 0.25, 0.5, '#d95926'],
          [0.45, 0.05, 0.6, '#199e70'],
        ].map(([x0, y0, w, c], i) => (
          <mesh key={i} position={[x0 as number, y0 as number, 0.03]}>
            <planeGeometry args={[w as number, 0.035]} />
            <meshBasicMaterial color={c as string} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Warm bulbs hung in shallow swoops along the top of the walls.
function StringLights() {
  const { bulbs, wire } = useMemo(() => {
    const runs: [THREE.Vector3, THREE.Vector3][] = [
      [new THREE.Vector3(-8.9, 3.3, -5.85), new THREE.Vector3(0, 3.3, -5.85)],
      [new THREE.Vector3(0, 3.3, -5.85), new THREE.Vector3(8.9, 3.3, -5.85)],
      [new THREE.Vector3(-8.85, 3.3, -5.8), new THREE.Vector3(-8.85, 3.3, 0.2)],
      [new THREE.Vector3(-8.85, 3.3, 0.2), new THREE.Vector3(-8.85, 3.3, 6)],
    ];
    const pts: THREE.Vector3[] = [];
    const bulbs: { p: THREE.Vector3; c: number }[] = [];
    let n = 0;
    for (const [a, b] of runs) {
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.42;
        pts.push(p);
        if (i % 3 === 1) bulbs.push({ p: p.clone().add(new THREE.Vector3(0, -0.07, 0)), c: n++ % 4 });
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const wire = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#2B2D40' }));
    return { bulbs, wire };
  }, []);
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const cols = useMemo(() => ['#FFD58A', '#FFC48A', '#FFE3A8', '#FFB37A'].map((c) => new THREE.Color(c)), []);
  useFrame(({ clock }) => {
    mats.current.forEach((m, i) => {
      if (!m) return;
      // the walls pulse with the music: a little brighter on each kick
      const k = 1.6 + Math.sin(clock.elapsedTime * (0.6 + i * 0.17) + i * 1.7) * 0.3 + audio.beat() * 0.9;
      m.color.copy(cols[i]).multiplyScalar(k);
    });
  });
  const geo = useMemo(() => new THREE.SphereGeometry(0.05, 10, 8), []);
  const materials = useMemo(() => cols.map((c) => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2), toneMapped: false })), [cols]);
  useEffect(() => {
    mats.current = materials;
  }, [materials]);
  return (
    <group>
      <primitive object={wire} />
      {bulbs.map((b, i) => (
        <mesh key={i} position={b.p} geometry={geo} material={materials[b.c]} />
      ))}
    </group>
  );
}

export function Plant({ p, h = 0.9, c = '#3FB58A', pot = '#C26A4A' }: { p: [number, number]; h?: number; c?: string; pot?: string }) {
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.19, 0.4, 14]} />
        <meshStandardMaterial color={pot} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.4 + h * 0.35, 0]} castShadow>
        <icosahedronGeometry args={[0.36 * h, 0]} />
        <meshStandardMaterial color={c} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0.12, 0.55 + h * 0.55, 0.05]} castShadow>
        <icosahedronGeometry args={[0.24 * h, 0]} />
        <meshStandardMaterial color="#5BD3A0" flatShading roughness={0.9} />
      </mesh>
    </group>
  );
}

function Cat() {
  const body = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (body.current) body.current.scale.y = 0.15 * (1 + Math.sin(clock.elapsedTime * 1.6) * 0.06);
  });
  return (
    <group position={[7.55, 0.6, -5.05]} rotation={[0, -0.4, 0]}>
      <mesh ref={body} scale={[0.27, 0.15, 0.19]} castShadow>
        <sphereGeometry args={[1, 18, 12]} />
        <meshStandardMaterial color="#F2A35E" roughness={0.9} />
      </mesh>
      <mesh position={[0.2, 0.05, 0.08]} castShadow>
        <sphereGeometry args={[0.105, 14, 10]} />
        <meshStandardMaterial color="#F2A35E" roughness={0.9} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.23, 0.15, 0.08 + s * 0.05]} rotation={[0, 0, -0.2]}>
          <coneGeometry args={[0.035, 0.08, 4]} />
          <meshStandardMaterial color="#E08A45" />
        </mesh>
      ))}
      <mesh position={[-0.18, -0.02, 0.1]} rotation={[Math.PI / 2, 0, 0.6]}>
        <torusGeometry args={[0.16, 0.03, 8, 20, Math.PI * 0.9]} />
        <meshStandardMaterial color="#E08A45" />
      </mesh>
    </group>
  );
}

function Lounge() {
  const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFC27A').multiplyScalar(1.8), toneMapped: false }), []);
  return (
    <group>
      {/* rug */}
      <mesh position={[6.4, 0.012, -3.45]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.05, 48]} />
        <meshStandardMaterial color="#3A3550" roughness={1} />
      </mesh>
      <mesh position={[6.4, 0.016, -3.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.88, 1.95, 64]} />
        <meshBasicMaterial color="#8A7A6A" transparent opacity={0.35} />
      </mesh>
      {/* sofa */}
      <Box p={[6.5, 0.22, -5.15]} s={[2.5, 0.44, 0.95]} c="#4b4f72" cast />
      <Box p={[5.95, 0.5, -5.08]} s={[1.08, 0.14, 0.8]} c="#5d6286" cast />
      <Box p={[7.05, 0.5, -5.08]} s={[1.08, 0.14, 0.8]} c="#5d6286" cast />
      <Box p={[6.5, 0.8, -5.55]} s={[2.5, 0.75, 0.24]} c="#4b4f72" cast />
      <Box p={[5.2, 0.38, -5.15]} s={[0.22, 0.72, 0.95]} c="#424566" cast />
      <Box p={[7.8, 0.38, -5.15]} s={[0.22, 0.72, 0.95]} c="#424566" cast />
      <Box p={[5.5, 0.72, -5.32]} s={[0.36, 0.3, 0.12]} c="#e8836b" rot={[0.2, 0.3, 0.15]} cast />
      <Box p={[7.45, 0.72, -5.34]} s={[0.34, 0.3, 0.12]} c="#93cf9b" rot={[0.2, -0.3, -0.12]} cast />
      <Cat />
      {/* beanbags */}
      <mesh position={[4.85, 0.26, -2.5]} scale={[1, 0.55, 1]} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 20, 14]} />
        <meshStandardMaterial color="#a8584e" roughness={0.95} />
      </mesh>
      <mesh position={[7.95, 0.26, -2.35]} scale={[1, 0.55, 1]} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 20, 14]} />
        <meshStandardMaterial color="#46708c" roughness={0.95} />
      </mesh>
      {/* coffee table */}
      <mesh position={[6.4, 0.4, -3.3]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.06, 28]} />
        <meshStandardMaterial color="#5d6286" roughness={0.5} />
      </mesh>
      <mesh position={[6.4, 0.2, -3.3]}>
        <cylinderGeometry args={[0.06, 0.12, 0.38, 10]} />
        <meshStandardMaterial color="#3b3e55" />
      </mesh>
      <mesh position={[6.25, 0.48, -3.2]} castShadow>
        <cylinderGeometry args={[0.055, 0.05, 0.11, 12]} />
        <meshStandardMaterial color="#F4F0FF" />
      </mesh>
      {/* floor lamp */}
      <mesh position={[8.6, 0.85, -4.1]}>
        <cylinderGeometry args={[0.025, 0.025, 1.7, 8]} />
        <meshStandardMaterial color="#2b2d40" />
      </mesh>
      <mesh position={[8.6, 0.02, -4.1]}>
        <cylinderGeometry args={[0.2, 0.2, 0.04, 16]} />
        <meshStandardMaterial color="#2b2d40" />
      </mesh>
      <mesh position={[8.6, 1.78, -4.1]} material={lampMat}>
        <coneGeometry args={[0.28, 0.32, 20, 1, true]} />
      </mesh>
      {/* guitar */}
      <group position={[8.65, 0, -1.6]} rotation={[0, -0.6, 0.12]}>
        <mesh position={[0, 0.32, 0]} scale={[1, 1, 0.35]} castShadow>
          <sphereGeometry args={[0.24, 18, 12]} />
          <meshStandardMaterial color="#C9733F" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.62, 0]} scale={[1, 1, 0.35]} castShadow>
          <sphereGeometry args={[0.18, 18, 12]} />
          <meshStandardMaterial color="#C9733F" roughness={0.5} />
        </mesh>
        <Box p={[0, 1.05, 0]} s={[0.07, 0.75, 0.04]} c="#3A2416" cast />
        <mesh position={[0, 0.45, 0.085]}>
          <circleGeometry args={[0.07, 16]} />
          <meshBasicMaterial color="#2A160C" />
        </mesh>
      </group>
    </group>
  );
}

function FrontDesk({ needsYou }: { needsYou: boolean }) {
  const strip = useRef<THREE.MeshBasicMaterial>(null);
  const bang = useRef<THREE.Group>(null);
  const yellow = useMemo(() => new THREE.Color('#FFD84A'), []);
  const warm = useMemo(() => new THREE.Color('#ffc27a'), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // yellow only while someone waits for you; a dim warm strip otherwise
    if (needsYou) strip.current?.color.copy(yellow).multiplyScalar(1.8 + Math.sin(t * 3) * 0.6);
    else strip.current?.color.copy(warm).multiplyScalar(0.45);
    if (bang.current) {
      bang.current.visible = needsYou;
      bang.current.position.y = 1.62 + Math.sin(t * 3) * 0.05;
    }
  });
  return (
    <group position={[6.5, 0, 4.05]}>
      <Box p={[0, 0.52, 0]} s={[2.8, 1.04, 0.6]} c="#2A2350" cast />
      <Box p={[0, 1.07, -0.05]} s={[3.0, 0.06, 0.78]} c="#3B3270" cast />
      <mesh position={[0, 0.86, 0.305]}>
        <boxGeometry args={[2.6, 0.045, 0.02]} />
        <meshBasicMaterial ref={strip} toneMapped={false} color="#FFD84A" />
      </mesh>
      <mesh position={[-0.9, 1.13, 0]} castShadow>
        <sphereGeometry args={[0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#E9C46A" metalness={0.6} roughness={0.3} />
      </mesh>
      <group ref={bang} position={[1.15, 1.62, 0]}>
        <Glow p={[0, 0.12, 0]} s={[0.07, 0.24, 0.07]} c="#FFD84A" k={2.8} />
        <mesh>
          <sphereGeometry args={[0.05, 12, 8]} />
          <meshBasicMaterial color={new THREE.Color('#FFD84A').multiplyScalar(2.8)} toneMapped={false} />
        </mesh>
      </group>
      <Plant p={[1.6, 0.2]} h={0.5} />
    </group>
  );
}

export function Room({ mood, needsYou }: { mood: Mood; needsYou: boolean }) {
  return (
    <group>
      <Floor />
      <BackWall mood={mood} />
      <LeftWall />
      <StringLights />
      <Lounge />
      <FrontDesk needsYou={needsYou} />
      <WallClock position={[-8.93, 2.85, 0.45]} rotation={[0, Math.PI / 2, 0]} size={0.3} />
      <Plant p={[-8.4, -5.45]} h={1.1} />
      <Plant p={[3.45, -5.5]} h={0.8} c="#2E9C7B" />
      <Plant p={[8.55, 0.6]} h={0.9} />
      <Plant p={[-8.35, 5.5]} h={0.8} c="#2E9C7B" pot="#6b5a8a" />
    </group>
  );
}
