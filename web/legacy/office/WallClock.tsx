import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { pomodoro, progressOf, startFocus, stopPomodoro } from '../lib/pomodoro';

// A wall clock showing the real local time. Around the face, a ring fills
// while a Pomodoro focus round or break runs. Click the clock to start a focus
// round, click again to stop it. Each place hangs it where it fits.

function faceTexture(ink: string, paper: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = paper;
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = ink;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    g.lineWidth = long ? 6 : 2;
    const r0 = long ? 92 : 104;
    g.beginPath();
    g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0);
    g.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FOCUS = new THREE.Color('#f6f1e4');
const BREAK = new THREE.Color('#8fd19e');

export function WallClock({ position, rotation = [0, 0, 0], size = 0.34, frame = '#2b2d40' }: { position: [number, number, number]; rotation?: [number, number, number]; size?: number; frame?: string }) {
  const face = useMemo(() => faceTexture('#1d1f2b', '#efe9da'), []);
  useEffect(() => () => face.dispose(), [face]);
  const hour = useRef<THREE.Group>(null);
  const minute = useRef<THREE.Group>(null);
  const second = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: FOCUS.clone().multiplyScalar(1.4), toneMapped: false }), []);
  useEffect(() => () => ringMat.dispose(), [ringMat]);
  const last = useRef(-1);
  useFrame(() => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    if (second.current) second.current.rotation.z = -(s / 60) * Math.PI * 2;
    if (minute.current) minute.current.rotation.z = -(m / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(h / 12) * Math.PI * 2;
    const p = pomodoro.get();
    const { done } = progressOf(p);
    const r = ring.current;
    if (!r) return;
    r.visible = p.phase !== 'idle';
    // rebuild the arc only when it moved by at least a degree
    const step = Math.round(done * 360);
    if (r.visible && step !== last.current) {
      last.current = step;
      r.geometry.dispose();
      r.geometry = new THREE.RingGeometry(size * 1.08, size * 1.2, 64, 1, Math.PI / 2 - Math.max(0.001, done) * Math.PI * 2, Math.max(0.001, done) * Math.PI * 2);
      ringMat.color.copy(p.phase === 'break' ? BREAK : FOCUS).multiplyScalar(1.4);
    }
  });
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (pomodoro.get().phase === 'idle') startFocus();
    else stopPomodoro();
  };
  return (
    <group
      position={position}
      rotation={rotation}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      <mesh position={[0, 0, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[size * 1.06, size * 1.06, 0.06, 40]} />
        <meshStandardMaterial color={frame} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <circleGeometry args={[size, 48]} />
        <meshBasicMaterial map={face} />
      </mesh>
      <mesh ref={ring} position={[0, 0, 0.004]} material={ringMat} visible={false}>
        <ringGeometry args={[size * 1.08, size * 1.2, 64, 1, 0, 0.01]} />
      </mesh>
      <group ref={hour} position={[0, 0, 0.01]}>
        <mesh position={[0, size * 0.25, 0]}>
          <planeGeometry args={[size * 0.07, size * 0.52]} />
          <meshBasicMaterial color="#1d1f2b" />
        </mesh>
      </group>
      <group ref={minute} position={[0, 0, 0.012]}>
        <mesh position={[0, size * 0.36, 0]}>
          <planeGeometry args={[size * 0.05, size * 0.74]} />
          <meshBasicMaterial color="#1d1f2b" />
        </mesh>
      </group>
      <group ref={second} position={[0, 0, 0.014]}>
        <mesh position={[0, size * 0.38, 0]}>
          <planeGeometry args={[size * 0.018, size * 0.8]} />
          <meshBasicMaterial color="#c8463a" />
        </mesh>
      </group>
    </group>
  );
}
