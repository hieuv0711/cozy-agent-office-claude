import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Eye, glyphTexture, rng, useCanvasTexture } from './kit';

// Concept C, "Night Garden": every session is a lantern sprite tending a
// moonlit garden. The work grows the garden: each bed blooms with what was
// written today. A sprite waiting for you lifts its lantern at the moon gate.

function Sky() {
  const tex = useCanvasTexture(
    (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0b1230');
      grad.addColorStop(0.6, '#1d2b55');
      grad.addColorStop(1, '#3a4a78');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const r = rng(21);
      g.fillStyle = '#fff';
      for (let i = 0; i < 220; i++) {
        g.globalAlpha = 0.3 + r() * 0.7;
        g.fillRect(r() * w, r() * h * 0.7, 1.4, 1.4);
      }
      g.globalAlpha = 1;
      const mx = w * 0.72;
      const my = h * 0.22;
      const halo = g.createRadialGradient(mx, my, 10, mx, my, 120);
      halo.addColorStop(0, 'rgba(255,248,220,0.9)');
      halo.addColorStop(0.25, 'rgba(255,248,220,0.25)');
      halo.addColorStop(1, 'rgba(255,248,220,0)');
      g.fillStyle = halo;
      g.fillRect(mx - 120, my - 120, 240, 240);
      g.fillStyle = '#fbf3da';
      g.beginPath();
      g.arc(mx, my, 34, 0, Math.PI * 2);
      g.fill();
      // far hills
      g.fillStyle = '#16233f';
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.86 - Math.sin(x / 90) * 24 - Math.sin(x / 33) * 6);
      g.lineTo(w, h);
      g.fill();
    },
    1024,
    512,
  );
  return (
    <mesh position={[-4, 9, -34]}>
      <planeGeometry args={[160, 70]} />
      <meshBasicMaterial map={tex} toneMapped={false} fog={false} />
    </mesh>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color="#1f3a30" roughness={1} />
      </mesh>
      {/* stepping stones */}
      {[
        [-3.2, 3.4],
        [-2.3, 2.6],
        [-1.2, 2.1],
        [0, 1.8],
        [1.2, 1.9],
        [2.3, 2.4],
        [3.2, 3.0],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, i]} receiveShadow>
          <circleGeometry args={[0.38, 7]} />
          <meshStandardMaterial color="#6f7480" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Flower({ p, c, h = 0.5, open = 1 }: { p: [number, number, number]; c: string; h?: number; open?: number }) {
  return (
    <group position={p}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.015, 0.02, h, 5]} />
        <meshStandardMaterial color="#3f7a46" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.cos((i / 5) * Math.PI * 2) * 0.07 * open, h, Math.sin((i / 5) * Math.PI * 2) * 0.07 * open]} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.065 * (0.5 + open * 0.5), 8, 6]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.25} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, h + 0.02, 0]}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshStandardMaterial color="#ffe08a" emissive="#ffcf5a" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

// A raised bed per project; the number of flowers is the work grown today.
function Bed({ p, color, n, rot = 0 }: { p: [number, number]; color: string; n: number; rot?: number }) {
  const flowers = useMemo(() => {
    const r = rng(Math.floor(p[0] * 10 + p[1] * 7 + 50));
    return Array.from({ length: n }, () => ({ x: (r() - 0.5) * 1.6, z: (r() - 0.5) * 0.7, h: 0.3 + r() * 0.4, o: 0.6 + r() * 0.4 }));
  }, [p, n]);
  return (
    <group position={[p[0], 0, p[1]]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.24, 1.0]} />
        <meshStandardMaterial color="#6b4a33" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[1.86, 0.02, 0.86]} />
        <meshStandardMaterial color="#3a2a20" roughness={1} />
      </mesh>
      {flowers.map((f, i) => (
        <Flower key={i} p={[f.x, 0.25, f.z]} c={color} h={f.h} open={f.o} />
      ))}
    </group>
  );
}

