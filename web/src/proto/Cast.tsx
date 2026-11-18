import { Sparkles } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Axolotl } from '../tank/Axolotl';
import { Jellyfish } from '../tank/Jellyfish';
import { Octopus } from '../tank/Octopus';
import { Anemone, Kelp, SeaFan, Seagrass, TubeSponges } from '../tank/plants';
import { Puffer } from '../tank/Puffer';
import { BrainCoral, BranchCoral, Rock, Sand, ShellBed } from '../tank/reef';
import { School } from '../tank/School';
import { Seahorse } from '../tank/Seahorse';
import { Shrimp } from '../tank/Shrimp';
import { useTankEnvironment, WaterClock } from '../tank/water';

// A character sheet: the whole cast and the plants on one stage, for judging the art up close.

function Backdrop() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 256;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#3fb0c2');
    grad.addColorStop(0.5, '#155f74');
    grad.addColorStop(1, '#0a3343');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, 4, -7]}>
      <planeGeometry args={[40, 16]} />
      <meshBasicMaterial map={tex} fog={false} toneMapped={false} />
    </mesh>
  );
}

const shrimpPath = (t: number, out: THREE.Vector3) => {
  const k = (t * 0.08) % 1;
  out.set(1.9 - k * 3.2, 0.35 + Math.sin(k * Math.PI) * 0.45, 1.5);
};

export function Cast() {
  useTankEnvironment(0.45);
  return (
    <>
      <WaterClock />
      <color attach="background" args={['#0f4152']} />
      <fog attach="fog" args={['#0f4152', 10, 26]} />
      <ambientLight intensity={0.4} color="#cfeef5" />
      <hemisphereLight args={['#bff3ff', '#5a4a36', 0.55]} />
      <directionalLight position={[2, 8, 4]} intensity={2.1} color="#e8fbff" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
        <orthographicCamera attach="shadow-camera" args={[-7, 7, 5.5, -5.5, 0.5, 25]} />
      </directionalLight>
      <directionalLight position={[-4, 3, -5]} intensity={0.8} color="#7fd4ff" />
      <Backdrop />
      <Sand width={22} depth={16} />
      <Kelp position={[-4.7, 0, -2.5]} height={4.4} seed={1} />
      <Kelp position={[-3.9, 0, -3.1]} height={3.6} seed={4} />
      <Kelp position={[-1.3, 0, -2.9]} height={3.7} seed={3} />
      <Kelp position={[2.0, 0, -3.1]} height={4.0} seed={5} />
      <Kelp position={[4.9, 0, -2.3]} height={4.1} seed={2} />
      <Rock position={[-2.5, 0.2, -1.9]} size={[0.9, 0.55, 0.6]} seed={1} />
      <Rock position={[3.5, 0.25, -1.7]} size={[1.0, 0.7, 0.7]} seed={2} />
      <BranchCoral position={[1.15, 0, -1.5]} seed={2} />
      <BrainCoral position={[-4.1, 0, -0.9]} seed={1} scale={0.8} />
      <SeaFan position={[2.7, 0, -2.4]} />
      <Anemone position={[-1.2, 0, -0.9]} />
      <TubeSponges position={[-0.05, 0, -1.9]} />
      <TubeSponges position={[4.2, 0, -0.9]} scale={0.8} rotation={1.2} body="#7d5bc4" lip="#d4b8ff" />
      <Seagrass center={[3.9, 0, 0.8]} area={[0.8, 0.5]} count={70} />
      <Seagrass center={[-4.7, 0, 0.9]} area={[0.8, 0.5]} count={70} seed={2} />
      <Octopus position={[-3.3, 0, 0.35]} rotation={0.4} working />
      <Puffer position={[-1.35, 1.05, 0.5]} rotation={0.75} running />
      <Seahorse position={[0.55, 0, 0.55]} rotation={-0.85} waiting />
      <ShellBed position={[2.35, 0, 0.35]} rotation={-0.3} />
      <Axolotl position={[2.35, 0.07, 0.35]} rotation={-0.75} asleep />
      <Jellyfish position={[3.75, 1.7, -0.6]} />
      <Shrimp path={shrimpPath} />
      <School center={[0.6, 2.7, -1.6]} count={18} radius={[1.6, 0.25, 0.5]} />
      <Sparkles count={60} scale={[12, 4, 5]} position={[0, 1.6, 0]} size={1.4} speed={0.15} opacity={0.5} color="#e8fbff" />
    </>
  );
}
