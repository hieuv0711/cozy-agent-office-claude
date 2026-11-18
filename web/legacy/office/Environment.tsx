import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Mood } from './textures';
import type { WorldId } from './world';

// What surrounds each place, so the frame never ends in a black void: a sky
// dome that follows the mood, fog in the horizon colour, a distant skyline,
// and the ground each place stands on (a tower for the office, a night street
// for the ramen bar, open grass for the park).

interface Palette {
  zenith: string;
  mid: string;
  horizon: string;
  below: string;
  stars: number;
}

const SKIES: Record<Mood, Palette> = {
  dusk: { zenith: '#1b1a3f', mid: '#56407f', horizon: '#e48f97', below: '#3b2f4c', stars: 70 },
  night: { zenith: '#04071a', mid: '#0d1636', horizon: '#26345f', below: '#0a0f20', stars: 260 },
  rain: { zenith: '#121826', mid: '#1f2738', horizon: '#3a4458', below: '#171c28', stars: 0 },
};

// The colour fog fades to: a little below the horizon band, so ground meets sky softly.
export function fogColor(mood: Mood) {
  return new THREE.Color(SKIES[mood].horizon).lerp(new THREE.Color(SKIES[mood].below), 0.45);
}

function domeTexture(mood: Mood) {
  const p = SKIES[mood];
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  // canvas top = zenith, middle row = horizon, bottom = below the horizon
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, p.zenith);
  grad.addColorStop(0.3, p.mid);
  grad.addColorStop(0.48, p.horizon);
  grad.addColorStop(0.53, fogColor(mood).getStyle());
  grad.addColorStop(1, p.below);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  let seed = 41;
  const r = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  g.fillStyle = '#ffffff';
  for (let i = 0; i < p.stars; i++) {
    const y = Math.pow(r(), 1.6) * H * 0.4;
    g.globalAlpha = (0.25 + r() * 0.65) * (1 - y / (H * 0.42));
    g.fillRect(r() * W, y, 1.5, 1.5);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The dome travels with the camera, so no camera position can see past it.
function SkyDome({ mood }: { mood: Mood }) {
  const tex = useMemo(() => domeTexture(mood), [mood]);
  useEffect(() => () => tex.dispose(), [tex]);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} renderOrder={-1}>
      <sphereGeometry args={[115, 48, 24]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

// Open places need their sky closer than the dome: from the high Wide shot
// the dome's horizon is out of frame. A gradient wall at a few dozen metres
// rises from the fog colour at the ground to the zenith, behind the groves.
function wallTexture(mood: Mood) {
  const p = SKIES[mood];
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 512;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 512, 0, 0);
  grad.addColorStop(0, fogColor(mood).getStyle());
  grad.addColorStop(0.1, p.horizon);
  grad.addColorStop(0.45, p.mid);
  grad.addColorStop(1, p.zenith);
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function SkyWall({ mood, radius = 44 }: { mood: Mood; radius?: number }) {
  const tex = useMemo(() => wallTexture(mood), [mood]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, 18, 0]}>
      <cylinderGeometry args={[radius, radius, 40, 64, 1, true]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} toneMapped={false} />
    </mesh>
  );
}