function Pond() {
  return (
    <group position={[3.6, 0.02, -1.2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.0, 40]} />
        <meshStandardMaterial color="#13263f" roughness={0.08} metalness={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, 0.005, -0.7]} scale={[1, 0.55, 1]}>
        <circleGeometry args={[0.28, 24]} />
        <meshBasicMaterial color={new THREE.Color('#fff6dc').multiplyScalar(1.1)} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      {[
        [-0.8, 0.5, 0.42],
        [0.7, 0.8, 0.36],
        [-0.2, -0.9, 0.3],
      ].map(([x, z, r], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, i]} position={[x, 0.012, z]}>
          <circleGeometry args={[r, 20, 0.4, Math.PI * 1.8]} />
          <meshStandardMaterial color="#3e7a4a" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <mesh key={i} position={[Math.cos(i) * 2.05, 0.12, Math.sin(i) * 2.05]}>
          <dodecahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#5d6470" flatShading />
        </mesh>
      ))}
    </group>
  );
}

function MoonGate() {
  return (
    <group position={[-3.4, 0, -2.6]}>
      <mesh position={[0, 1.4, 0]}>
        <torusGeometry args={[1.25, 0.28, 12, 40]} />
        <meshStandardMaterial color="#c8c0b0" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[3.6, 0.5, 0.4]} />
        <meshStandardMaterial color="#b7ae9c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.75, 0]}>
        <boxGeometry args={[3.2, 0.18, 0.6]} />
        <meshStandardMaterial color="#3a4a5c" roughness={0.8} />
      </mesh>
    </group>
  );
}

function PaperLantern({ p, c = '#ffb36b' }: { p: [number, number]; c?: string }) {
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 1.8, 6]} />
        <meshStandardMaterial color="#3a2a20" />
      </mesh>
      <mesh position={[0, 1.75, 0]} scale={[1, 1.2, 1]}>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshBasicMaterial color={new THREE.Color(c).multiplyScalar(1.6)} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.7, 0]} color={c} intensity={5} distance={5} decay={2} />
    </group>
  );
}

// ---------- the sprites ----------

function Sprite({ p, color, cap = 'leaf', pose = 'stand', lantern, rot = 0, children }: { p: [number, number, number]; color: string; cap?: 'leaf' | 'mushroom'; pose?: 'stand' | 'sit' | 'sleep' | 'raise'; lantern?: string; rot?: number; children?: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + p[0];
    if (g.current) g.current.position.y = p[1] + (pose === 'sleep' ? Math.sin(t * 1.2) * 0.01 : Math.abs(Math.sin(t * 2.2)) * 0.03);
    if (lamp.current) lamp.current.rotation.z = Math.sin(t * 1.6) * 0.15;
  });
  const sleeping = pose === 'sleep';
  return (
    <group ref={g} position={p} rotation={[0, rot, sleeping ? 1.2 : 0]}>
      <mesh position={[0, 0.32, 0]} scale={[1, 0.95, 1]} castShadow>
        <sphereGeometry args={[0.3, 24, 18]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {cap === 'leaf' ? (
        <mesh position={[0.05, 0.62, 0]} rotation={[0.2, 0, -0.5]} scale={[1, 0.25, 0.6]}>
          <sphereGeometry args={[0.32, 16, 10]} />
          <meshStandardMaterial color="#5fae6a" roughness={0.6} />
        </mesh>
      ) : (
        <mesh position={[0, 0.56, 0]}>
          <sphereGeometry args={[0.36, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#c8453b" roughness={0.6} />
        </mesh>
      )}
      {cap === 'mushroom' &&
        [0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[Math.cos(i * 1.7) * 0.2, 0.72 + (i % 2) * 0.04, Math.sin(i * 1.7) * 0.2]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshStandardMaterial color="#f4efe4" />
          </mesh>
        ))}
      <Eye p={[-0.1, 0.36, 0.26]} s={0.06} closed={sleeping} look={pose === 'raise' ? [0, 0.6, 1] : [0, 0, 1]} />
      <Eye p={[0.1, 0.36, 0.26]} s={0.06} closed={sleeping} look={pose === 'raise' ? [0, 0.6, 1] : [0, 0, 1]} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.12, 0.04, 0.04]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      {lantern && (
        <group ref={lamp} position={[0.32, pose === 'raise' ? 0.9 : 0.42, 0.05]}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.36, 4]} />
            <meshStandardMaterial color="#3a2a20" />
          </mesh>
          <mesh position={[0, -0.02, 0]} scale={[1, 1.15, 1]}>
            <sphereGeometry args={[0.1, 14, 10]} />
            <meshBasicMaterial color={new THREE.Color(lantern).multiplyScalar(1.8)} toneMapped={false} />
          </mesh>
          <pointLight color={lantern} intensity={pose === 'raise' ? 6 : 2.5} distance={pose === 'raise' ? 4 : 2.5} decay={2} />
        </group>
      )}
      {children}
    </group>
  );
}

