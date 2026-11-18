import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { glyphTexture, rng, useCanvasTexture } from './kit';

// Concept B, "Midnight Railway": a model railway town on a table at night.
// Every session is a little train with an animal driver; each kind of work is
// a station on the line; a train waiting for you stops under a yellow signal.

const LOOP = new THREE.CatmullRomCurve3(
  [
    [-7.5, 0, -3.6],
    [-2, 0, -4.6],
    [3.5, 0, -4.2],
    [7.6, 0, -2.6],
    [8.4, 0, 0.6],
    [6.8, 0, 3.6],
    [1.5, 0, 4.4],
    [-4, 0, 4.1],
    [-8, 0, 2.4],
    [-8.9, 0, -0.8],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  true,
  'catmullrom',
  0.5,
);
const TRACK_Y = 0.12;

function offsetPoints(curve: THREE.Curve<THREE.Vector3>, off: number, n = 300) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize();
    pts.push(p.clone().addScaledVector(side, off).setY(TRACK_Y + 0.06));
  }
  return pts;
}

function Track({ curve, closed = true }: { curve: THREE.Curve<THREE.Vector3>; closed?: boolean }) {
  const rails = useMemo(
    () => [-0.17, 0.17].map((o) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(offsetPoints(curve, o), closed), 400, 0.03, 6, closed)),
    [curve, closed],
  );
  useEffect(() => () => rails.forEach((g) => g.dispose()), [rails]);
  const sleepers = useRef<THREE.InstancedMesh>(null);
  const count = Math.floor(curve.getLength() / 0.32);
  useEffect(() => {
    const im = sleepers.current;
    if (!im) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < count; i++) {
      const u = i / count;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(t.x, t.z));
      m.compose(new THREE.Vector3(p.x, TRACK_Y, p.z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  }, [curve, count]);
  return (
    <group>
      <instancedMesh ref={sleepers} args={[undefined, undefined, count]} receiveShadow>
        <boxGeometry args={[0.55, 0.05, 0.12]} />
        <meshStandardMaterial color="#4a3426" roughness={0.9} />
      </instancedMesh>
      {rails.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#b8bcc4" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- trains ----------

function Cab({ color, animal }: { color: string; animal: string }) {
  // an animal driver leaning out of the cab window
  const ear = animal === 'cat' || animal === 'fox';
  return (
    <group position={[0, 0.62, -0.32]}>
      <mesh>
        <sphereGeometry args={[0.13, 16, 12]} />
        <meshStandardMaterial color={animal === 'fox' ? '#e0874f' : animal === 'cat' ? '#f1efe9' : '#8b6a4e'} />
      </mesh>
      {ear &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.08, 0.12, 0]} rotation={[0, 0, s * -0.3]}>
            <coneGeometry args={[0.045, 0.1, 4]} />
            <meshStandardMaterial color={animal === 'fox' ? '#e0874f' : '#f1efe9'} />
          </mesh>
        ))}
      {!ear &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.1, 0.1, 0]}>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshStandardMaterial color="#8b6a4e" />
          </mesh>
        ))}
      <mesh position={[0, 0.1, 0.02]} rotation={[0.2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.05, 14]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.05, 0.02, 0.12]}>
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshBasicMaterial color="#141218" />
        </mesh>
      ))}
    </group>
  );
}

