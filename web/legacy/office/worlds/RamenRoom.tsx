import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '../../audio';
import { Box, Glow, Plant } from '../Room';
import { plankTexture, rainTexture, skyTexture, type Mood } from '../textures';
import { WallClock } from '../WallClock';

// The ramen bar. Same floor plan as the office: the stoves stand where the
// desks were, the staff table is the lounge, the pass with its bell is the
// help desk, and the door with the noren curtain is the door.

const WALL = '#3a2a22';
const WALL_LOW = '#2c201a';
const WOOD = '#7a5236';
const WOOD_DARK = '#4f3424';

function Floor() {
  const tex = useMemo(() => plankTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group>
      <Box p={[0, -0.3, 0]} s={[18.7, 0.6, 12.7]} c="#1d1512" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[18.4, 12.4]} />
        <meshStandardMaterial map={tex} color="#d9a77c" roughness={0.9} />
      </mesh>
      {/* kitchen tiles under the stoves */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2.1, 0.004, -2.2]} receiveShadow>
        <planeGeometry args={[11.6, 5.6]} />
        <meshStandardMaterial color="#3d3a37" roughness={0.6} />
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
      {/* wall around a street window (x -6.4..2.6, y 1.1..2.9) */}
      <Box p={[-7.825, 1.8, z]} s={[2.85, 3.6, 0.25]} c={WALL} />
      <Box p={[5.925, 1.8, z]} s={[6.65, 3.6, 0.25]} c={WALL} />
      <Box p={[-1.9, 0.55, z]} s={[9, 1.1, 0.25]} c={WALL_LOW} />
      <Box p={[-1.9, 3.25, z]} s={[9, 0.7, 0.25]} c={WALL} />
      <mesh position={[-1.9, 2.0, -6.24]}>
        <planeGeometry args={[9, 1.8]} />
        <meshBasicMaterial map={sky} toneMapped={false} />
      </mesh>
      {rain && (
        <mesh position={[-1.9, 2.0, -6.2]}>
          <planeGeometry args={[9, 1.8]} />
          <meshBasicMaterial map={rain} transparent opacity={0.85} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {/* wooden lattice frame */}
      <Box p={[-1.9, 1.12, -5.94]} s={[9.2, 0.08, 0.36]} c={WOOD_DARK} />
      <Box p={[-1.9, 2.9, -6.0]} s={[9.2, 0.08, 0.14]} c={WOOD_DARK} />
      {[-5.5, -4.6, -3.7, -2.8, -1.9, -1.0, -0.1, 0.8, 1.7].map((x) => (
        <Box key={x} p={[x, 2.0, -6.0]} s={[0.05, 1.8, 0.06]} c={WOOD_DARK} />
      ))}
      {/* noren over the window: short indigo panels */}
      {[-5.75, -4.15, -2.55, -0.95, 0.65, 2.05].map((x, i) => (
        <mesh key={x} position={[x, 2.62, -5.86]} rotation={[0.04, 0, 0]}>
          <planeGeometry args={[1.45, 0.5]} />
          <meshStandardMaterial color={i % 2 ? '#2e3d63' : '#27355a'} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* shelf of bowls on the right part of the wall */}
      <Box p={[5.6, 2.2, -5.85]} s={[4.2, 0.06, 0.32]} c={WOOD} />
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[3.8 + i * 0.45, 2.3, -5.85]} castShadow>
          <cylinderGeometry args={[0.13, 0.08, 0.12, 14]} />
          <meshStandardMaterial color={i % 3 === 0 ? '#2b3a5a' : i % 3 === 1 ? '#e9e3d6' : '#a8432f'} roughness={0.5} />
        </mesh>
      ))}
      <Box p={[5.6, 2.8, -5.85]} s={[4.2, 0.06, 0.32]} c={WOOD} />
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[4.0 + i * 0.65, 2.95, -5.85]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.24, 12]} />
          <meshStandardMaterial color={i % 2 ? '#c8a165' : '#8c5a3a'} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function LeftWall() {
  const x = -9.1;
  return (
    <group>
      <Box p={[x, 1.8, -1.7375]} s={[0.25, 3.6, 8.975]} c={WALL} />
      <Box p={[x, 1.8, 5.2875]} s={[0.25, 3.6, 1.875]} c={WALL} />
      <Box p={[x, 3.05, 3.55]} s={[0.25, 1.1, 1.6]} c={WALL} />
      {/* the street outside the door */}
      <mesh position={[-9.3, 1.25, 3.55]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.6, 2.5]} />
        <meshBasicMaterial color="#242a3d" toneMapped={false} />
      </mesh>
      <Box p={[-8.98, 1.25, 2.72]} s={[0.12, 2.5, 0.08]} c={WOOD_DARK} />
      <Box p={[-8.98, 1.25, 4.38]} s={[0.12, 2.5, 0.08]} c={WOOD_DARK} />
      <Box p={[-8.98, 2.52, 3.55]} s={[0.12, 0.08, 1.74]} c={WOOD_DARK} />
      {/* noren curtain in the doorway, split in three */}
      {[-0.52, 0, 0.52].map((dz) => (
        <mesh key={dz} position={[-8.92, 2.15, 3.55 + dz]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.5, 0.7]} />
          <meshStandardMaterial color="#2e3d63" roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[-8.9, 2.2, 3.55]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.16, 24]} />
        <meshBasicMaterial color="#efe6d2" />
      </mesh>
      {/* menu plaques: hanging wooden slats */}
      {Array.from({ length: 12 }, (_, i) => (
        <group key={i} position={[-8.94, 2.35, -4.9 + i * 0.42]}>
          <Box p={[0, 0, 0]} s={[0.04, 0.9, 0.34]} c={i % 4 === 3 ? '#a8432f' : '#d8c4a0'} r={0.9} />
          {[0.25, 0.1, -0.05, -0.2].map((y, k) => (
            <mesh key={k} position={[0.025, y, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[0.06, 0.1]} />
              <meshBasicMaterial color={i % 4 === 3 ? '#f5e9d4' : '#2a1d14'} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// Paper lanterns: warm, slow breathing light, no flicker.
function Lanterns() {
  const spots: [number, number, number, string][] = [
    [-6.5, 3.0, -2.1, '#ffb066'],
    [-2.8, 3.0, -2.1, '#ffb066'],
    [0.9, 3.0, -2.1, '#ffb066'],
    [6.4, 3.0, -3.4, '#ff8f5a'],
    [-7.9, 2.9, 2.2, '#e8553c'],
    [-7.9, 2.9, 4.9, '#e8553c'],
  ];
  const mats = useMemo(() => spots.map(([, , , c]) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), toneMapped: false })), []);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(({ clock }) => {
    const b = audio.beat() * 0.45;
    mats.forEach((m, i) => m.color.set(spots[i][3]).multiplyScalar(1.5 + Math.sin(clock.elapsedTime * 0.7 + i) * 0.12 + b));
  });
  return (
    <group>
      {spots.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 1, 4]} />
            <meshStandardMaterial color="#1b130f" />
          </mesh>
          <mesh scale={[1, 1.25, 1]} material={mats[i]}>
            <sphereGeometry args={[0.22, 16, 12]} />
          </mesh>
          <Box p={[0, 0.29, 0]} s={[0.2, 0.05, 0.2]} c="#1b130f" />
          <Box p={[0, -0.29, 0]} s={[0.2, 0.05, 0.2]} c="#1b130f" />
        </group>
      ))}
    </group>
  );
}

function LuckyCat() {
  const paw = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (paw.current) paw.current.rotation.z = 0.4 + Math.sin(clock.elapsedTime * 2.2) * 0.35;
  });
  return (
    <group position={[8.5, 1.02, -5.6]} rotation={[0, -0.5, 0]} scale={0.85}>
      <mesh position={[0, 0.16, 0]} castShadow>
        <sphereGeometry args={[0.17, 16, 12]} />
        <meshStandardMaterial color="#f4efe6" />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <sphereGeometry args={[0.15, 16, 12]} />
        <meshStandardMaterial color="#f4efe6" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.09, 0.56, 0]}>
          <coneGeometry args={[0.05, 0.09, 4]} />
          <meshStandardMaterial color="#f4efe6" />
        </mesh>
      ))}
      <mesh position={[0, 0.3, 0.12]}>
        <torusGeometry args={[0.1, 0.015, 6, 16]} />
        <meshStandardMaterial color="#c8352a" />
      </mesh>
      <mesh ref={paw} position={[0.15, 0.4, 0.05]}>
        <capsuleGeometry args={[0.04, 0.12, 4, 8]} />
        <meshStandardMaterial color="#f4efe6" />
      </mesh>
    </group>
  );
}

