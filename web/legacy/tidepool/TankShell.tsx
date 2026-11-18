import { Sparkles } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { rng, useCanvasTexture } from '../proto/kit';
import { Sand } from '../tank/reef';
import { Bubbles } from '../tank/signs';
import { SAND_Y, TANK } from './space';
import { type Weather, weatherLight } from './weather/state';

// The aquarium itself, the same in every theme: glass panes in a dark frame,
// the hood with its light strip, the water's surface, a painted far reef behind,
// light shafts, the rippled sand (with its cut face against the glass), an air
// stone's bubbles and drifting specks.

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

/**
 * The tank's light: a spotlight from above and in front, with no falloff, so
 * everything in the tank is lit as if by one even lamp while the room around
 * it stays as dark as its own lamps leave it.
 */
export function TankLight({ weather = 'clear' }: { weather?: Weather }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  // The weather only turns the room's light up or down: a clear night is
  // lamplight, rain and storm are darker, snow a little brighter and cooler.
  // It eases over a couple of seconds, like the views and the glass. The set
  // of lights never changes (adding one would recompile every material).
  const amb = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const first = useMemo(() => weatherLight(weather), []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, delta) => {
    const to = weatherLight(weather);
    const k = 1 - Math.exp(-Math.min(0.1, delta) * 1.6);
    if (amb.current) amb.current.intensity += (to.amb - amb.current.intensity) * k;
    if (hemi.current) hemi.current.intensity += (to.hemi - hemi.current.intensity) * k;
    if (fill.current) fill.current.intensity += (to.fill - fill.current.intensity) * k;
  });
  return (
    <>
      <ambientLight ref={amb} intensity={first.amb} color="#cfe6f0" />
      <hemisphereLight ref={hemi} args={['#a9dcff', '#4a3a2a', first.hemi]} />
      <directionalLight ref={fill} position={[-14, 6, 8]} intensity={first.fill} color="#ffb57d" />
      <primitive object={target} position={[0, -1.2, 0]} />
      <spotLight position={[2, 9, 3]} target={target} angle={0.66} penumbra={0.3} intensity={2.3} decay={0} color="#e3f8ff" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-near={2} shadow-camera-far={30} />
      {/* a cool fill inside the water, and the tank's glow spilling onto the surface in front */}
      <pointLight position={[0, 1.5, 1.5]} intensity={3} color="#8fe0ec" distance={12} decay={2} />
      <pointLight position={[0, -1.7, 4.2]} intensity={4} color="#5fd2e8" distance={8} decay={2} />
    </>
  );
}

/** The tank with its sand, bubbles and drifting specks. Items and creatures go in separately. */
export function TankShell() {
  return (
    <>
      <Tank />
      <group position={[0, SAND_Y, 0]}>
        <Sand width={TANK.x * 2} depth={TANK.z * 2} skirt={SAND_Y - TANK.yBot} />
        <Bubbles origin={[-0.6, 0, -1.4]} count={14} speed={0.8} spread={0.1} size={0.045} rise={4.7} />
      </group>
      <Sparkles count={60} scale={[11, 5, 4.5]} position={[0, -0.3, 0]} size={1.6} speed={0.15} opacity={0.5} color="#e8fbff" />
    </>
  );
}
