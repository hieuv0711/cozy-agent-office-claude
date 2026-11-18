import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OfficeSession, OfficeSub } from '../api';
import { botsFor } from '../lib/session';
import { hash } from '../theme';
import { Axolotl } from '../tank/Axolotl';
import { Jellyfish } from '../tank/Jellyfish';
import { Octopus } from '../tank/Octopus';
import { Puffer } from '../tank/Puffer';
import { sandHeight, ShellBed } from '../tank/reef';
import { School } from '../tank/School';
import { Seahorse } from '../tank/Seahorse';
import { Shrimp } from '../tank/Shrimp';
import { AskSign, Bubbles, SleepZs } from '../tank/signs';
import { smoothstep } from '../tank/util';
import { underwater } from '../tank/water';
import { SAND_Y, TANK } from './space';
import type { Placed } from './types';

// Every session is a sea creature for its whole life (the species comes from
// its id), with a home spot in the tank. What it does shows its state:
//   working:  at home, doing what the tool does: a bubble jet for a command,
//             stacking pebbles for an edit, turning over a shell for a read,
//             up by the surface for the web, small bubbles while it thinks;
//   waiting:  at the front glass, tapping, under a yellow light with a "?";
//   idle:     asleep at home (or in a free bed: a shell or a teacup);
//   helpers:  shrimp circling it; a running workflow brings a school of fish;
//   arriving: drops in from the surface; leaving: rises out and fades.

export type Species = 'octopus' | 'puffer' | 'axolotl' | 'seahorse' | 'jelly';
const SPECIES: Species[] = ['octopus', 'puffer', 'axolotl', 'seahorse', 'jelly'];
export const speciesOf = (id: string): Species => SPECIES[hash(id) % SPECIES.length];
export const SPECIES_NAME: Record<Species, string> = { octopus: 'Octopus', puffer: 'Pufferfish', axolotl: 'Axolotl', seahorse: 'Seahorse', jelly: 'Jellyfish' };

/** Heights above the sand (work, sleep, wait), the label and the click target. */
interface Spec {
  work: number;
  sleep: number;
  wait: number;
  label: number;
  hitR: number;
  hitY: number;
}
const SPEC: Record<Species, Spec> = {
  octopus: { work: 0, sleep: 0, wait: 0, label: 1.6, hitR: 0.8, hitY: 0.6 },
  axolotl: { work: 0.03, sleep: 0.03, wait: 0.03, label: 0.75, hitR: 0.7, hitY: 0.2 },
  puffer: { work: 1.7, sleep: 0.5, wait: 1.15, label: 0.75, hitR: 0.62, hitY: 0 },
  seahorse: { work: 0.85, sleep: 0.12, wait: 0.7, label: 1.55, hitR: 0.55, hitY: 0.75 },
  jelly: { work: 2.3, sleep: 1.1, wait: 1.35, label: 0.6, hitR: 0.6, hitY: 0.05 },
};

// Home spots (x, z) on the sand, then the front-glass spots for those waiting.
const HOMES: [number, number][] = [
  [-3.0, 0.55],
  [0.2, 0.05],
  [3.2, 0.6],
  [-1.5, -0.7],
  [1.8, -0.8],
  [-4.6, 0.9],
  [4.8, 0.3],
  [-0.5, 1.3],
  [2.3, 1.45],
  [5.2, -1.0],
  [-5.1, -1.0],
  [0.9, -1.5],
];
const FRONT_X = [1.4, -1.4, 3.8, -3.8, 0, 5.1, -5.1];
const FRONT_Z = 1.95;

/** Where a sleeper lies in each kind of bed, by species (relative to the bed, before its turn and scale). */
const BED_POSE: Record<string, Partial<Record<Species, { y: number; scale: number; pitch?: number; fwd?: number }>>> = {
  'shell-bed': {
    axolotl: { y: 0.07, scale: 1 },
    octopus: { y: 0.08, scale: 0.75 },
    puffer: { y: 0.36, scale: 0.85 },
    seahorse: { y: 0.1, scale: 0.8 },
  },
  teacup: {
    axolotl: { y: 0.72, scale: 0.72 * 1.1, pitch: -0.38, fwd: 0.41 },
    octopus: { y: 0.52, scale: 0.55 },
    puffer: { y: 0.76, scale: 0.68 },
    seahorse: { y: 0.27, scale: 0.6 },
  },
};

export interface Placement {
  s: OfficeSession;
  home: number;
  front: number;
  departing: boolean;
  arriving: boolean;
}