// The lounge corner: a bench along the wall and a low table with floor cushions.
function StaffTable() {
  return (
    <group>
      <mesh position={[6.4, 0.012, -3.45]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4.2, 3.6]} />
        <meshStandardMaterial color="#b9a173" roughness={1} />
      </mesh>
      {/* tatami seams */}
      {[-1.4, 0, 1.4].map((dx) => (
        <mesh key={dx} position={[6.4 + dx, 0.016, -3.45]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.04, 3.6]} />
          <meshBasicMaterial color="#5b4a30" />
        </mesh>
      ))}
      {/* bench against the back wall */}
      <Box p={[6.5, 0.24, -5.15]} s={[2.6, 0.08, 0.7]} c={WOOD} cast />
      {[-1.15, 1.15].map((dx) => (
        <Box key={dx} p={[6.5 + dx, 0.11, -5.15]} s={[0.1, 0.22, 0.6]} c={WOOD_DARK} />
      ))}
      <Box p={[6.5, 0.62, -5.52]} s={[2.6, 0.7, 0.08]} c={WOOD} cast />
      {/* low table */}
      <Box p={[6.4, 0.3, -3.3]} s={[1.5, 0.06, 0.9]} c={WOOD} cast />
      {[
        [-0.65, -0.35],
        [0.65, -0.35],
        [-0.65, 0.35],
        [0.65, 0.35],
      ].map(([dx, dz], k) => (
        <Box key={k} p={[6.4 + dx, 0.14, -3.3 + dz]} s={[0.07, 0.28, 0.07]} c={WOOD_DARK} />
      ))}
      {/* teapot and cups */}
      <mesh position={[6.25, 0.42, -3.3]} castShadow>
        <sphereGeometry args={[0.12, 14, 10]} />
        <meshStandardMaterial color="#3b4b3a" roughness={0.4} />
      </mesh>
      {[0.25, 0.5].map((dx) => (
        <mesh key={dx} position={[6.25 + dx, 0.37, -3.2]} castShadow>
          <cylinderGeometry args={[0.045, 0.04, 0.08, 12]} />
          <meshStandardMaterial color="#e9e3d6" />
        </mesh>
      ))}
      {/* floor cushions where the low seats are */}
      {[
        [4.85, -2.5],
        [7.95, -2.35],
      ].map(([x, z], k) => (
        <Box key={k} p={[x, 0.06, z]} s={[0.62, 0.1, 0.62]} c={k ? '#8c3b2e' : '#2e3d63'} cast />
      ))}
      <LuckyCat />
      <Box p={[8.5, 0.5, -5.6]} s={[0.6, 1.0, 0.5]} c={WOOD_DARK} cast />
      <Plant p={[4.2, -5.5]} h={0.9} c="#3f8a5a" pot="#6b4a33" />
    </group>
  );
}

