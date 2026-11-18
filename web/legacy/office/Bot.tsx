import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OfficeSession, OfficeSub } from '../api';
import { hash } from '../theme';

const EYE = { subagent: '#A9B8F0', teammate: '#EF9A85', workflow: '#93CF9B' } as Record<string, string>;
const MAX_BOTS = 9;
const SEG = 16;

function Bot({
  b,
  i,
  n,
  sid,
  anchors,
  labelPos,
  selected,
  onSelect,
}: {
  b: OfficeSub;
  i: number;
  n: number;
  sid: string;
  anchors: Map<string, THREE.Vector3>;
  labelPos: Map<string, THREE.Vector3>;
  selected: boolean;
  onSelect: (sid: string, agentId: string) => void;
}) {
  const g = useRef<THREE.Group>(null!);
  const antenna = useRef<THREE.MeshBasicMaterial>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const done = b.status !== 'running' && b.status !== 'idle';
  const failed = b.status === 'failed';
  const eye = failed ? '#F27D6B' : EYE[b.kind] || EYE.subagent;
  const eyeCol = useMemo(() => new THREE.Color(eye).multiplyScalar(done ? 0.7 : 2.6), [eye, done]);
  const small = b.kind === 'workflow' ? 0.78 : 1;
  const phase = (hash(b.id) % 628) / 100;
  const leash = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(eye).multiplyScalar(done ? 0.6 : 1.8), transparent: true, opacity: done ? 0.25 : 0.65, toneMapped: false });
    return new THREE.Line(geo, mat);
  }, [eye, done]);
  useEffect(
    () => () => {
      leash.geometry.dispose();
      (leash.material as THREE.Material).dispose();
    },
    [leash],
  );
  useEffect(() => () => void labelPos.delete(`bot:${b.id}`), [labelPos, b.id]);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()), []);

  useFrame(({ clock }) => {
    const a = anchors.get(sid);
    if (!a) return;
    const t = clock.elapsedTime;
    const ang = (i / Math.max(1, n)) * Math.PI * 2 + t * 0.22 + phase * 0.2;
    const r = 0.95 + (i % 3) * 0.2;
    tmp.set(a.x + Math.cos(ang) * r, a.y + 0.75 + Math.sin(t * 1.5 + phase) * 0.12 + (i % 2) * 0.18, a.z + Math.sin(ang) * r * 0.8);
    if (g.current.position.lengthSq() === 0) g.current.position.copy(tmp);
    else g.current.position.lerp(tmp, 0.08);
    g.current.rotation.y = Math.atan2(a.x - g.current.position.x, a.z - g.current.position.z);
    g.current.rotation.z = Math.sin(t * 2 + phase) * 0.08;
    if (antenna.current) antenna.current.color.copy(eyeCol).multiplyScalar(done ? 1 : 0.7 + Math.max(0, Math.sin(t * 5 + phase)) * 0.6);
    // leash from the agent's shoulder to the bot, sagging a little
    curve.v0.set(a.x, a.y + 0.05, a.z);
    curve.v2.copy(g.current.position).add(tmp.set(0, -0.12 * small, 0));
    curve.v1.copy(curve.v0).lerp(curve.v2, 0.5).add(tmp.set(0, -0.25, 0));
    const pos = leash.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k <= SEG; k++) {
      curve.getPoint(k / SEG, tmp);
      pos.setXYZ(k, tmp.x, tmp.y, tmp.z);
    }
    pos.needsUpdate = true;
    let lp = labelPos.get(`bot:${b.id}`);
    if (!lp) {
      lp = new THREE.Vector3();
      labelPos.set(`bot:${b.id}`, lp);
    }
    lp.copy(g.current.position).add(tmp.set(0, 0.42 * small, 0));
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(sid, b.id);
  };

  return (
    <>
      <primitive object={leash} />
      <group ref={g} scale={small}>
        <group
          onClick={click}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
          }}
        >
          <RoundedBox args={[0.36, 0.3, 0.28]} radius={0.09} smoothness={3} castShadow>
            <meshStandardMaterial color={done ? '#8c8778' : '#efe9da'} roughness={0.35} />
          </RoundedBox>
          <mesh position={[0, 0.01, 0.141]}>
            <planeGeometry args={[0.25, 0.14]} />
            <meshBasicMaterial color="#0e1018" />
          </mesh>
          {[-1, 1].map((sd) => (
            <mesh key={sd} position={[sd * 0.055, 0.015, 0.145]}>
              <sphereGeometry args={[0.026, 10, 8]} />
              <meshBasicMaterial color={eyeCol} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 6]} />
            <meshStandardMaterial color="#9C93BF" />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <sphereGeometry args={[0.036, 10, 8]} />
            <meshBasicMaterial ref={antenna} color={eyeCol} toneMapped={false} />
          </mesh>
          {selected && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.32, 0.015, 8, 32]} />
              <meshBasicMaterial color={new THREE.Color('#E4DBFF').multiplyScalar(2)} toneMapped={false} />
            </mesh>
          )}
        </group>
      </group>
    </>
  );
}

export function botLabel(b: OfficeSub): string {
  const done = b.status !== 'running' && b.status !== 'idle';
  return b.now ? b.now.short : done ? (b.status === 'failed' ? 'failed' : 'done') : b.phase || (b.status === 'idle' ? 'standing by' : 'thinking');
}

// Which bots to draw for a session: running subagents first, then ones that
// finished in the last minute or so. Chips only when there are few of them.
export function botsFor(s: OfficeSession) {
  const list = s.subs.slice(0, MAX_BOTS);
  const runningShown = list.filter((b) => b.status === 'running').length;
  return { list, extra: Math.max(0, s.subsRunning - runningShown), chip: list.length <= 4 };
}

export function Bots({
  s,
  anchors,
  labelPos,
  selectedAgent,
  onSelect,
}: {
  s: OfficeSession;
  anchors: Map<string, THREE.Vector3>;
  labelPos: Map<string, THREE.Vector3>;
  selectedAgent: string | null;
  onSelect: (sid: string, agentId: string) => void;
}) {
  const { list } = botsFor(s);
  return (
    <>
      {list.map((b, i) => (
        <Bot key={b.id} b={b} i={i} n={list.length} sid={s.id} anchors={anchors} labelPos={labelPos} selected={selectedAgent === b.id} onSelect={onSelect} />
      ))}
    </>
  );
}