const LEAVE_MS = 4500;

/** Gives every session a home spot, keeps leavers around long enough to swim out. */
export function usePlacement(sessions: OfficeSession[], tick: number): Placement[] {
  const mem = useRef({
    home: new Map<string, number>(),
    seen: new Map<string, OfficeSession>(),
    gone: new Map<string, { s: OfficeSession; at: number }>(),
    initial: new Set<string>(),
    first: true,
  });
  return useMemo(() => {
    const m = mem.current;
    const now = Date.now();
    const ids = new Set(sessions.map((s) => s.id));
    if (m.first) {
      for (const s of sessions) m.initial.add(s.id);
      m.first = false;
    }
    for (const [id, s] of m.seen) if (!ids.has(id) && !m.gone.has(id)) m.gone.set(id, { s, at: now });
    for (const [id, g] of m.gone) if (ids.has(id) || now - g.at > LEAVE_MS) m.gone.delete(id);
    for (const id of [...m.home.keys()]) if (!ids.has(id) && !m.gone.has(id)) m.home.delete(id);
    for (const s of sessions) {
      if (m.home.has(s.id)) continue;
      const used = new Set(m.home.values());
      let i = 0;
      while (used.has(i)) i++;
      m.home.set(s.id, i);
    }
    const waiting = sessions.filter((s) => s.status === 'needs-you').sort((a, b) => (a.statusSince || 0) - (b.statusSince || 0));
    const out: Placement[] = sessions.map((s) => ({ s, home: m.home.get(s.id) ?? 0, front: Math.max(0, waiting.indexOf(s)), departing: false, arriving: !m.initial.has(s.id) }));
    for (const [, g] of m.gone) out.push({ s: g.s, home: m.home.get(g.s.id) ?? 0, front: 0, departing: true, arriving: false });
    m.seen = new Map(sessions.map((s) => [s.id, s]));
    return out;
    // tick re-runs this once a second so leavers are let go on time
  }, [sessions, tick]);
}

type Mode = 'work' | 'wait' | 'sleep' | 'leave';
type Act = 'none' | 'bubbles' | 'build' | 'shells' | 'surface' | 'think';

function actOf(s: OfficeSession): Act {
  const cat = s.now?.cat;
  if (cat === 'run') return 'bubbles';
  if (cat === 'edit') return 'build';
  if (cat === 'read') return 'shells';
  if (cat === 'web') return 'surface';
  return 'think';
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function homeOf(i: number): [number, number] {
  const [x, z] = HOMES[i % HOMES.length];
  // a second lap of spots, nudged so creatures don't stack
  const lap = Math.floor(i / HOMES.length);
  return lap ? [Math.max(-5.5, Math.min(5.5, x + 0.7 * lap)), Math.max(-2.1, Math.min(2.1, z - 0.5 * lap))] : [x, z];
}

let stoneMat: THREE.MeshStandardMaterial | null = null;
const stoneGeo = new THREE.SphereGeometry(1, 16, 12);

// Editing: a little pile of pebbles; one hops up and settles on top.
function PebblePile() {
  if (!stoneMat) stoneMat = underwater(new THREE.MeshStandardMaterial({ color: '#b9b2a2', roughness: 0.85 }), { caustics: 0.6 });
  const hop = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime % 2.4;
    const k = t < 1.1 ? Math.sin((t / 1.1) * Math.PI) : 0;
    hop.current?.position.set(0.02, 0.2 + k * 0.32, 0.01);
  });
  const stones: [number, number, number, number][] = [
    [-0.12, 0.05, 0.02, 0.09],
    [0.1, 0.05, -0.05, 0.085],
    [0.0, 0.05, 0.13, 0.08],
    [-0.04, 0.13, -0.02, 0.075],
    [0.08, 0.13, 0.06, 0.07],
  ];
  return (
    <group>
      {stones.map(([x, y, z, r], i) => (
        <mesh key={i} geometry={stoneGeo} material={stoneMat!} position={[x, y, z]} scale={[r * 1.2, r * 0.8, r]} rotation={[0, i, 0]} castShadow />
      ))}
      <mesh ref={hop} geometry={stoneGeo} material={stoneMat!} scale={[0.08, 0.06, 0.075]} castShadow />
    </group>
  );
}