function Loco({ color, trim = '#1c1d22', animal = 'cat', steam = false, lit = true }: { color: string; trim?: string; animal?: string; steam?: boolean; lit?: boolean }) {
  return (
    <group>
      {/* chassis and wheels */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.5, 0.12, 1.3]} />
        <meshStandardMaterial color={trim} roughness={0.5} />
      </mesh>
      {[-0.42, 0, 0.42].map((z) =>
        [-0.24, 0.24].map((x) => (
          <mesh key={`${x}${z}`} position={[x, 0.13, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.11, 0.11, 0.06, 16]} />
            <meshStandardMaterial color="#2a2b30" metalness={0.6} roughness={0.4} />
          </mesh>
        )),
      )}
      {steam ? (
        <>
          <mesh position={[0, 0.42, 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.22, 0.8, 20]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.72, 0.45]} castShadow>
            <cylinderGeometry args={[0.07, 0.09, 0.3, 12]} />
            <meshStandardMaterial color={trim} />
          </mesh>
          <mesh position={[0, 0.48, -0.38]} castShadow>
            <boxGeometry args={[0.5, 0.55, 0.45]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.8, -0.38]}>
            <boxGeometry args={[0.56, 0.05, 0.55]} />
            <meshStandardMaterial color={trim} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0.48, 0]} castShadow>
            <boxGeometry args={[0.52, 0.52, 1.24]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.76, 0]}>
            <boxGeometry args={[0.46, 0.06, 1.16]} />
            <meshStandardMaterial color="#e9e4d8" roughness={0.6} />
          </mesh>
          {/* windows */}
          {[-0.3, 0, 0.3].map((z) =>
            [-1, 1].map((s) => (
              <mesh key={`${z}${s}`} position={[s * 0.265, 0.55, z]} rotation={[0, s * Math.PI / 2, 0]}>
                <planeGeometry args={[0.18, 0.16]} />
                <meshBasicMaterial color={lit ? new THREE.Color('#ffd9a0').multiplyScalar(1.3) : '#2a2c36'} toneMapped={false} />
              </mesh>
            )),
          )}
        </>
      )}
      <Cab color={trim} animal={animal} />
      {/* headlamp */}
      <mesh position={[0, 0.38, 0.66]}>
        <sphereGeometry args={[0.06, 12, 8]} />
        <meshBasicMaterial color={lit ? new THREE.Color('#fff3d6').multiplyScalar(2) : '#3a3a40'} toneMapped={false} />
      </mesh>
      {lit && <spotLight position={[0, 0.4, 0.7]} target-position={[0, 0, 3]} angle={0.5} penumbra={0.7} intensity={6} distance={5} color="#fff0d0" />}
    </group>
  );
}

function Carriage({ color, lit = true }: { color: string; lit?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.46, 0.1, 1.05]} />
        <meshStandardMaterial color="#1c1d22" />
      </mesh>
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.5, 0.46, 1.0]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[0.56, 0.06, 1.06]} />
        <meshStandardMaterial color="#3a3b42" />
      </mesh>
      {[-0.3, 0, 0.3].map((z) =>
        [-1, 1].map((s) => (
          <mesh key={`${z}${s}`} position={[s * 0.255, 0.5, z]} rotation={[0, s * Math.PI / 2, 0]}>
            <planeGeometry args={[0.17, 0.15]} />
            <meshBasicMaterial color={lit ? new THREE.Color('#ffd9a0').multiplyScalar(1.3) : '#2a2c36'} toneMapped={false} />
          </mesh>
        )),
      )}
    </group>
  );
}

// A train placed on the loop at u (0..1), moving at `speed` (loop lengths per second).
function Train({ u0, speed = 0, color, coach, animal, steam = false, cars = 2, smoke = false, lit = true }: { u0: number; speed?: number; color: string; coach: string; animal: string; steam?: boolean; cars?: number; smoke?: boolean; lit?: boolean }) {
  const parts = useRef<(THREE.Group | null)[]>([]);
  const len = LOOP.getLength();
  useFrame(({ clock }) => {
    const u = (u0 + clock.elapsedTime * speed) % 1;
    parts.current.forEach((g, i) => {
      if (!g) return;
      const uu = (u - (i * 1.25) / len + 1) % 1;
      const p = LOOP.getPointAt(uu);
      const t = LOOP.getTangentAt(uu);
      g.position.set(p.x, TRACK_Y, p.z);
      g.rotation.y = Math.atan2(t.x, t.z);
    });
  });
  return (
    <group>
      <group ref={(g) => void (parts.current[0] = g)}>
        <Loco color={color} animal={animal} steam={steam} lit={lit} />
        {smoke && <Sparkles count={26} scale={[0.6, 2.4, 0.6]} position={[0, 1.7, 0.45]} size={9} speed={0.6} opacity={0.5} color="#d8d4cc" noise={0.4} />}
      </group>
      {Array.from({ length: cars }, (_, i) => (
        <group key={i} ref={(g) => void (parts.current[i + 1] = g)}>
          <Carriage color={coach} lit={lit} />
        </group>
      ))}
    </group>
  );
}

// ---------- the town ----------

