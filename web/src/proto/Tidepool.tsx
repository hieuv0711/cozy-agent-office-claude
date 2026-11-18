import { Sparkles } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Axolotl } from '../tank/Axolotl';
import { Chest } from '../tank/Chest';
import { Jellyfish } from '../tank/Jellyfish';
import { RamenBowl, Teacup, Teapot } from '../tank/kitchenware';
import { Octopus } from '../tank/Octopus';
import { Anemone, Kelp, SeaFan, Seagrass, TubeSponges } from '../tank/plants';
import { Puffer } from '../tank/Puffer';
import { BrainCoral, BranchCoral, Rock, Sand, sandHeight, ShellBed } from '../tank/reef';
import { School } from '../tank/School';
import { Seahorse } from '../tank/Seahorse';
import { Shrimp } from '../tank/Shrimp';
import { Bubbles } from '../tank/signs';
import { useTankEnvironment, WaterClock } from '../tank/water';
import { ItemsLayer } from '../tide/ItemsLayer';
import { KITCHEN_ITEMS, KITCHEN_LAYOUT, KitchenRoom } from '../tide/rooms/KitchenRoom';
import { rng, useCanvasTexture } from './kit';

// Concept A, "Tidepool": every session is a sea creature in an aquarium on a
// desk at night. No desks, no screens: the work is what the creature does.
// The creatures and plants live in ../tank (sculpted, shaded, animated); this
// file is the tank, the room around it, and who is where.

const TANK = { x: 6, yTop: 2.4, yBot: -3, z: 2.6 };
const SAND_Y = -2.62;

// ---------- the tank ----------

