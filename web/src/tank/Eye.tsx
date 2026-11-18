import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

// A glossy cartoon eye: white eyeball, an iris cap that turns to look, two
// catchlights, and lids in the creature's skin colour that blink or close.

const irisTextures = new Map<string, THREE.CanvasTexture>();

// On the iris cap, v runs from the pupil centre (1) to the rim (0) and u goes
// around, so a vertical gradient becomes rings and vertical lines become streaks.
function irisTexture(hex: string) {
  let t = irisTextures.get(hex);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const base = new THREE.Color(hex);
  const css = (k: number) => `#${base.clone().multiplyScalar(k).getHexString()}`;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#040306');
  grad.addColorStop(0.5, '#06050a');
  grad.addColorStop(0.55, css(1.7));
  grad.addColorStop(0.75, css(1.1));
  grad.addColorStop(0.92, css(0.55));
  grad.addColorStop(1, '#0d0a10');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * 256;
    g.strokeStyle = Math.random() < 0.6 ? `rgba(255,255,255,${0.06 + Math.random() * 0.12})` : `rgba(0,0,0,${0.1 + Math.random() * 0.15})`;
    g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath();
    g.moveTo(x, 72);
    g.lineTo(x + (Math.random() - 0.5) * 5, 120);
    g.stroke();
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  irisTextures.set(hex, t);
  return t;
}

const ball = new THREE.SphereGeometry(1, 32, 24);
const irisCap = new THREE.SphereGeometry(1.012, 40, 12, 0, Math.PI * 2, 0, 0.68).rotateX(Math.PI / 2);
const upperLid = new THREE.SphereGeometry(1.07, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const lowerLid = new THREE.SphereGeometry(1.065, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
const lash = new THREE.TorusGeometry(1.08, 0.075, 6, 28, Math.PI).rotateX(Math.PI / 2);
const spark = new THREE.SphereGeometry(1, 12, 8);

const SCLERA = new THREE.MeshPhysicalMaterial({ color: '#fbf8f2', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05 });
const SPARK = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false });
const LASH = new THREE.MeshStandardMaterial({ color: '#2a1c22', roughness: 0.6 });

export type EyeProps = {
  position: [number, number, number];
  r: number;
  lid: string;
  iris?: string;
  /** Turn the whole eye (radians, x/y/z). */
  rotation?: [number, number, number];
  /** How far the lids are open, 0..1. */
  open?: number;
  closed?: boolean;
  blink?: boolean;
  /** Where the pupil looks, in the eye's own space (+z is straight ahead). */
  look?: [number, number, number];
  /** Follow the camera, as if looking at you. */
  watch?: boolean;
};

export function Eye({ position, r, lid, iris = '#3b2a55', rotation, open = 1, closed = false, blink = true, look = [0, 0, 1], watch = false }: EyeProps) {
  const pupil = useRef<THREE.Group>(null);
  const up = useRef<THREE.Mesh>(null);
  const lo = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.Group>(null);
  const lidMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: lid, roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide }), [lid]);
  const irisMat = useMemo(() => new THREE.MeshPhysicalMaterial({ map: irisTexture(iris), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 }), [iris]);
  const seed = useMemo(() => Math.random() * 10, []);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), q: new THREE.Quaternion(), f: new THREE.Vector3(0, 0, 1) }), []);
  const { camera } = useThree();

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    let o = closed ? 0 : open;
    if (!closed && blink) {
      const k = t % 4.3;
      if (k < 0.18) o *= Math.abs(Math.cos((k / 0.18) * Math.PI));
    }
    if (up.current) up.current.rotation.x = -(0.02 + o * 1.05);
    if (lo.current) lo.current.rotation.x = 0.02 + o * 0.8;
    if (sparks.current) sparks.current.visible = o > 0.35;
    const p = pupil.current;
    if (p && p.parent) {
      if (watch) {
        p.parent.worldToLocal(tmp.v.copy(camera.position));
        tmp.v.normalize().lerp(tmp.f, 0.35).normalize();
      } else tmp.v.set(look[0], look[1], look[2]).normalize();
      tmp.q.setFromUnitVectors(tmp.f, tmp.v);
      p.quaternion.slerp(tmp.q, 0.12);
    }
  });

  return (
    <group position={position} rotation={rotation} scale={r}>
      <mesh geometry={ball} material={SCLERA} />
      <group ref={pupil}>
        <mesh geometry={irisCap} material={irisMat} />
      </group>
      <group ref={sparks}>
        <mesh geometry={spark} material={SPARK} position={[-0.3, 0.36, 0.86]} scale={0.17} />
        <mesh geometry={spark} material={SPARK} position={[0.3, -0.24, 0.9]} scale={0.08} />
      </group>
      <mesh ref={up} geometry={upperLid} material={lidMat} />
      <mesh ref={lo} geometry={lowerLid} material={lidMat} />
      {closed && <mesh geometry={lash} material={LASH} />}
    </group>
  );
}