function House({ p, s = [1.1, 0.9, 1.0], c = '#c9b79a', roof = '#7a3e32', rot = 0, lit = 0.6 }: { p: [number, number]; s?: [number, number, number]; c?: string; roof?: string; rot?: number; lit?: number }) {
  const windows = useMemo(() => {
    const r = rng(Math.floor(p[0] * 31 + p[1] * 7 + 99));
    return [-0.25, 0.25].map((x) => ({ x, on: r() < lit }));
  }, [p, lit]);
  return (
    <group position={[p[0], 0, p[1]]} rotation={[0, rot, 0]}>
      <mesh position={[0, s[1] / 2 + 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={s} />
        <meshStandardMaterial color={c} roughness={0.85} />
      </mesh>
      <mesh position={[0, s[1] + 0.05 + 0.25, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[Math.max(s[0], s[2]) * 0.78, 0.5, 4]} />
        <meshStandardMaterial color={roof} roughness={0.8} />
      </mesh>
      {windows.map((w) => (
        <mesh key={w.x} position={[w.x * s[0], s[1] * 0.55 + 0.05, s[2] / 2 + 0.005]}>
          <planeGeometry args={[0.2, 0.22]} />
          <meshBasicMaterial color={w.on ? new THREE.Color('#ffcf8a').multiplyScalar(1.5) : '#2c2a33'} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Tree({ p, h = 1, c = '#2f5a3a' }: { p: [number, number]; h?: number; c?: string }) {
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh position={[0, 0.2 * h, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 0.4 * h, 6]} />
        <meshStandardMaterial color="#4a3426" />
      </mesh>
      <mesh position={[0, 0.75 * h, 0]} castShadow>
        <coneGeometry args={[0.38 * h, 1.1 * h, 7]} />
        <meshStandardMaterial color={c} flatShading roughness={0.9} />
      </mesh>
    </group>
  );
}

function Lamp({ p, color = '#ffd29a', k = 1 }: { p: [number, number]; color?: string; k?: number }) {
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 1.1, 6]} />
        <meshStandardMaterial color="#26272c" />
      </mesh>
      <mesh position={[0, 1.12, 0]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshBasicMaterial color={new THREE.Color(color).multiplyScalar(2 * k)} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.05, 0]} color={color} intensity={3 * k} distance={3.2} decay={2} />
    </group>
  );
}

function StationSign({ p, text, rot = 0 }: { p: [number, number, number]; text: string; rot?: number }) {
  const tex = useCanvasTexture(
    (g, w, h) => {
      g.fillStyle = '#1f3b5c';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#f2eee4';
      g.lineWidth = 6;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#f2eee4';
      g.font = 'bold 40px "M PLUS Rounded 1c", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    },
    320,
    80,
    [text],
  );
  return (
    <group position={p} rotation={[0, rot, 0]}>
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[x, -0.35, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.7, 6]} />
          <meshStandardMaterial color="#26272c" />
        </mesh>
      ))}
      <mesh>
        <planeGeometry args={[1.2, 0.3]} />
        <meshStandardMaterial map={tex} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// Workshop (editing): a crane lifting a crate onto a wagon, slowly.
function Crane({ p }: { p: [number, number] }) {
  const arm = useRef<THREE.Group>(null);
  const crate = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (arm.current) arm.current.rotation.y = Math.sin(t * 0.35) * 0.9;
    if (crate.current) crate.current.position.y = 1.3 + Math.sin(t * 0.7) * 0.3;
  });
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[0.18, 2.0, 0.18]} />
        <meshStandardMaterial color="#d9a441" roughness={0.6} />
      </mesh>
      <group ref={arm} position={[0, 2.0, 0]}>
        <mesh position={[0.8, 0, 0]}>
          <boxGeometry args={[1.8, 0.14, 0.14]} />
          <meshStandardMaterial color="#d9a441" roughness={0.6} />
        </mesh>
        <mesh position={[1.5, -0.35, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 0.7, 4]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <mesh ref={crate} position={[1.5, -0.7, 0]} castShadow>
          <boxGeometry args={[0.32, 0.32, 0.32]} />
          <meshStandardMaterial color="#a0703f" roughness={0.8} />
        </mesh>
      </group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.5 + (i % 2) * 0.36, 0.17 + Math.floor(i / 2) * 0.33, 0.6]} castShadow>
          <boxGeometry args={[0.32, 0.32, 0.32]} />
          <meshStandardMaterial color="#a0703f" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// Running commands: the water tower, its spout down into a steaming engine.
