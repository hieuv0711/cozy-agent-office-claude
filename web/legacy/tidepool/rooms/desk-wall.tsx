import { useMemo } from 'react';
import * as THREE from 'three';
import { smoothLathe } from '../../tank/kitchenware';
import { clockFaceTexture, printTexture, PRINTS } from './desk-art';
import { material, metals, pick, rand, roundRectShape, slab, woodTexture } from './desk-kit';
import { clockHands, Hands } from './desk-things';

// Things that hang on the wall: a framed print and a wall clock. Each has its
// back on the wall at the origin, centred there, and faces +z.

const FINISHES = ['gilt', 'walnut', 'black'] as const;

function finishMaterial(f: (typeof FINISHES)[number]) {
  if (f === 'gilt') return material('frame:gilt', () => new THREE.MeshStandardMaterial({ color: '#c49a48', metalness: 0.85, roughness: 0.36 }));
  if (f === 'walnut')
    return material('frame:walnut', () => new THREE.MeshPhysicalMaterial({ map: woodTexture('frame-walnut', { w: 512, h: 256, light: '#7a4a2a', dark: '#2a160b', planks: 1, rings: 14, seed: 15, joints: false, seams: 0 }), roughness: 0.4, clearcoat: 0.6 }));
  return material('frame:black', () => new THREE.MeshPhysicalMaterial({ color: '#17161a', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }));
}

/** A ring of `shape` minus an inner rounded rectangle, as a bevelled moulding `depth` deep with its back at z = 0. */
function ring(ow: number, oh: number, iw: number, ih: number, depth: number, bevel: number, r = 0.02) {
  const s = roundRectShape(ow, oh, r);
  s.holes.push(roundRectShape(iw, ih, Math.min(r, 0.01)));
  return slab(s, depth, bevel, 3, 12).translate(0, 0, depth / 2);
}

/** A framed print behind glass, on a cream mat with a bevelled window. Art and frame finish by seed. */
export function FramedPrint({ seed }: { seed: number }) {
  const r = rand(seed);
  const print = pick(r, PRINTS);
  const finish = pick(r, FINISHES);
  const art = { w: 1.3, h: 1.69 };
  const mat = { w: art.w + 0.56, h: art.h + 0.56 };
  const out = { w: mat.w + 0.42, h: mat.h + 0.42 };
  const geo = useMemo(
    () => ({
      frame: ring(out.w - 0.08, out.h - 0.08, mat.w + 0.02, mat.h + 0.02, 0.14, 0.04, 0.03),
      slip: ring(mat.w + 0.06, mat.h + 0.06, mat.w - 0.05, mat.h - 0.05, 0.03, 0.01),
      mat: ring(mat.w, mat.h, art.w + 0.03, art.h + 0.03, 0.025, 0.008, 0.004),
    }),
    [out.w, out.h, mat.w, mat.h, art.w, art.h],
  );
  const m = metals();
  const frameMat = finishMaterial(finish);
  const matMat = material('frame:mat', () => new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.92 }));
  const artMat = material('frame:art:' + print, () => new THREE.MeshStandardMaterial({ map: printTexture(print), roughness: 0.85 }));
  const back = material('frame:back', () => new THREE.MeshStandardMaterial({ color: '#2a2420', roughness: 1 }));
  return (
    <group>
      <mesh material={back} position={[0, 0, 0.004]}>
        <planeGeometry args={[out.w - 0.1, out.h - 0.1]} />
      </mesh>
      <mesh material={artMat} position={[0, 0, 0.03]} receiveShadow>
        <planeGeometry args={[art.w + 0.06, art.h + 0.06]} />
      </mesh>
      <mesh geometry={geo.mat} material={matMat} position={[0, 0, 0.03]} receiveShadow />
      <mesh geometry={geo.slip} material={m.gold} position={[0, 0, 0.05]} />
      <mesh geometry={geo.frame} material={frameMat} castShadow receiveShadow />
      <mesh material={m.glass} position={[0, 0, 0.11]} renderOrder={2}>
        <planeGeometry args={[mat.w + 0.04, mat.h + 0.04]} />
      </mesh>
    </group>
  );
}

const CASES = ['walnut', 'black', 'brass'] as const;

/** A round wall clock with a domed glass, Roman dial and spade hands that keep the real time. Case by seed. */
export function WallClock({ seed }: { seed: number }) {
  const finish = pick(rand(seed), CASES);
  const R = 1.15;
  const geo = useMemo(() => {
    const body = smoothLathe(
      [
        [0, 0],
        [R - 0.06, 0],
        [R, 0.03],
        [R + 0.03, 0.1],
        [R + 0.02, 0.19],
        [R - 0.04, 0.24],
        [R - 0.1, 0.235],
        [R - 0.13, 0.19],
        [0, 0.18],
      ],
      80,
      96,
    ).rotateX(Math.PI / 2);
    const bezel = smoothLathe(
      [
        [R - 0.16, 0.2],
        [R - 0.08, 0.2],
        [R - 0.05, 0.235],
        [R - 0.08, 0.27],
        [R - 0.14, 0.265],
        [R - 0.16, 0.24],
      ],
      30,
      96,
    ).rotateX(Math.PI / 2);
    const dome = smoothLathe(
      [
        [R - 0.12, 0.24],
        [R * 0.6, 0.29],
        [0, 0.31],
      ],
      30,
      64,
    ).rotateX(Math.PI / 2);
    return { body, bezel, dome, face: new THREE.CircleGeometry(R - 0.13, 80), hands: clockHands(R * 0.8) };
  }, []);
  const m = metals();
  const caseMat =
    finish === 'brass'
      ? m.brass
      : finish === 'black'
        ? material('clock:black', () => new THREE.MeshPhysicalMaterial({ color: '#1a191c', roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 }))
        : material('clock:walnut', () => new THREE.MeshPhysicalMaterial({ map: woodTexture('clock-walnut', { w: 512, h: 256, light: '#86542f', dark: '#2c170a', planks: 1, rings: 16, seed: 9, joints: false, seams: 0 }), roughness: 0.38, clearcoat: 0.7 }));
  const faceMat = material('clock:face', () => new THREE.MeshStandardMaterial({ map: clockFaceTexture('wall'), roughness: 0.65 }));
  return (
    <group>
      <mesh geometry={geo.body} material={caseMat} castShadow receiveShadow />
      <mesh geometry={geo.bezel} material={finish === 'brass' ? m.gold : m.brass} castShadow />
      <mesh geometry={geo.face} material={faceMat} position={[0, 0, 0.185]} receiveShadow />
      <Hands hour={geo.hands.hour} minute={geo.hands.minute} second={geo.hands.second} z={0.19} />
      <mesh geometry={geo.dome} material={m.glass} renderOrder={2} />
    </group>
  );
}
