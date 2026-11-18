import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TidepoolKitchen } from '../proto/Tidepool';

// A self-contained page with just the Tidepool tank on a kitchen counter at
// night: no server, no data, everything drawn in the browser. Built into one
// HTML file by `npm run build:kitchen`.

// Framed for a 16:10 window. Narrower or portrait windows step the camera back
// just enough to keep the whole tank (about 14.4 units wide with a margin) in view.
const aspect = window.innerWidth / Math.max(1, window.innerHeight);
const distance = Math.max(16.5, 7.2 / (Math.tan((20 * Math.PI) / 180) * aspect));

function Scene() {
  return (
    <Canvas shadows="percentage" dpr={[1, 2]} camera={{ position: [0, 1.0, distance], fov: 40, near: 0.1, far: 300 }} gl={{ antialias: true }}>
      <TidepoolKitchen />
      <OrbitControls target={[0, -0.4, 0]} enableDamping maxDistance={Math.max(60, distance * 1.3)} minDistance={3} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.82} luminanceSmoothing={0.2} />
        <Vignette offset={0.3} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Scene />
  </StrictMode>,
);