function WaterTower({ p }: { p: [number, number] }) {
  return (
    <group position={[p[0], 0, p[1]]}>
      {[
        [-0.35, -0.35],
        [0.35, -0.35],
        [-0.35, 0.35],
        [0.35, 0.35],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.75, z]}>
          <boxGeometry args={[0.08, 1.5, 0.08]} />
          <meshStandardMaterial color="#5a3d2a" />
        </mesh>
      ))}
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.62, 0.8, 20]} />
        <meshStandardMaterial color="#7a4f33" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <coneGeometry args={[0.7, 0.4, 20]} />
        <meshStandardMaterial color="#3d4250" roughness={0.7} />
      </mesh>
      <mesh position={[0.65, 1.55, 0.2]} rotation={[0, 0, -0.9]}>
        <cylinderGeometry args={[0.06, 0.06, 0.8, 8]} />
        <meshStandardMaterial color="#3d4250" />
      </mesh>
    </group>
  );
}

// Web: the telegraph office with poles and a little paper bird leaving.
function Telegraph({ p }: { p: [number, number] }) {
  const bird = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.25;
    const k = t % 1;
    if (bird.current) {
      bird.current.position.set(p[0] + k * 4, 1.4 + k * 2.4 + Math.sin(t * 20) * 0.05, p[1] - k * 2);
      bird.current.rotation.z = Math.sin(t * 30) * 0.4;
    }
  });
  return (
    <group>
      <House p={p} s={[1.4, 1.0, 1.0]} c="#b9c4cf" roof="#2f4e6b" lit={0.9} />
      {[0, 1.6, 3.2].map((dx) => (
        <group key={dx} position={[p[0] + 1.2 + dx, 0, p[1] - 0.6 - dx * 0.4]}>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.03, 0.04, 1.8, 6]} />
            <meshStandardMaterial color="#4a3426" />
          </mesh>
          <mesh position={[0, 1.7, 0]}>
            <boxGeometry args={[0.5, 0.04, 0.04]} />
            <meshStandardMaterial color="#4a3426" />
          </mesh>
        </group>
      ))}
      <mesh ref={bird}>
        <coneGeometry args={[0.12, 0.3, 3]} />
        <meshStandardMaterial color="#f4efe4" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// Waiting for you: the front platform with a yellow signal and crossing gates down.
function YourPlatform({ p }: { p: [number, number] }) {
  const ask = useMemo(() => glyphTexture('?', '#3a2c00', '#ffd84a'), []);
  useEffect(() => () => ask.dispose(), [ask]);
  const lamp = useRef<THREE.MeshBasicMaterial>(null);
  const yellow = useMemo(() => new THREE.Color('#ffd84a'), []);
  useFrame(({ clock }) => {
    const on = Math.sin(clock.elapsedTime * 4) > 0;
    lamp.current?.color.copy(yellow).multiplyScalar(on ? 2.4 : 0.6);
  });
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh position={[0, 0.16, 0.75]} receiveShadow>
        <boxGeometry args={[3.2, 0.3, 0.8]} />
        <meshStandardMaterial color="#8c8577" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.32, 0.4]}>
        <boxGeometry args={[3.2, 0.02, 0.06]} />
        <meshStandardMaterial color="#ffd84a" emissive="#ffd84a" emissiveIntensity={0.4} />
      </mesh>
      {/* canopy */}
      <mesh position={[0, 1.25, 0.8]}>
        <boxGeometry args={[2.6, 0.06, 0.9]} />
        <meshStandardMaterial color="#2f3540" />
      </mesh>
      {[-1.1, 1.1].map((x) => (
        <mesh key={x} position={[x, 0.75, 1.05]}>
          <cylinderGeometry args={[0.03, 0.03, 1.0, 6]} />
          <meshStandardMaterial color="#2f3540" />
        </mesh>
      ))}
      {/* signal post with the yellow lamp */}
      <group position={[1.9, 0, 0.1]}>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.04, 0.05, 1.6, 8]} />
          <meshStandardMaterial color="#2a2b30" />
        </mesh>
        <mesh position={[0, 1.65, 0]}>
          <boxGeometry args={[0.24, 0.42, 0.14]} />
          <meshStandardMaterial color="#1a1b1f" />
        </mesh>
        <mesh position={[0, 1.65, 0.075]}>
          <circleGeometry args={[0.07, 16]} />
          <meshBasicMaterial ref={lamp} toneMapped={false} />
        </mesh>
        <pointLight position={[0, 1.65, 0.4]} color="#ffd84a" intensity={5} distance={4} decay={2} />
      </group>
      <sprite position={[0, 2.0, 0]} scale={[0.5, 0.5, 0.5]}>
        <spriteMaterial map={ask} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