function Backdrop() {
  const tex = useCanvasTexture(
    (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#3aa6b8');
      grad.addColorStop(0.45, '#13607a');
      grad.addColorStop(1, '#062a3b');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      // soft rays from the surface
      for (let i = 0; i < 9; i++) {
        const x = (i / 9) * w + 20;
        const ray = g.createLinearGradient(0, 0, 0, h * 0.8);
        ray.addColorStop(0, 'rgba(200,250,255,0.18)');
        ray.addColorStop(1, 'rgba(200,250,255,0)');
        g.fillStyle = ray;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 30, 0);
        g.lineTo(x + 70, h * 0.8);
        g.lineTo(x + 10, h * 0.8);
        g.fill();
      }
      // far rocks and weeds in silhouette
      const r = rng(4);
      g.fillStyle = 'rgba(4,30,40,0.75)';
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.78 - Math.sin(x / 60) * 22 - r() * 18);
      g.lineTo(w, h);
      g.fill();
      g.strokeStyle = 'rgba(10,60,60,0.7)';
      g.lineWidth = 3;
      for (let i = 0; i < 26; i++) {
        const x = r() * w;
        g.beginPath();
        g.moveTo(x, h * 0.85);
        g.quadraticCurveTo(x + 12, h * 0.6, x - 4, h * (0.42 + r() * 0.2));
        g.stroke();
      }
    },
    512,
    256,
  );
  return (
    <mesh position={[0, (TANK.yTop + TANK.yBot) / 2, -TANK.z + 0.02]}>
      <planeGeometry args={[TANK.x * 2, TANK.yTop - TANK.yBot]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

function Shafts() {
  const ref = useRef<THREE.Group>(null);
  const fade = useCanvasTexture(
    (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const side = g.createLinearGradient(0, 0, w, 0);
      side.addColorStop(0, 'rgba(0,0,0,1)');
      side.addColorStop(0.5, 'rgba(0,0,0,0)');
      side.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
    },
    64,
    256,
  );
  useFrame(({ clock }) => {
    ref.current?.children.forEach((c, i) => {
      c.rotation.z = Math.sin(clock.elapsedTime * 0.2 + i) * 0.05 + (i - 2) * 0.06;
    });
  });
  return (
    <group ref={ref}>
      {[-4, -1.5, 1.2, 3.8].map((x, i) => (
        <mesh key={x} position={[x, -0.3, -0.6 + i * 0.3]}>
          <planeGeometry args={[1.6, 5.6]} />
          <meshBasicMaterial map={fade} color="#bff6ff" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export function Tank() {
  // Glass and water never write depth and draw last, or they would hide the
  // see-through things behind them (jellyfish, fins, bubbles).
  const glass = { color: '#cdeff5', transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0.1, depthWrite: false } as const;
  const H = TANK.yTop - TANK.yBot;
  const yc = (TANK.yTop + TANK.yBot) / 2;
  return (
    <group>
      {/* glass panes */}
      <mesh position={[0, yc, TANK.z]} renderOrder={10}>
        <planeGeometry args={[TANK.x * 2, H]} />
        <meshStandardMaterial {...glass} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * TANK.x, yc, 0]} rotation={[0, Math.PI / 2, 0]} renderOrder={10}>
          <planeGeometry args={[TANK.z * 2, H]} />
          <meshStandardMaterial {...glass} />
        </mesh>
      ))}
      {/* frame */}
      {[
        [0, TANK.yBot - 0.08, TANK.z, TANK.x * 2 + 0.2, 0.16, 0.16],
        [0, TANK.yBot - 0.08, -TANK.z, TANK.x * 2 + 0.2, 0.16, 0.16],
        [-TANK.x, TANK.yBot - 0.08, 0, 0.16, 0.16, TANK.z * 2],
        [TANK.x, TANK.yBot - 0.08, 0, 0.16, 0.16, TANK.z * 2],
        [-TANK.x, yc, TANK.z, 0.08, H, 0.08],
        [TANK.x, yc, TANK.z, 0.08, H, 0.08],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#1c1d22" roughness={0.5} />
        </mesh>
      ))}
      {/* hood with a light strip */}
      <mesh position={[0, TANK.yTop + 0.18, 0]}>
        <boxGeometry args={[TANK.x * 2 + 0.3, 0.36, TANK.z * 2 + 0.3]} />
        <meshStandardMaterial color="#202227" roughness={0.6} />
      </mesh>
      <mesh position={[0, TANK.yTop - 0.005, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TANK.x * 2 - 0.4, 0.3]} />
        <meshBasicMaterial color={new THREE.Color('#dff8ff').multiplyScalar(1.6)} toneMapped={false} />
      </mesh>
      {/* water surface */}
      <mesh position={[0, TANK.yTop - 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={9}>
        <planeGeometry args={[TANK.x * 2, TANK.z * 2]} />
        <meshStandardMaterial color="#8fe3f0" transparent opacity={0.18} roughness={0.05} depthWrite={false} />
      </mesh>
      <Backdrop />
      <Shafts />
    </group>
  );
}

// ---------- the room around the tank ----------

function Room() {
  const win = useCanvasTexture(
    (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#141a2e');
      grad.addColorStop(1, '#2a2440');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const r = rng(8);
      for (let i = 0; i < 60; i++) {
        const x = r() * w;
        const y = h * 0.45 + r() * h * 0.55;
        const rad = 3 + r() * 9;
        const c = r() < 0.7 ? '255,200,130' : '160,200,255';
        const b = g.createRadialGradient(x, y, 0, x, y, rad);
        b.addColorStop(0, `rgba(${c},0.8)`);
        b.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = b;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      g.strokeStyle = 'rgba(200,220,255,0.25)';
      for (let i = 0; i < 120; i++) {
        const x = r() * w;
        const y = r() * h;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 2, y + 10);
        g.stroke();
      }
    },
    256,
    256,
  );
  return (
    <group>
      <mesh position={[0, 1.5, -7]}>
        <planeGeometry args={[40, 16]} />
        <meshStandardMaterial color="#1d1a24" roughness={1} />
      </mesh>
      <mesh position={[-9.5, 2.6, -6.95]}>
        <planeGeometry args={[6, 5]} />
        <meshBasicMaterial map={win} toneMapped={false} />
      </mesh>
      {/* desk */}
      <mesh position={[0, TANK.yBot - 0.4, 0.5]} receiveShadow>
        <boxGeometry args={[30, 0.5, 9]} />
        <meshStandardMaterial color="#5a3d2a" roughness={0.75} />
      </mesh>
      {/* desk lamp */}
      <group position={[9, TANK.yBot - 0.15, -0.5]}>
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
          <meshStandardMaterial color="#2a2a30" />
        </mesh>
        <mesh position={[-0.2, 2.45, 0]} rotation={[0, 0, 0.6]}>
          <coneGeometry args={[0.45, 0.5, 20, 1, true]} />
          <meshStandardMaterial color="#e9c27a" side={THREE.DoubleSide} emissive="#ffb460" emissiveIntensity={0.5} />
        </mesh>
        <pointLight position={[-0.4, 2.2, 0.3]} color="#ffbe78" intensity={22} distance={14} decay={2} />
      </group>
      {/* a mug and books next to the tank */}
      <mesh position={[7.6, TANK.yBot + 0.15, 1.6]}>
        <cylinderGeometry args={[0.32, 0.28, 0.65, 18]} />
        <meshStandardMaterial color="#d8573f" roughness={0.6} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-8.2, TANK.yBot + 0.12 + i * 0.26, 1.2]} rotation={[0, 0.2 * i - 0.2, 0]}>
          <boxGeometry args={[2.2, 0.24, 1.5]} />
          <meshStandardMaterial color={['#3d6b8c', '#c9a14a', '#7a4b6b'][i]} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- who is where ----------

// A helper coming home: a shrimp carrying its pearl (the result) along the front.
const shrimpPath = (t: number, out: THREE.Vector3) => {
  const k = (t * 0.07) % 1;
  out.set(3.4 - k * 5.4, 1.05 + Math.sin(k * Math.PI) * 0.6, 1.55 - k * 0.5);
};

/** A spot on the sand: x, z in the tank, y where the rippled sand actually is (plus a lift). */
const on = (x: number, z: number, lift = 0): [number, number, number] => [x, sandHeight(x, z) + lift, z];

/** Where the tank lives. The creatures and what they do are the same everywhere. */
type Place = 'desk' | 'kitchen';

// In the kitchen the axolotl naps in a big teacup, chin on the rim, the rest of
// it curled out of sight inside.
function TeacupNap({ at }: { at: [number, number, number] }) {
  const yaw = -0.5;
  return (
    <>
      <Teacup position={at} rotation={-0.4} scale={1.1} />
      <group position={[at[0] + Math.sin(yaw) * 0.41, at[1] + 0.72, at[2] + Math.cos(yaw) * 0.41]} rotation={[0, yaw, 0]}>
        <group rotation={[-0.38, 0, 0]} scale={0.72}>
          <Axolotl position={[0, 0, 0]} asleep />
        </group>
      </group>
    </>
  );
}

// Everything inside the tank, standing on the sand (y = 0 is the sand's base level).
export function Aquarium({ place }: { place: Place }) {
  const kitchen = place === 'kitchen';
  return (
    <group position={[0, SAND_Y, 0]}>
      <Sand width={TANK.x * 2} depth={TANK.z * 2} skirt={SAND_Y - TANK.yBot} />
      {/* the kelp forest along the back */}
      <Kelp position={on(-5.4, -2.0, -0.02)} height={4.0} seed={1} />
      <Kelp position={on(-4.6, -2.3, -0.02)} height={3.6} seed={4} />
      <Kelp position={on(-1.9, -2.2, -0.02)} height={4.0} seed={3} />
      <Kelp position={on(0.6, -2.3, -0.02)} height={3.4} seed={6} />
      <Kelp position={on(3.3, -2.2, -0.02)} height={3.9} seed={5} />
      <Kelp position={on(5.4, -1.9, -0.02)} height={3.8} seed={2} />
      {/* the reef */}
      <Rock position={on(-4.4, -1.5, 0.2)} size={[1.1, 0.7, 0.75]} seed={1} />
      <Rock position={on(4.6, -1.4, 0.23)} size={[1.25, 0.8, 0.8]} seed={2} />
      <Rock position={on(1.4, -1.9, 0.1)} size={[0.7, 0.45, 0.5]} seed={3} />
      <BranchCoral position={on(-1.3, -1.0, -0.02)} seed={2} />
      <BranchCoral position={on(3.6, -0.35, -0.02)} seed={5} scale={0.75} base="#ee8a55" tip="#ffe3c2" />
      <BrainCoral position={on(2.2, -1.2, -0.02)} seed={1} scale={0.75} />
      <SeaFan position={on(-2.7, -2.0, -0.02)} size={1.1} />
      <SeaFan position={on(2.8, -2.25, -0.02)} size={0.85} color="#c4643c" rotation={0.4} />
      <Anemone position={on(0.9, 0.45, -0.02)} />
      <Anemone position={on(-0.5, 1.15, -0.02)} scale={0.8} color="#ff8f5e" tip="#fff1b8" />
      <TubeSponges position={on(-0.3, -1.8, -0.02)} />
      <TubeSponges position={on(5.2, 0.05, -0.02)} scale={0.75} rotation={1.2} body="#7d5bc4" lip="#d4b8ff" />
      <Seagrass center={on(2.0, 1.8, -0.02)} area={[0.6, 0.35]} count={50} />
      <Seagrass center={on(-5.5, 0.35, -0.02)} area={[0.45, 0.4]} count={50} seed={2} />
      <Seagrass center={on(5.4, 1.9, -0.02)} area={[0.5, 0.35]} count={40} seed={3} />
      {/* the money spent, kept as treasure: a chest, or in the kitchen a ramen bowl of coins */}
      {kitchen ? <RamenBowl position={on(-5.0, 1.35, -0.03)} rotation={0.35} scale={0.95} /> : <Chest position={on(-5.0, 1.4, -0.04)} rotation={0.5} />}
      {kitchen && <Teapot position={on(-4.75, -0.55, -0.03)} rotation={0.75} scale={1.25} />}
      <Bubbles origin={[-0.6, 0, -1.4]} count={14} speed={0.8} spread={0.1} size={0.045} rise={4.7} />
      {/* the residents: one per session, doing what the session is doing */}
      <Octopus position={on(-3.1, 0.5)} rotation={0.45} working />
      <Puffer position={[0.1, 1.9, -0.1]} rotation={0.8} running />
      <Seahorse position={[1.55, 0.75, 2.12]} rotation={-0.55} waiting />
      {kitchen ? (
        <TeacupNap at={on(4.3, 1.0, -0.03)} />
      ) : (
        <>
          <ShellBed position={on(4.25, 1.0, -0.02)} rotation={-0.5} />
          <Axolotl position={on(4.25, 1.0, 0.05)} rotation={-0.95} asleep />
        </>
      )}
      <Jellyfish position={[-4.2, 3.0, -0.6]} />
      <School center={[2.4, 3.6, -1.1]} count={18} radius={[2.0, 0.3, 0.6]} />
      <Shrimp path={shrimpPath} />
    </group>
  );
}

// On the desk the tank light is a plain directional light. In the kitchen it is
// a spotlight from the same spot with the same strength and no falloff, so the
// tank looks the same but the room around it stays dark like a kitchen at night.
export function TankLight({ place }: { place: Place }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  if (place === 'desk')
    return (
      <>
        <ambientLight intensity={0.4} color="#cfeef5" />
        <hemisphereLight args={['#bff3ff', '#5a4a36', 0.6]} />
        <directionalLight position={[2, 9, 3]} intensity={2.3} color="#e3f8ff" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
          <orthographicCamera attach="shadow-camera" args={[-8, 8, 6, -6, 0.5, 30]} />
        </directionalLight>
      </>
    );
  return (
    <>
      <ambientLight intensity={0.14} color="#cfe6f0" />
      <hemisphereLight args={['#a9dcff', '#4a3a2a', 0.2]} />
      <primitive object={target} position={[0, -1.2, 0]} />
      <spotLight position={[2, 9, 3]} target={target} angle={0.66} penumbra={0.3} intensity={2.3} decay={0} color="#e3f8ff" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-near={2} shadow-camera-far={30} />
      {/* the tank's glow spilling onto the counter in front of it */}
      <pointLight position={[0, -1.7, 4.2]} intensity={4} color="#5fd2e8" distance={8} decay={2} />
    </>
  );
}

const kitchenCatalog = new Map(KITCHEN_ITEMS.map((i) => [i.kind, i]));

// The kitchen's shell with its things where they start out (the room's
// materials catch only a little of the studio reflections).
function KitchenWithItems() {
  const g = useRef<THREE.Group>(null);
  useEffect(() => {
    g.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.3;
    });
  });
  return (
    <group ref={g}>
      <KitchenRoom />
      <ItemsLayer items={KITCHEN_LAYOUT} catalog={kitchenCatalog} />
    </group>
  );
}

function TideScene({ place }: { place: Place }) {
  useTankEnvironment(0.45);
  return (
    <>
      <WaterClock />
      <color attach="background" args={[place === 'kitchen' ? '#15110e' : '#14121a']} />
      <TankLight place={place} />
      <pointLight position={[0, 1.5, 1.5]} intensity={3} color="#8fe0ec" distance={12} decay={2} />
      {place === 'kitchen' ? <KitchenWithItems /> : <Room />}
      <Tank />
      <Aquarium place={place} />
      <Sparkles count={60} scale={[11, 5, 4.5]} position={[0, -0.3, 0]} size={1.6} speed={0.15} opacity={0.5} color="#e8fbff" />
    </>
  );
}

/** The tank on a desk at night. */
export function Tidepool() {
  return <TideScene place="desk" />;
}

/** The same tank on a kitchen counter late at night, with kitchenware sunk inside. */
export function TidepoolKitchen() {
  return <TideScene place="kitchen" />;
}
