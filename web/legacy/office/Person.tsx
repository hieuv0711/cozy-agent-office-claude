import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OfficeSession } from '../api';
import { fmtDur } from '../fmt';
import { hash, sessionColor } from '../theme';
import { DOOR, pathTo, type Station } from './layout';
import type { WorldInfo } from './world';

const SKIN = ['#F2D8BF', '#E8B994', '#C98E6B', '#8D5A3B', '#F5C9A9', '#D9A27E'];
const HAIR = ['#2B2140', '#5A3B2E', '#E9C46A', '#B5523B', '#1E1B2E', '#D9D2F2', '#7A4FB5'];
const PANTS = ['#2E2A4F', '#33305E', '#26304D', '#3A2E4A'];
const PHONES = ['#7fb8e8', '#ec8fb6', '#b8a4ef', '#93cf9b', '#f2b483'];

function lookFor(id: string, color: string) {
  const h = hash(id);
  return {
    shirt: color,
    skin: SKIN[h % SKIN.length],
    hair: HAIR[(h >>> 3) % HAIR.length],
    pants: PANTS[(h >>> 6) % PANTS.length],
    phones: PHONES[(h >>> 9) % PHONES.length],
  };
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function shortTarget(t: string) {
  if (!t) return '';
  if (/^[~./\w-]+\/[\w./-]+$/.test(t)) return t.split('/').pop() || t;
  return t.length > 34 ? t.slice(0, 33) + '…' : t;
}

// Live sessions run on the wall clock; a replayed one on its replay position.
export function clockOf(s: OfficeSession): number {
  return s.replay ? s.lastActivity : Date.now();
}

export function actionText(s: OfficeSession): string {
  if (s.status === 'needs-you') {
    const why = s.waitingFor ? s.waitingFor[0].toUpperCase() + s.waitingFor.slice(1) : 'Needs your input';
    return s.now ? `${why}: ${s.now.short}` : why;
  }
  if (s.status === 'working') {
    if (s.now) return `${s.now.short} ${shortTarget(s.now.target)}`.trim();
    if (s.subsRunning) return `${s.subsRunning} subagent${s.subsRunning > 1 ? 's' : ''} running`;
    return 'Thinking…';
  }
  return `Idle ${fmtDur(clockOf(s) - (s.statusSince || s.lastActivity))}`;
}

type Pose = 'type' | 'sit' | 'lounge' | 'walk' | 'wave' | 'stand' | 'cook';

interface Props {
  s: OfficeSession;
  station: Station;
  spawnAtDoor: boolean;
  departing: boolean;
  selected: boolean;
  dim: boolean;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  anchors: Map<string, THREE.Vector3>;
  labelPos: Map<string, THREE.Vector3>;
  world: WorldInfo;
}

function PersonImpl({ s, station, spawnAtDoor, departing, selected, dim, onSelect, onFocus, anchors, labelPos, world }: Props) {
  const color = sessionColor(s.id);
  const look = useMemo(() => lookFor(s.id, color), [s.id, color]);
  const root = useRef<THREE.Group>(null!);
  const spin = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const bang = useRef<THREE.Group>(null!);
  const think = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const st = useRef({
    pos: new THREE.Vector2(...(spawnAtDoor ? DOOR : station.pos)),
    path: [] as THREE.Vector2[],
    key: spawnAtDoor ? '' : station.key + station.pos.join(),
    facing: spawnAtDoor ? Math.PI / 2 : station.face,
    scale: spawnAtDoor ? 0.01 : 1,
    phase: (hash(s.id) % 1000) / 100,
    p: { by: 0, tilt: 0, aLx: 0, aRx: 0, aLz: 0.08, aRz: -0.08, lLx: 0, lRx: 0, hx: 0, hy: 0 },
  });

  useEffect(() => {
    const S = st.current;
    const key = station.key + station.pos.join();
    if (S.key === key) return;
    S.key = key;
    S.path = pathTo([S.pos.x, S.pos.y], station.pos).map(([x, z]) => new THREE.Vector2(x, z));
  }, [station]);

  useEffect(
    () => () => {
      anchors.delete(s.id);
      labelPos.delete(s.id);
    },
    [anchors, labelPos, s.id],
  );

  const working = s.status === 'working';
  const needs = s.status === 'needs-you';
  const thinking = working && !s.now && !s.subsRunning;

  useFrame((state, rawDt) => {
    const S = st.current;
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime + S.phase;
    let moving = false;
    let faceTo = station.face;
    if (S.path.length) {
      const next = S.path[0];
      const dx = next.x - S.pos.x;
      const dz = next.y - S.pos.y;
      const len = Math.hypot(dx, dz);
      const step = 2.7 * dt;
      if (len <= step) {
        S.pos.copy(next);
        S.path.shift();
      } else {
        S.pos.x += (dx / len) * step;
        S.pos.y += (dz / len) * step;
      }
      moving = true;
      if (len > 0.001) faceTo = Math.atan2(dx, dz);
    }
    S.facing = lerpAngle(S.facing, faceTo, 1 - Math.exp(-dt * 10));
    root.current.position.set(S.pos.x, 0, S.pos.y);
    spin.current.rotation.y = S.facing;
    const wantScale = departing && !S.path.length ? 0 : 1;
    S.scale += (wantScale - S.scale) * (1 - Math.exp(-dt * (wantScale ? 6 : 9)));
    root.current.scale.setScalar(Math.max(0.001, S.scale));

    // in places where work is done standing (the ramen bar's stoves) the work spot means standing
    const standWork = world.work === 'stand' && station.kind === 'desk';
    const pose: Pose = moving
      ? 'walk'
      : station.kind === 'desk'
        ? standWork
          ? working
            ? 'cook'
            : 'stand'
          : working
            ? 'type'
            : 'sit'
        : station.kind === 'lounge' && station.seated
          ? 'lounge'
          : needs && station.kind === 'front'
            ? 'wave'
            : 'stand';
    const T = { by: 0, tilt: 0, aLx: 0.05, aRx: 0.05, aLz: 0.1, aRz: -0.1, lLx: 0, lRx: 0, hx: 0, hy: 0 };
    switch (pose) {
      case 'type':
        T.by = 0.02 + Math.sin(t * 2) * 0.006;
        T.lLx = T.lRx = -1.5;
        T.aLx = -1.15 + Math.sin(t * 15) * 0.08;
        T.aRx = -1.15 + Math.sin(t * 15 + 1.9) * 0.08;
        T.aLz = 0.22;
        T.aRz = -0.22;
        T.hx = thinking ? -0.12 : 0.1 + Math.sin(t * 1.4) * 0.05;
        T.hy = thinking ? Math.sin(t * 0.7) * 0.25 : 0;
        break;
      case 'cook':
        // left hand steadies the pot, right hand stirs; eyes on the broth
        T.aLx = -0.95;
        T.aLz = 0.25;
        T.aRx = -1.05 + Math.sin(t * 6) * 0.22;
        T.aRz = -0.3 + Math.cos(t * 6) * 0.12;
        T.hx = thinking ? -0.1 : 0.32;
        T.hy = thinking ? Math.sin(t * 0.7) * 0.25 : Math.sin(t * 0.9) * 0.08;
        break;
      case 'sit':
        T.by = 0.02;
        T.lLx = T.lRx = -1.5;
        T.aLx = T.aRx = -0.5;
        T.hx = 0.05;
        T.hy = Math.sin(t * 0.4) * 0.2;
        break;
      case 'lounge':
        T.by = station.low ? -0.2 : -0.04;
        T.tilt = -0.3;
        T.lLx = T.lRx = station.low ? -1.25 : -1.45;
        T.aLx = T.aRx = -0.25;
        T.aLz = 0.5;
        T.aRz = -0.5;
        T.hx = -0.1 + Math.sin(t * 0.8) * 0.03;
        break;
      case 'walk': {
        const w = Math.sin(t * 9);
        T.by = Math.abs(Math.cos(t * 9)) * 0.045;
        T.lLx = w * 0.6;
        T.lRx = -w * 0.6;
        T.aLx = -w * 0.5;
        T.aRx = w * 0.5;
        break;
      }
      case 'wave':
        T.by = Math.max(0, Math.sin(t * 3.4)) * 0.06;
        T.aRz = 2.55 + Math.sin(t * 10) * 0.35;
        T.aLx = 0.1;
        T.hx = -0.08;
        break;
      default:
        T.aLx = Math.sin(t * 1.2) * 0.05;
        T.aRx = -Math.sin(t * 1.2) * 0.05;
    }
    const P = S.p;
    const k = 1 - Math.exp(-dt * 12);
    for (const key of Object.keys(P) as (keyof typeof P)[]) P[key] += (T[key] - P[key]) * k;
    body.current.position.y = P.by;
    body.current.rotation.x = P.tilt;
    armL.current.rotation.set(P.aLx, 0, P.aLz);
    armR.current.rotation.set(P.aRx, 0, P.aRz);
    legL.current.rotation.x = P.lLx;
    legR.current.rotation.x = P.lRx;
    head.current.rotation.set(P.hx, P.hy, 0);

    bang.current.visible = needs && !moving;
    if (bang.current.visible) {
      bang.current.position.y = 2.05 + Math.sin(t * 4) * 0.06;
      bang.current.rotation.y = t * 1.6;
    }
    think.current.visible = thinking && !moving;
    if (think.current.visible) {
      think.current.children.forEach((c, i) => {
        const ph = (t * 0.6 + i * 0.33) % 1;
        c.position.set(0.18 + i * 0.07, 1.8 + ph * 0.5, -0.05);
        c.scale.setScalar(0.5 + ph * (0.6 + i * 0.25));
      });
    }
    if (ring.current) {
      ring.current.visible = selected;
      const sc = 1 + Math.sin(t * 3) * 0.05;
      ring.current.scale.set(sc, sc, sc);
    }

    let a = anchors.get(s.id);
    if (!a) {
      a = new THREE.Vector3();
      anchors.set(s.id, a);
    }
    a.set(S.pos.x, station.seated && !moving && !standWork ? 1.05 : 1.2, S.pos.y);
    // label anchor: on the floor behind the chair at a desk (keeps screens visible), above the head elsewhere
    let lp = labelPos.get(s.id);
    if (!lp) {
      lp = new THREE.Vector3();
      labelPos.set(s.id, lp);
    }
    if (station.kind === 'desk' && !moving && !departing) lp.set(S.pos.x, 0.1, S.pos.y + 0.78);
    else lp.set(S.pos.x, 2.55 * Math.max(0.3, S.scale), S.pos.y);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(s.id);
  };
  const ringCol = useMemo(() => new THREE.Color('#f6f1e4').multiplyScalar(1.6), []);
  const cyan = useMemo(() => new THREE.Color('#FFD84A').multiplyScalar(2.2), []); // waiting-for-you yellow

  return (
    <group ref={root}>
      <group ref={spin}>
        <group
          ref={body}
          onClick={onClick}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onFocus(s.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
          }}
        >
          <group ref={legL} position={[-0.11, 0.55, 0]}>
            <mesh position={[0, -0.27, 0]} castShadow>
              <capsuleGeometry args={[0.085, 0.36, 4, 10]} />
              <meshStandardMaterial color={look.pants} roughness={0.85} transparent={dim} opacity={dim ? 0.35 : 1} />
            </mesh>
          </group>
          <group ref={legR} position={[0.11, 0.55, 0]}>
            <mesh position={[0, -0.27, 0]} castShadow>
              <capsuleGeometry args={[0.085, 0.36, 4, 10]} />
              <meshStandardMaterial color={look.pants} roughness={0.85} transparent={dim} opacity={dim ? 0.35 : 1} />
            </mesh>
          </group>
          <mesh position={[0, 0.88, 0]} castShadow>
            <capsuleGeometry args={[0.22, 0.32, 6, 14]} />
            <meshStandardMaterial color={look.shirt} roughness={0.6} transparent={dim} opacity={dim ? 0.35 : 1} />
          </mesh>
          <group ref={armL} position={[-0.29, 1.1, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.065, 0.3, 4, 10]} />
              <meshStandardMaterial color={look.shirt} roughness={0.6} transparent={dim} opacity={dim ? 0.35 : 1} />
            </mesh>
            <mesh position={[0, -0.4, 0]}>
              <sphereGeometry args={[0.065, 10, 8]} />
              <meshStandardMaterial color={look.skin} transparent={dim} opacity={dim ? 0.35 : 1} />
            </mesh>
          </group>
          <group ref={armR} position={[0.29, 1.1, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.065, 0.3, 4, 10]} />
              <meshStandardMaterial color={look.shirt} roughness={0.6} transparent={dim} opacity={dim ? 0.35 : 1} />
            </mesh>
            <mesh position={[0, -0.4, 0]}>
              <sphereGeometry args={[0.065, 10, 8]} />
              <meshStandardMaterial color={look.skin} transparent={dim} opacity={dim ? 0.35 : 1} />
            </mesh>
          </group>
          <group ref={head} position={[0, 1.42, 0]}>
            {world.hat === 'chef' && (
              <group position={[0, 0.2, 0]}>
                <mesh position={[0, 0.06, 0]} castShadow>
                  <cylinderGeometry args={[0.165, 0.17, 0.16, 18]} />
                  <meshStandardMaterial color="#f4efe6" roughness={0.8} />
                </mesh>
                <mesh position={[0, 0.2, 0]} scale={[1, 0.62, 1]} castShadow>
                  <sphereGeometry args={[0.22, 16, 12]} />
                  <meshStandardMaterial color="#f4efe6" roughness={0.8} />
                </mesh>
              </group>
            )}
            <mesh castShadow>
              <sphereGeometry args={[0.22, 22, 16]} />
              <meshStandardMaterial color={look.skin} roughness={0.7} transparent={dim} opacity={dim ? 0.35 : 1} />
            </mesh>
            <mesh position={[0, 0.03, 0]} scale={[1.05, 1, 1.05]}>
              <sphereGeometry args={[0.22, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
              <meshStandardMaterial color={look.hair} roughness={0.9} transparent={dim} opacity={dim ? 0.35 : 1} />
            </mesh>
            <mesh position={[0, -0.02, -0.06]} scale={[1, 0.92, 0.9]}>
              <sphereGeometry args={[0.215, 18, 12]} />
              <meshStandardMaterial color={look.hair} roughness={0.9} transparent={dim} opacity={dim ? 0.35 : 1} />
            </mesh>
            <mesh position={[-0.075, -0.01, 0.205]}>
              <sphereGeometry args={[0.026, 8, 6]} />
              <meshBasicMaterial color="#1A1630" />
            </mesh>
            <mesh position={[0.075, -0.01, 0.205]}>
              <sphereGeometry args={[0.026, 8, 6]} />
              <meshBasicMaterial color="#1A1630" />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <torusGeometry args={[0.248, 0.028, 8, 28, Math.PI]} />
              <meshStandardMaterial color={look.phones} emissive={look.phones} emissiveIntensity={0.45} />
            </mesh>
            {[-1, 1].map((sd) => (
              <mesh key={sd} position={[sd * 0.238, -0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.078, 0.078, 0.07, 16]} />
                <meshStandardMaterial color={look.phones} emissive={look.phones} emissiveIntensity={0.6} />
              </mesh>
            ))}
          </group>
        </group>
        <group ref={think} visible={false}>
          {[0, 1, 2].map((i) => (
            <mesh key={i}>
              <sphereGeometry args={[0.06, 10, 8]} />
              <meshBasicMaterial color={new THREE.Color('#E4DBFF').multiplyScalar(1.3)} toneMapped={false} transparent opacity={0.85} />
            </mesh>
          ))}
        </group>
      </group>
      <group ref={bang} visible={false}>
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[0.08, 0.26, 0.08]} />
          <meshBasicMaterial color={cyan} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.04, 0]}>
          <sphereGeometry args={[0.055, 12, 8]} />
          <meshBasicMaterial color={cyan} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.62, 48]} />
        <meshBasicMaterial color={ringCol} toneMapped={false} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

export const Person = memo(PersonImpl);
