import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { lazy, Suspense } from 'react';

// Concept test scenes, full screen: /?proto=tidepool | kitchen | theme&theme=desk|greenhouse | cast | railway | garden

const SCENES = {
  tidepool: { load: lazy(() => import('./Tidepool').then((m) => ({ default: m.Tidepool }))), cam: [0, 0.6, 12.5] as [number, number, number], target: [0, -0.6, 0] as [number, number, number], fov: 40 },
  railway: { load: lazy(() => import('./Railway').then((m) => ({ default: m.Railway }))), cam: [9, 9.5, 13] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 38 },
  garden: { load: lazy(() => import('./Garden').then((m) => ({ default: m.Garden }))), cam: [8, 7, 12] as [number, number, number], target: [0, 0.6, 0] as [number, number, number], fov: 38 },
  kitchen: { load: lazy(() => import('./Tidepool').then((m) => ({ default: m.TidepoolKitchen }))), cam: [0, 1.0, 16.5] as [number, number, number], target: [0, -0.4, 0] as [number, number, number], fov: 40 },
  crew: { load: lazy(() => import('./CrewPreview').then((m) => ({ default: m.CrewPreview }))), cam: [0, 2.6, 16] as [number, number, number], target: [0, 1.5, 0] as [number, number, number], fov: 40 },
  cast: { load: lazy(() => import('./Cast').then((m) => ({ default: m.Cast }))), cam: [0.2, 1.55, 9.6] as [number, number, number], target: [0.2, 0.85, 0] as [number, number, number], fov: 36 },
  ramen: { load: lazy(() => import('./RamenPreview').then((m) => ({ default: m.RamenPreview }))), cam: [0, 6.2, 21.5] as [number, number, number], target: [0, 2.3, -2.0] as [number, number, number], fov: 40 },
  'workshop-room': { load: lazy(() => import('./WorkshopRoomPreview').then((m) => ({ default: m.WorkshopRoomPreview }))), cam: [0, 5.2, 16.0] as [number, number, number], target: [0, 2.4, -2.0] as [number, number, number], fov: 40 },
  'office-room': { load: lazy(() => import('./OfficeRoomPreview').then((m) => ({ default: m.OfficeRoomPreview }))), cam: [0, 5.4, 15.6] as [number, number, number], target: [0, 2.05, -2.6] as [number, number, number], fov: 40 },
};

// Optional framing for close-ups: &cam=x,y,z&target=x,y,z&fov=n
function vec(v: string | null, fallback: [number, number, number]): [number, number, number] {
  const n = (v || '').split(',').map(Number);
  return n.length === 3 && n.every(Number.isFinite) ? (n as [number, number, number]) : fallback;
}

export default function Proto({ name }: { name: string }) {
  const s = SCENES[name as keyof typeof SCENES] || SCENES.tidepool;
  const Scene = s.load;
  const q = new URLSearchParams(location.search);
  const cam = vec(q.get('cam'), s.cam);
  const target = vec(q.get('target'), s.target);
  const fov = Number(q.get('fov')) || s.fov;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0e0d12' }}>
      <Canvas shadows="percentage" dpr={[1, 2]} camera={{ position: cam, fov, near: 0.1, far: 300 }} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
        <OrbitControls target={target} enableDamping />
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.82} luminanceSmoothing={0.2} />
          <Vignette offset={0.3} darkness={0.55} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