// The pass: where finished bowls go out and where an agent rings the bell
// when it needs you. The lamp above turns waiting-for-you yellow.
function Pass({ needsYou }: { needsYou: boolean }) {
  const lamp = useRef<THREE.MeshBasicMaterial>(null);
  const bang = useRef<THREE.Group>(null);
  const yellow = useMemo(() => new THREE.Color('#FFD84A'), []);
  const warm = useMemo(() => new THREE.Color('#ffc27a'), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    lamp.current?.color.copy(needsYou ? yellow : warm).multiplyScalar(needsYou ? 1.9 + Math.sin(t * 3) * 0.5 : 0.9);
    if (bang.current) {
      bang.current.visible = needsYou;
      bang.current.position.y = 1.7 + Math.sin(t * 3) * 0.05;
    }
  });
  return (
    <group position={[6.5, 0, 4.05]}>
      <Box p={[0, 0.5, 0]} s={[2.8, 1.0, 0.6]} c={WOOD} cast />
      <Box p={[0, 1.03, -0.05]} s={[3.0, 0.06, 0.8]} c="#2c201a" cast />
      {/* ticket rail with a few order slips */}
      <Box p={[0, 1.55, -0.3]} s={[2.6, 0.03, 0.03]} c="#8c8f96" />
      {[-0.9, -0.45, 0.1, 0.6].map((x, i) => (
        <mesh key={x} position={[x, 1.42, -0.29]} rotation={[0, 0, (i % 2 ? 1 : -1) * 0.05]}>
          <planeGeometry args={[0.22, 0.26]} />
          <meshStandardMaterial color="#f2ead8" roughness={0.9} />
        </mesh>
      ))}
      {/* service bell */}
      <mesh position={[-0.9, 1.1, 0.05]} castShadow>
        <sphereGeometry args={[0.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#E9C46A" metalness={0.7} roughness={0.25} />
      </mesh>
      {/* two bowls ready to go */}
      {[0.4, 0.8].map((x) => (
        <group key={x} position={[x, 1.06, 0.05]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.13, 0.08, 0.1, 18]} />
            <meshStandardMaterial color="#e9e3d6" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.115, 18]} />
            <meshStandardMaterial color="#d9944a" />
          </mesh>
        </group>
      ))}
      {/* lamp over the pass */}
      <mesh position={[0, 2.25, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 1.3, 4]} />
        <meshStandardMaterial color="#1b130f" />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <coneGeometry args={[0.3, 0.22, 20, 1, true]} />
        <meshBasicMaterial ref={lamp} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <group ref={bang} position={[1.15, 1.7, 0]}>
        <Glow p={[0, 0.12, 0]} s={[0.07, 0.24, 0.07]} c="#FFD84A" k={2.4} />
        <mesh>
          <sphereGeometry args={[0.05, 12, 8]} />
          <meshBasicMaterial color={new THREE.Color('#FFD84A').multiplyScalar(2.4)} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// Big stock pots simmering along the back wall, always a little steam.