// Idle: an engine shed where resting trains sit with their lights low.
function Shed({ p, rot = 0 }: { p: [number, number]; rot?: number }) {
  return (
    <group position={[p[0], 0, p[1]]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.75, -1.3]} castShadow>
        <boxGeometry args={[1.6, 1.5, 0.12]} />
        <meshStandardMaterial color="#6b3f32" roughness={0.9} />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 0.75, 0]} castShadow>
          <boxGeometry args={[0.12, 1.5, 2.6]} />
          <meshStandardMaterial color="#6b3f32" roughness={0.9} />
        </mesh>
      ))}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * 0.45, 1.68, 0]} rotation={[0, 0, sd * -0.5]} castShadow>
          <boxGeometry args={[1.05, 0.08, 2.8]} />
          <meshStandardMaterial color="#3d4250" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Table() {
  const felt = useCanvasTexture(
    (g, w, h) => {
      g.fillStyle = '#2f4a2c';
      g.fillRect(0, 0, w, h);
      const r = rng(3);
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(80,120,60,0.35)' : 'rgba(20,40,20,0.35)';
        g.fillRect(r() * w, r() * h, 2, 2);
      }
    },
    256,
    256,
  );
  return (
    <group>
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[20.5, 0.5, 12.5]} />
        <meshStandardMaterial color="#5a3d2a" roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[20, 12]} />
        <meshStandardMaterial map={felt} roughness={1} />
      </mesh>
      {/* a little river with a bridge on the left */}
      <mesh rotation={[-Math.PI / 2, 0, 0.35]} position={[-5.4, 0.02, 0.4]}>
        <planeGeometry args={[1.4, 14]} />
        <meshStandardMaterial color="#1f3f5c" roughness={0.15} metalness={0.2} />
      </mesh>
      <mesh position={[-5.7, 0.2, 4.1]}>
        <boxGeometry args={[1.0, 0.1, 2.0]} />
        <meshStandardMaterial color="#6b5a48" />
      </mesh>
      {/* a hill with a tunnel on the right */}
      <mesh position={[8.6, 0, -0.4]} scale={[1.6, 1.0, 2.0]} castShadow receiveShadow>
        <sphereGeometry args={[1.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#3e5a36" roughness={1} flatShading />
      </mesh>
      {/* the room around the table */}
      <mesh position={[0, 4, -9]}>
        <planeGeometry args={[60, 20]} />
        <meshStandardMaterial color="#1a1720" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]}>
        <planeGeometry args={[80, 60]} />
        <meshStandardMaterial color="#141217" roughness={1} />
      </mesh>
    </group>
  );
}

// A helper (subagent) on a handcar, off along the branch line with a crate.
function Handcar() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const k = (clock.elapsedTime * 0.05) % 1;
    const ping = k < 0.5 ? k * 2 : 2 - k * 2;
    if (g.current) g.current.position.set(-1 + ping * 3.4, TRACK_Y, -1.4 + ping * 0.6);
  });
  return (
    <group ref={g} rotation={[0, Math.PI / 2 - 0.17, 0]}>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.42, 0.08, 0.6]} />
        <meshStandardMaterial color="#6b5a48" />
      </mesh>
      <mesh position={[0, 0.4, 0.05]}>
        <boxGeometry args={[0.24, 0.24, 0.24]} />
        <meshStandardMaterial color="#a0703f" />
      </mesh>
      <mesh position={[0, 0.5, -0.18]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshStandardMaterial color="#d9cfc0" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.06, 0.6, -0.18]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshStandardMaterial color="#d9cfc0" />
        </mesh>
      ))}
    </group>
  );
}