// Editing: watering a bed; droplets fall where new flowers come up.
function WateringCan() {
  const drops = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    drops.current?.children.forEach((d, i) => {
      const k = (t * 1.2 + i / 6) % 1;
      d.position.set(0.62 + k * 0.12, 0.42 - k * 0.5, 0.06 + Math.sin(i) * 0.04);
    });
  });
  return (
    <group>
      <group position={[0.42, 0.45, 0.05]} rotation={[0, 0, -0.5]}>
        <mesh>
          <cylinderGeometry args={[0.12, 0.12, 0.2, 14]} />
          <meshStandardMaterial color="#7fa0b4" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0.17, 0.05, 0]} rotation={[0, 0, -1.0]}>
          <cylinderGeometry args={[0.02, 0.03, 0.28, 8]} />
          <meshStandardMaterial color="#7fa0b4" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
      <group ref={drops}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.02, 6, 4]} />
            <meshBasicMaterial color="#bfe8ff" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Reading: a big seed book open on its lap.
function SeedBook() {
  return (
    <group position={[0, 0.3, 0.3]} rotation={[-0.6, 0, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.11, 0, 0]} rotation={[0, s * 0.25, 0]}>
          <boxGeometry args={[0.2, 0.02, 0.26]} />
          <meshStandardMaterial color="#efe6cf" />
        </mesh>
      ))}
    </group>
  );
}

// Running a command: cranking the old well; the bucket rises and falls.
function Well({ p }: { p: [number, number] }) {
  const crank = useRef<THREE.Group>(null);
  const bucket = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (crank.current) crank.current.rotation.x = t * 2;
    if (bucket.current) bucket.current.position.y = 0.9 + Math.sin(t * 0.6) * 0.35;
  });
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.65, 0.7, 20, 1, true]} />
        <meshStandardMaterial color="#7d7f86" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 1.0, 0]}>
          <boxGeometry args={[0.08, 1.3, 0.08]} />
          <meshStandardMaterial color="#5a3d2a" />
        </mesh>
      ))}
      <mesh position={[0, 1.75, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.9, 0.5, 4]} />
        <meshStandardMaterial color="#6b3f32" roughness={0.8} />
      </mesh>
      <group ref={crank} position={[0, 1.45, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 1.2, 8]} />
          <meshStandardMaterial color="#5a3d2a" />
        </mesh>
        <mesh position={[0.65, 0.12, 0]}>
          <boxGeometry args={[0.05, 0.25, 0.05]} />
          <meshStandardMaterial color="#5a3d2a" />
        </mesh>
      </group>
      <mesh ref={bucket}>
        <cylinderGeometry args={[0.12, 0.1, 0.18, 12]} />
        <meshStandardMaterial color="#8a6a48" />
      </mesh>
    </group>
  );
}