function BackRange() {
  return (
    <group>
      <Box p={[-4.9, 0.45, -5.55]} s={[6.4, 0.9, 0.7]} c="#4a4846" cast />
      <Box p={[-4.9, 0.92, -5.55]} s={[6.5, 0.04, 0.76]} c="#b8bcc4" />
      {[-7.4, -5.8, -4.2, -2.6].map((x, i) => (
        <mesh key={x} position={[x, 1.15, -5.55]} castShadow>
          <cylinderGeometry args={[0.32, 0.3, 0.46, 20]} />
          <meshStandardMaterial color={i % 2 ? '#9aa0a8' : '#c9cdd4'} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

export function RamenRoom({ mood, needsYou }: { mood: Mood; needsYou: boolean }) {
  return (
    <group>
      <Floor />
      <BackWall mood={mood} />
      <LeftWall />
      <BackRange />
      <Lanterns />
      <StaffTable />
      <Pass needsYou={needsYou} />
      <WallClock position={[8.55, 2.55, -5.93]} size={0.3} frame="#4f3424" />
      <Plant p={[-8.35, 5.5]} h={0.8} c="#3f8a5a" pot="#6b4a33" />
      <Plant p={[8.55, 0.6]} h={0.9} c="#3f8a5a" pot="#6b4a33" />
    </group>
  );
}