export function Railway() {
  const branch = useMemo(() => new THREE.CatmullRomCurve3([new THREE.Vector3(-2.2, 0, -1.5), new THREE.Vector3(0.5, 0, -1.0), new THREE.Vector3(3.2, 0, -0.8)]), []);
  const shedSpur = useMemo(() => new THREE.CatmullRomCurve3([new THREE.Vector3(5.6, 0, 1.6), new THREE.Vector3(4.6, 0, 0.6), new THREE.Vector3(3.6, 0, 0.2)]), []);
  return (
    <>
      <color attach="background" args={['#100f15']} />
      <fog attach="fog" args={['#100f15', 26, 60]} />
      <ambientLight intensity={0.35} color="#9fb0d8" />
      <hemisphereLight args={['#7f93c8', '#2a2620', 0.5]} />
      <directionalLight position={[-6, 12, 6]} intensity={1.1} color="#b9c8ff" castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-12, 12, 9, -9, 0.5, 40]} />
      </directionalLight>
      <pointLight position={[0, 6, 2]} intensity={14} color="#ffcf9a" distance={22} decay={2} />
      <Table />
      <Track curve={LOOP} />
      <Track curve={branch} closed={false} />
      <Track curve={shedSpur} closed={false} />
      {/* stations: what kind of work */}
      <House p={[-3.2, -5.6]} s={[1.6, 1.1, 1.0]} c="#c9b79a" roof="#5a3a6b" lit={1} />
      <StationSign p={[-3.2, 0.95, -4.85]} text="Library" />
      <Crane p={[2.2, -5.9]} />
      <StationSign p={[3.0, 0.95, -5.1]} text="Workshop" />
      <WaterTower p={[8.7, 4.3]} />
      <StationSign p={[7.6, 0.95, 5.4]} text="Water Tower" rot={-0.3} />
      <Telegraph p={[-8.4, -3.9]} />
      <StationSign p={[-7.4, 0.95, -2.6]} text="Telegraph" rot={0.9} />
      <YourPlatform p={[0.6, 5.2]} />
      <StationSign p={[-1.4, 0.95, 5.6]} text="Your Stop" />
      <group scale={0.8}>
        <Shed p={[6.8, 1.9]} rot={-2.2} />
      </group>
      {/* a small town between the lines */}
      {[
        [-2.6, -1.9, '#d8c7a6', '#7a3e32'],
        [-1.0, -2.6, '#b9a58a', '#3f5a6b'],
        [0.8, -2.3, '#d3b48a', '#7a3e32'],
        [2.4, -2.8, '#c4c9cf', '#5a3a6b'],
        [-3.4, 1.2, '#cdb89a', '#3f5a6b'],
        [-1.6, 1.8, '#d8c7a6', '#7a3e32'],
        [0.4, 1.4, '#b9a58a', '#2f4e6b'],
        [2.2, 2.0, '#d3b48a', '#7a3e32'],
      ].map(([x, z, c, roof], i) => (
        <House key={i} p={[x as number, z as number]} c={c as string} roof={roof as string} rot={(i % 3) * 0.3} />
      ))}
      {[
        [-6.8, 0.8],
        [-6.2, -1.8],
        [6.2, -3.2],
        [7.2, -0.6],
        [-9.2, 4.6],
        [9.4, 4.8],
        [-4.6, 5.6],
        [4.4, 5.8],
        [-9.0, -4.8],
        [5.6, -5.4],
      ].map(([x, z], i) => (
        <Tree key={i} p={[x, z]} h={0.9 + (i % 3) * 0.25} c={i % 2 ? '#2f5a3a' : '#3d6b3a'} />
      ))}
      {[
        [-0.6, 0.2],
        [1.6, -0.2],
        [-2.6, 3.2],
        [3.6, 3.4],
      ].map(([x, z], i) => (
        <Lamp key={i} p={[x, z]} />
      ))}
      {/* trains: the sessions */}
      <Train u0={0.05} speed={0.018} color="#d8573f" coach="#e9c46a" animal="fox" cars={2} />
      <Train u0={0.62} color="#2f5a8c" coach="#7fb8e8" animal="cat" cars={2} />
      <Train u0={0.49} color="#1c1d22" coach="#9a3b3b" animal="bear" steam smoke cars={1} />
      <group position={[5.2, TRACK_Y, 1.3]} rotation={[0, -2.2, 0]}>
        <Loco color="#5f6b52" animal="bear" lit={false} />
      </group>
      <Handcar />
      <Sparkles count={40} scale={[20, 6, 12]} position={[0, 3, 0]} size={1.4} speed={0.1} opacity={0.4} color="#fff3d6" />
    </>
  );
}