// A soft pool of light on the ground (street lamps, a shop's spill).
function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function Pools({ pools }: { pools: { p: [number, number]; s: [number, number]; c: string; k?: number }[] }) {
  const tex = useMemo(() => poolTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group>
      {pools.map((q, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[q.p[0], 0.008, q.p[1]]}>
          <planeGeometry args={q.s} />
          <meshBasicMaterial map={tex} color={new THREE.Color(q.c).multiplyScalar(q.k ?? 0.6)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function StreetLamp({ p }: { p: [number, number] }) {
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh position={[0, 2.1, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 4.2, 8]} />
        <meshStandardMaterial color="#2b2c32" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[-0.35, 4.15, 0]}>
        <boxGeometry args={[0.8, 0.06, 0.12]} />
        <meshStandardMaterial color="#2b2c32" />
      </mesh>
      <mesh position={[-0.7, 4.05, 0]}>
        <boxGeometry args={[0.32, 0.1, 0.22]} />
        <meshBasicMaterial color={new THREE.Color('#ffd9a0').multiplyScalar(2)} toneMapped={false} />
      </mesh>
      <pointLight position={[-0.7, 3.8, 0]} color="#ffcf94" intensity={9} distance={9} decay={2} />
    </group>
  );
}

// A distant skyline all around: buildings with a few lit windows on a
// transparent band, so the dome shows above and between them.
function skylineTexture(mood: Mood) {
  const W = 2048;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  let seed = 9;
  const r = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const body = mood === 'dusk' ? '#2c2547' : mood === 'night' ? '#0c1226' : '#1d2333';
  let x = 0;
  while (x < W) {
    const w = 16 + r() * 46;
    const h = H * (0.18 + r() * 0.6);
    g.fillStyle = body;
    g.fillRect(x, H - h, w, h);
    if (r() < 0.2) g.fillRect(x + w * 0.45, H - h - 10, 2, 10);
    for (let wy = H - h + 6; wy < H - 4; wy += 8)
      for (let wx = x + 3; wx < x + w - 3; wx += 6)
        if (r() < (mood === 'dusk' ? 0.12 : mood === 'night' ? 0.28 : 0.18)) {
          g.fillStyle = r() < 0.85 ? 'rgba(255,212,140,0.9)' : 'rgba(200,220,255,0.8)';
          g.fillRect(wx, wy, 2, 3);
        }
    x += w + r() * 10;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

function CityBand({ mood, y, radius = 78, height = 16 }: { mood: Mood; y: number; radius?: number; height?: number }) {
  const tex = useMemo(() => skylineTexture(mood), [mood]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, y + height / 2, 0]}>
      <cylinderGeometry args={[radius, radius, height, 64, 1, true]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} transparent fog={false} depthWrite={false} toneMapped={false} opacity={0.92} />
    </mesh>
  );
}

function facadeTexture(lit: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#1c1e2c';
  g.fillRect(0, 0, 128, 128);
  let seed = 3;
  const r = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const on = r() < lit;
      g.fillStyle = on ? (r() < 0.8 ? '#ffd28c' : '#cfe0ff') : '#2a2d40';
      g.fillRect(x * 32 + 7, y * 32 + 8, 18, 16);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function Building({ p, s, tex }: { p: [number, number, number]; s: [number, number, number]; tex: THREE.Texture }) {
  // each building gets its own repeat so windows keep their size
  const map = useMemo(() => {
    const t = tex.clone();
    t.repeat.set(Math.max(1, s[0] / 3), Math.max(1, s[1] / 3));
    t.needsUpdate = true;
    return t;
  }, [tex, s]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshStandardMaterial map={map} roughness={0.9} emissive="#ffffff" emissiveMap={map} emissiveIntensity={0.35} />
    </mesh>
  );
}

// The office is a lit floor near the top of a tower; the tower drops into the
// haze, with lower rooftops around it.
function Tower() {
  const tex = useMemo(() => facadeTexture(0.32), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const others: [number, number, number, number, number][] = [
    // x, z, width, depth, roof height
    [-27, -16, 10, 10, -5],
    [-8, -27, 12, 9, -9],
    [16, -24, 9, 12, -12],
    [27, 6, 10, 10, -15],
    [-28, 12, 9, 11, -11],
    [10, 27, 12, 9, -19],
    [-12, 26, 10, 10, -16],
  ];
  return (
    <group>
      <Building p={[0, -30.6, 0]} s={[18.7, 60, 12.7]} tex={tex} />
      {others.map(([x, z, w, d, top], i) => (
        <Building key={i} p={[x, top - 30, z]} s={[w, 60, d]} tex={tex} />
      ))}
    </group>
  );
}

// The ramen bar sits on a night street: sidewalk around the shop, a road in
// front with a dashed line, utility poles with sagging wires, low houses behind.
function Street() {
  const tex = useMemo(() => facadeTexture(0.2), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const wires = useMemo(() => {
    const pts: THREE.Vector3[][] = [];
    // behind the shop, so the wires cross the sky instead of the view
    const poles: [number, number][] = [
      [-22, -8.8],
      [-10, -8.8],
      [2, -8.8],
      [14, -8.8],
    ];
    for (let i = 0; i < poles.length - 1; i++)
      for (const dy of [0, 0.35, 0.7]) {
        const a = new THREE.Vector3(poles[i][0], 6.4 - dy, poles[i][1]);
        const b = new THREE.Vector3(poles[i + 1][0], 6.4 - dy, poles[i + 1][1]);
        const line: THREE.Vector3[] = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          const p = a.clone().lerp(b, t);
          p.y -= Math.sin(t * Math.PI) * 0.6;
          line.push(p);
        }
        pts.push(line);
      }
    return { poles, lines: pts.map((l) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(l), new THREE.LineBasicMaterial({ color: '#141620' }))) };
  }, []);
  useEffect(() => () => wires.lines.forEach((l) => l.geometry.dispose()), [wires]);
  return (
    <group>
      {/* asphalt everywhere, fading into the fog */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[140, 48]} />
        <meshStandardMaterial color="#35333a" roughness={0.9} />
      </mesh>
      {/* sidewalk around the shop */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]} receiveShadow>
        <planeGeometry args={[24, 18]} />
        <meshStandardMaterial color="#6a645c" roughness={0.9} />
      </mesh>
      {/* the road's dashed centre line and a crosswalk */}
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-30 + i * 4.2, -0.008, 13]}>
          <planeGeometry args={[2, 0.16]} />
          <meshBasicMaterial color="#cfc8b4" />
        </mesh>
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[13.5, -0.008, 10.5 + i * 0.9]}>
          <planeGeometry args={[3, 0.45]} />
          <meshBasicMaterial color="#cfc8b4" />
        </mesh>
      ))}
      {/* utility poles and wires: the lofi street */}
      {wires.poles.map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          <mesh position={[0, 3.4, 0]}>
            <cylinderGeometry args={[0.09, 0.12, 6.8, 8]} />
            <meshStandardMaterial color="#3a3a40" roughness={0.8} />
          </mesh>
          <mesh position={[0, 6.4, 0]}>
            <boxGeometry args={[1.4, 0.08, 0.08]} />
            <meshStandardMaterial color="#3a3a40" />
          </mesh>
        </group>
      ))}
      {wires.lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
      {/* light on the street: lamps, the shop's warm spill, a vending machine */}
      <StreetLamp p={[11.6, 4.6]} />
      <StreetLamp p={[-11.4, 7.2]} />
      <Pools
        pools={[
          { p: [0, 8.2], s: [20, 4.2], c: '#ffb070', k: 0.55 },
          { p: [10.9, 4.6], s: [7, 7], c: '#ffcf94', k: 0.7 },
          { p: [-12.1, 7.2], s: [7, 7], c: '#ffcf94', k: 0.7 },
          { p: [-9.6, 3.55], s: [3.2, 4], c: '#ff9a6a', k: 0.6 },
          { p: [10.9, -1.6], s: [2.6, 2.6], c: '#dfeaff', k: 0.45 },
        ]}
      />
      <group position={[10.9, 0, -2.4]}>
        <mesh position={[0, 0.95, 0]} castShadow>
          <boxGeometry args={[0.9, 1.9, 0.7]} />
          <meshStandardMaterial color="#d9d6cf" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.15, 0.36]}>
          <planeGeometry args={[0.7, 1.0]} />
          <meshBasicMaterial color={new THREE.Color('#eef3ff').multiplyScalar(1.15)} toneMapped={false} />
        </mesh>
        <pointLight position={[0, 1.2, 0.9]} color="#e6eeff" intensity={2.5} distance={4} decay={2} />
      </group>
      {/* low houses set back behind and beside the shop */}
      <Building p={[-6, 1.6, -14]} s={[9, 3.2, 5]} tex={tex} />
      <Building p={[5, 2.1, -15]} s={[8, 4.2, 6]} tex={tex} />
      <Building p={[15, 1.5, -13.5]} s={[6, 3, 5]} tex={tex} />
      <Building p={[-17, 1.8, -4]} s={[5, 3.6, 9]} tex={tex} />
      <Building p={[-18, 1.4, 9]} s={[6, 2.8, 6]} tex={tex} />
    </group>
  );
}