// Web: dandelion seeds drifting off into the night with what it asked for.
function Seeds({ from }: { from: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current?.children.forEach((s, i) => {
      const k = (t * 0.12 + i / 8) % 1;
      s.position.set(from[0] + k * 3 + Math.sin(t + i) * 0.2, from[1] + k * 3.2, from[2] - k * 2);
      s.scale.setScalar(1 - k * 0.5);
    });
  });
  return (
    <group ref={ref}>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshBasicMaterial color={new THREE.Color('#f4f1e8').multiplyScalar(1.3)} toneMapped={false} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function Garden() {
  const ask = useMemo(() => glyphTexture('?', '#3a2c00', '#ffd84a'), []);
  const zs = useMemo(() => glyphTexture('z', '#2a3550', 'rgba(255,255,255,0.75)'), []);
  useEffect(
    () => () => {
      ask.dispose();
      zs.dispose();
    },
    [ask, zs],
  );
  return (
    <>
      <color attach="background" args={['#0b1230']} />
      <fog attach="fog" args={['#1a2850', 18, 40]} />
      <ambientLight intensity={0.35} color="#9fb4ff" />
      <hemisphereLight args={['#8ea6ff', '#1a2a20', 0.55]} />
      <directionalLight position={[6, 10, -6]} intensity={0.9} color="#cfd9ff" castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-10, 10, 8, -8, 0.5, 40]} />
      </directionalLight>
      <Sky />
      <Ground />
      <Pond />
      <MoonGate />
      <PaperLantern p={[-5.6, 0.6]} />
      <PaperLantern p={[1.2, -3.4]} c="#ffc27a" />
      <PaperLantern p={[5.8, 2.4]} c="#ff9f6b" />
      {/* beds: one per project, blooming with today's work */}
      <Bed p={[-1.6, -0.2]} color="#ec8fb6" n={22} />
      <Bed p={[1.2, -0.9]} color="#7fb8e8" n={9} rot={0.2} />
      <Bed p={[-4.6, 2.0]} color="#f2b483" n={14} rot={-0.3} />
      {/* the sprites: the sessions */}
      <Sprite p={[-0.4, 0.25, 0.5]} color="#f4d7c8" lantern="#ec8fb6" rot={-0.9}>
        <WateringCan />
      </Sprite>
      <Sprite p={[1.6, 0, 0.6]} color="#d9e6f2" cap="mushroom" pose="sit" lantern="#7fb8e8" rot={-0.4}>
        <SeedBook />
      </Sprite>
      <Well p={[-6.2, -1.6]} />
      <Sprite p={[-5.4, 0, -0.9]} color="#e8dccb" pose="stand" lantern="#f2b483" rot={-1.2} />
      <Sprite p={[-3.4, 0.5, -2.6]} color="#e2d7f0" pose="raise" lantern="#ffd84a" rot={0.3} />
      <sprite position={[-3.4, 2.15, -2.4]} scale={[0.5, 0.5, 0.5]}>
        <spriteMaterial map={ask} transparent depthWrite={false} />
      </sprite>
      <pointLight position={[-3.4, 2.0, -1.8]} color="#ffd84a" intensity={8} distance={5} decay={2} />
      <group position={[3.0, 0.03, -0.7]}>
        <Sprite p={[0, 0, 0]} color="#cfe8d4" pose="sleep" lantern="#93cf9b" />
        <sprite position={[0.2, 0.9, 0]} scale={[0.22, 0.22, 0.22]}>
          <spriteMaterial map={zs} transparent depthWrite={false} />
        </sprite>
      </group>
      <Sprite p={[4.6, 0, 2.8]} color="#f1e2c8" cap="mushroom" lantern="#b8a4ef" rot={-1.1} />
      <Seeds from={[4.9, 1.0, 2.6]} />
      {/* fireflies: the helpers out on errands */}
      <Sparkles count={70} scale={[14, 3, 9]} position={[0, 1.2, 0]} size={4} speed={0.35} color="#e8f27a" opacity={0.9} />
      <Sparkles count={18} scale={[1.2, 1.2, 1.2]} position={[-0.4, 1.4, 0.4]} size={6} speed={0.8} color="#ffe08a" />
    </>
  );
}