// Reading: a shell on the sand, turned over and back like a page.
function ShellFlip() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime % 3.2;
    const k = smoothstep(0.4, 1.4, t) * (1 - smoothstep(2.0, 3.0, t));
    if (g.current) {
      g.current.rotation.z = k * Math.PI;
      g.current.position.y = Math.sin(k * Math.PI) * 0.18;
    }
  });
  return (
    <group ref={g}>
      <group scale={0.2}>
        <ShellBed position={[0, 0, 0]} />
      </group>
    </group>
  );
}

function Model({ sp, mode, act }: { sp: Species; mode: Mode; act: Act }) {
  const asleep = mode === 'sleep';
  if (sp === 'octopus') return <Octopus position={[0, 0, 0]} working={act === 'build'} asleep={asleep} />;
  if (sp === 'puffer') return <Puffer position={[0, 0, 0]} running={act === 'bubbles'} asleep={asleep} />;
  if (sp === 'axolotl') return <Axolotl position={[0, 0, 0]} asleep={asleep} />;
  if (sp === 'seahorse') return <Seahorse position={[0, 0, 0]} waiting={mode === 'wait'} asleep={asleep} signal={false} />;
  return <Jellyfish position={[0, 0, 0]} rising={false} asleep={asleep} glow={false} />;
}

interface ResidentProps {
  pl: Placement;
  bed: Placed | null;
  selected: boolean;
  interactive: boolean;
  onSelect: (sid: string) => void;
  onFocus: (sid: string) => void;
  anchors: Map<string, THREE.Vector3>;
  labelPos: Map<string, THREE.Vector3>;
}

const ringGeo = new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f6f1e4').multiplyScalar(1.6), transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });

const Resident = memo(function Resident({ pl, bed, selected, interactive, onSelect, onFocus, anchors, labelPos }: ResidentProps) {
  const s = pl.s;
  const sp = speciesOf(s.id);
  const spec = SPEC[sp];
  const mode: Mode = pl.departing ? 'leave' : s.status === 'needs-you' ? 'wait' : s.status === 'idle' ? 'sleep' : 'work';
  const act: Act = mode === 'work' ? actOf(s) : 'none';
  const pose = mode === 'sleep' && bed ? BED_POSE[bed.kind]?.[sp] : undefined;
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null);
  const homeYaw = ((hash(s.id) % 1000) / 1000 - 0.5) * 1.4;
  const st = useRef({ p: new THREE.Vector3(), prev: new THREE.Vector3(), t: new THREE.Vector3(), yaw: homeYaw, sc: pl.arriving ? 0.2 : 1, init: false });

  useEffect(
    () => () => {
      anchors.delete(s.id);
      labelPos.delete(s.id);
    },
    [anchors, labelPos, s.id],
  );

  useFrame(({ clock }, delta) => {
    const S = st.current;
    const dt = Math.min(0.1, delta);
    const time = clock.elapsedTime;
    let yawTo = homeYaw;
    let pitch = 0;
    let scaleTo = 1;
    if (pose && bed) {
      // in bed: at the bed's spot, turned with the bed (a teacup sleeper leans
      // forward so its chin rests on the rim)
      const fwd = (pose.fwd ?? 0) * bed.s;
      const yawIn = bed.r - 0.5;
      S.t.set(bed.p[0] + Math.sin(yawIn) * fwd, bed.p[1] + pose.y * bed.s, bed.p[2] + Math.cos(yawIn) * fwd);
      yawTo = yawIn;
      pitch = pose.pitch ?? 0;
      scaleTo = pose.scale * bed.s;
    } else {
      let x: number;
      let z: number;
      if (mode === 'wait') {
        x = FRONT_X[pl.front % FRONT_X.length];
        z = FRONT_Z;
        yawTo = sp === 'seahorse' ? -0.55 : 0;
      } else [x, z] = homeOf(pl.home);
      const sand = SAND_Y + sandHeight(x, z);
      let h = spec.work;
      if (mode === 'wait') h = spec.wait;
      else if (mode === 'sleep') h = spec.sleep;
      else if (act === 'surface') h = 4.0;
      else if (act === 'build' || act === 'shells') h = Math.min(spec.work, spec.sleep);
      S.t.set(x, sand + h, z);
      if (mode === 'leave') {
        S.t.y = TANK.yTop + 0.8;
        scaleTo = 0;
      }
    }
    if (!S.init) {
      S.p.copy(S.t);
      if (pl.arriving) S.p.y = TANK.yTop - 0.3;
      S.prev.copy(S.p);
      S.init = true;
    }
    S.prev.copy(S.p);
    S.p.lerp(S.t, 1 - Math.exp(-dt * (mode === 'leave' ? 0.9 : 1.5)));
    const dx = S.p.x - S.prev.x;
    const dz = S.p.z - S.prev.z;
    const speed = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
    // swim facing the way it goes, then settle into its own pose
    S.yaw = lerpAngle(S.yaw, speed > 0.35 ? Math.atan2(dx, dz) : yawTo, 1 - Math.exp(-dt * 3));
    S.sc += (scaleTo - S.sc) * (1 - Math.exp(-dt * (mode === 'leave' ? 1.2 : 2.5)));
    let tap = 0;
    if (mode === 'wait') {
      const ph = time % 1.8;
      tap = ph < 0.6 ? Math.max(0, Math.sin((ph / 0.6) * Math.PI * 2)) * 0.09 : 0;
    }
    root.current.position.set(S.p.x, S.p.y, S.p.z + tap);
    body.current.rotation.set(0, S.yaw, 0);
    body.current.children[0]?.rotation.set(pitch, 0, 0);
    body.current.scale.setScalar(Math.max(0.001, S.sc));
    let a = anchors.get(s.id);
    if (!a) {
      a = new THREE.Vector3();
      anchors.set(s.id, a);
    }
    a.set(S.p.x, S.p.y + spec.hitY * S.sc, S.p.z);
    let lp = labelPos.get(s.id);
    if (!lp) {
      lp = new THREE.Vector3();
      labelPos.set(s.id, lp);
    }
    lp.set(S.p.x, S.p.y + spec.label * Math.max(0.6, S.sc) + 0.15, S.p.z);
    if (ring.current) {
      ring.current.position.y = SAND_Y + sandHeight(S.p.x, S.p.z) + 0.03 - S.p.y;
      ring.current.scale.setScalar(spec.hitR * 1.15);
    }
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(s.id);
  };

  return (
    <group ref={root}>
      <group ref={body}>
        <group>
          <Model sp={sp} mode={mode} act={act} />
        </group>
        {act === 'bubbles' && sp !== 'puffer' && <Bubbles origin={[0, spec.hitY + 0.1, 0.45]} dir={[0, 0.35, 0.94]} count={18} speed={1.4} spread={0.07} size={0.045} rise={2.4} />}
        {(act === 'think' || act === 'surface') && <Bubbles origin={[0.05, spec.hitY + 0.25, 0.15]} dir={[0, 1, 0]} count={6} speed={0.55} spread={0.05} size={0.028} rise={1.8} />}
      </group>
      {act === 'build' && sp !== 'octopus' && (
        <group position={[0.75, -Math.min(spec.work, spec.sleep), 0.35]}>
          <PebblePile />
        </group>
      )}
      {act === 'shells' && (
        <group position={[0.7, -Math.min(spec.work, spec.sleep), 0.4]}>
          <ShellFlip />
        </group>
      )}
      {mode === 'wait' && <AskSign position={[0.62, spec.label - 0.1, 0.25]} size={0.4} />}
      {mode === 'sleep' && sp !== 'axolotl' && <SleepZs position={[0.25, spec.label * 0.7 * (pose ? pose.scale : 1), 0.2]} />}
      {selected && <mesh ref={ring} geometry={ringGeo} material={ringMat} renderOrder={5} />}
      {interactive && !pl.departing && (
        <mesh
          position={[0, spec.hitY, 0]}
          onClick={click}
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
          <sphereGeometry args={[spec.hitR, 12, 10]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </group>
  );
});

// A helper: a shrimp circling its creature, carrying its pearl (the result).
function Helper({ sid, b, i, n, anchors, labelPos }: { sid: string; b: OfficeSub; i: number; n: number; anchors: Map<string, THREE.Vector3>; labelPos: Map<string, THREE.Vector3> }) {
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const path = useMemo(
    () => (t: number, out: THREE.Vector3) => {
      const a = anchors.get(sid);
      if (!a) return out.set(0, -20, 0);
      const ang = t * 0.5 + (i / Math.max(1, n)) * Math.PI * 2;
      const r = 1.05 + (i % 3) * 0.22;
      out.set(a.x + Math.cos(ang) * r, a.y + 0.5 + Math.sin(t * 1.3 + i) * 0.12, a.z + Math.sin(ang) * r * 0.75);
      out.x = Math.max(-5.7, Math.min(5.7, out.x));
      out.z = Math.max(-2.3, Math.min(2.3, out.z));
      out.y = Math.min(TANK.yTop - 0.5, out.y);
      return out;
    },
    [anchors, sid, i, n],
  );
  const key = `bot:${b.id}`;
  useEffect(() => () => void labelPos.delete(key), [labelPos, key]);
  useFrame(({ clock }) => {
    path(clock.elapsedTime, tmp);
    let lp = labelPos.get(key);
    if (!lp) {
      lp = new THREE.Vector3();
      labelPos.set(key, lp);
    }
    lp.set(tmp.x, tmp.y + 0.32, tmp.z);
  });
  return <Shrimp path={path} />;
}

// Two yellow lights, always there (adding lights recompiles every material),
// shining on the first two creatures waiting for you, and off otherwise.
function WaitLights({ ids, anchors }: { ids: string[]; anchors: Map<string, THREE.Vector3> }) {
  const a = useRef<THREE.SpotLight>(null);
  const b = useRef<THREE.SpotLight>(null);
  const targets = useMemo(() => [new THREE.Object3D(), new THREE.Object3D()], []);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  useFrame(() => {
    [a, b].forEach((r, i) => {
      const l = r.current;
      if (!l) return;
      const id = idsRef.current[i];
      const p = id ? anchors.get(id) : undefined;
      if (!p) {
        l.intensity = 0;
        return;
      }
      l.intensity = 11;
      l.position.set(p.x, p.y + 3.0, p.z + 1.1);
      targets[i].position.copy(p);
      targets[i].updateMatrixWorld();
    });
  });
  return (
    <>
      {targets.map((t, i) => (
        <primitive key={i} object={t} />
      ))}
      <spotLight ref={a} target={targets[0]} angle={0.42} penumbra={0.85} color="#ffd84a" distance={6} decay={2} intensity={0} />
      <spotLight ref={b} target={targets[1]} angle={0.42} penumbra={0.85} color="#ffd84a" distance={6} decay={2} intensity={0} />
    </>
  );
}

export function Creatures({
  placed,
  items,
  selected,
  interactive,
  onSelect,
  onFocus,
  anchors,
  labelPos,
}: {
  placed: Placement[];
  items: Placed[];
  selected: string | null;
  interactive: boolean;
  onSelect: (sid: string) => void;
  onFocus: (sid: string) => void;
  anchors: Map<string, THREE.Vector3>;
  labelPos: Map<string, THREE.Vector3>;
}) {
  // Free beds go to the creatures that fell asleep first (jellyfish just drift).
  const bedOf = useMemo(() => {
    const beds = items.filter((it) => BED_POSE[it.kind]);
    const sleepers = placed.filter((p) => !p.departing && p.s.status === 'idle' && speciesOf(p.s.id) !== 'jelly').sort((x, y) => (x.s.statusSince || 0) - (y.s.statusSince || 0));
    const out = new Map<string, Placed>();
    sleepers.forEach((p, i) => {
      if (beds[i]) out.set(p.s.id, beds[i]);
    });
    return out;
  }, [placed, items]);
  const waitIds = placed
    .filter((p) => !p.departing && p.s.status === 'needs-you')
    .sort((x, y) => x.front - y.front)
    .map((p) => p.s.id);
  return (
    <>
      {placed.map((pl) => (
        <Resident key={pl.s.id} pl={pl} bed={bedOf.get(pl.s.id) ?? null} selected={selected === pl.s.id} interactive={interactive} onSelect={onSelect} onFocus={onFocus} anchors={anchors} labelPos={labelPos} />
      ))}
      {placed
        .filter((pl) => !pl.departing)
        .flatMap((pl) => {
          const { list } = botsFor(pl.s);
          return list.map((b, i) => <Helper key={b.id} sid={pl.s.id} b={b} i={i} n={list.length} anchors={anchors} labelPos={labelPos} />);
        })}
      {placed
        .filter((pl) => !pl.departing && pl.s.workflows.some((w) => w.running > 0))
        .map((pl) => (
          <TeamSchool key={`team:${pl.s.id}`} sid={pl.s.id} anchors={anchors} />
        ))}
      <WaitLights ids={waitIds} anchors={anchors} />
    </>
  );
}

// A workflow at work: a school of fish circling its creature.
function TeamSchool({ sid, anchors }: { sid: string; anchors: Map<string, THREE.Vector3> }) {
  const follow = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const a = anchors.get(sid);
    if (a) follow.set(a.x, Math.min(TANK.yTop - 0.9, a.y + 0.6), a.z);
  });
  return <School center={[0, 0, 0]} follow={follow} count={14} radius={[1.5, 0.3, 0.6]} speed={0.4} />;
}