// The park keeps going: grass to the horizon, with groves along the edges.
function Meadow() {
  const groves = useMemo(() => {
    const out: { p: [number, number]; s: number; c: string }[] = [];
    let seed = 5;
    const r = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const cols = ['#4f7f3a', '#d9822b', '#c4512d', '#e3b23c', '#3e6b3a'];
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = 15 + r() * 24;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (z > 6 && Math.abs(x) < 18) continue; // keep the view toward the camera open
      out.push({ p: [x, z], s: 0.9 + r() * 1.6, c: cols[Math.floor(r() * cols.length)] });
    }
    return out;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[140, 48]} />
        <meshStandardMaterial color="#456b3d" roughness={1} />
      </mesh>
      {groves.map((g, i) => (
        <group key={i} position={[g.p[0], 0, g.p[1]]} scale={g.s}>
          <mesh position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.1, 0.16, 1.4, 6]} />
            <meshStandardMaterial color="#4a3426" />
          </mesh>
          <mesh position={[0, 1.8, 0]}>
            <icosahedronGeometry args={[0.85, 0]} />
            <meshStandardMaterial color={g.c} flatShading roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Environment({ world, mood }: { world: WorldId; mood: Mood }) {
  const fog = useMemo(() => fogColor(mood), [mood]);
  const [near, far] = world === 'office' ? [42, 125] : world === 'ramen' ? [38, 118] : [34, 112];
  return (
    <>
      <fog attach="fog" args={[fog, near, far]} />
      <SkyDome mood={mood} />
      {world === 'office' && (
        <>
          <Tower />
          <CityBand mood={mood} y={-30} height={22} />
        </>
      )}
      {world === 'ramen' && (
        <>
          <Street />
          <CityBand mood={mood} y={-1} />
        </>
      )}
      {world === 'park' && (
        <>
          <Meadow />
          <SkyWall mood={mood} radius={44} />
          <CityBand mood={mood} y={-1} radius={42} height={9} />
        </>
      )}
    </>
  );
}
