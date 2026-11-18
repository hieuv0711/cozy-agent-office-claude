import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OfficeSession } from '../api';
import { sessionColor } from '../theme';
import { botLabel, Bots, botsFor } from './Bot';
import { cameraCmd, cameraUi } from './camera';
import { CameraRig } from './CameraRig';
import { Desk, type Screen, type ScreenTex } from './Desk';
import { DESKS, DOOR_STATION, deskStation, frontStation, loungeStation, type Station } from './layout';
import { actionText, clockOf, Person } from './Person';
import { Environment } from './Environment';
import { Room } from './Room';
import { WORLDS, worldUi, type WorldId } from './world';
import { CookStation } from './worlds/CookStation';
import { ParkScene } from './worlds/ParkScene';
import { PicnicTable } from './worlds/PicnicTable';
import { RamenRoom } from './worlds/RamenRoom';
import { alertTexture, codeTexture, sleepTexture, type Mood } from './textures';

// An idle agent stays at the desk for a bit, then wanders to the lounge.
const IDLE_TO_LOUNGE_MS = 45_000;
// After its process ends, an agent walks out of the door.
const LEAVE_MS = 7000;

interface Placed {
  s: OfficeSession;
  station: Station;
  desk: number;
  departing: boolean;
  spawnAtDoor: boolean;
}

function usePlacement(sessions: OfficeSession[], tick: number): Placed[] {
  const mem = useRef({
    desk: new Map<string, number>(),
    lounge: new Map<string, number>(),
    seen: new Map<string, { s: OfficeSession; desk: number }>(),
    gone: new Map<string, { s: OfficeSession; at: number; desk: number }>(),
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
    for (const [id, v] of m.seen) if (!ids.has(id) && !m.gone.has(id)) m.gone.set(id, { s: v.s, at: now, desk: v.desk });
    for (const [id, g] of m.gone) if (ids.has(id) || now - g.at > LEAVE_MS) m.gone.delete(id);
    for (const id of [...m.desk.keys()]) if (!ids.has(id) && !m.gone.has(id)) m.desk.delete(id);
    for (const s of sessions) {
      if (m.desk.has(s.id)) continue;
      const used = new Set(m.desk.values());
      let i = 0;
      while (used.has(i)) i++;
      m.desk.set(s.id, i);
    }
    const lounging = new Set(sessions.filter((s) => s.status === 'idle' && clockOf(s) - (s.statusSince || s.lastActivity || now) > IDLE_TO_LOUNGE_MS).map((s) => s.id));
    for (const id of [...m.lounge.keys()]) if (!lounging.has(id)) m.lounge.delete(id);
    for (const id of lounging) {
      if (m.lounge.has(id)) continue;
      const used = new Set(m.lounge.values());
      let i = 0;
      while (used.has(i)) i++;
      m.lounge.set(id, i);
    }
    const needs = sessions.filter((s) => s.status === 'needs-you').sort((a, b) => (a.statusSince || 0) - (b.statusSince || 0));
    const placed: Placed[] = sessions.map((s) => {
      const desk = m.desk.get(s.id) ?? 0;
      let station = deskStation(desk);
      if (s.status === 'needs-you') station = frontStation(needs.indexOf(s));
      else if (m.lounge.has(s.id)) station = loungeStation(m.lounge.get(s.id) ?? 0);
      return { s, station, desk, departing: false, spawnAtDoor: !m.initial.has(s.id) };
    });
    for (const [, g] of m.gone) placed.push({ s: g.s, station: DOOR_STATION, desk: g.desk, departing: true, spawnAtDoor: false });
    m.seen = new Map(sessions.map((s) => [s.id, { s, desk: m.desk.get(s.id) ?? 0 }]));
    return placed;
    // tick re-runs this once a second so idle agents move to the lounge on time
  }, [sessions, tick]);
}

const MOODS: Record<Mood, { sky: string; ground: string; hemi: number; amb: number; sun: string; sunI: number; fill: number }> = {
  dusk: { sky: '#8E6CFF', ground: '#2B1D3D', hemi: 0.75, amb: 0.35, sun: '#FF9E7A', sunI: 1.5, fill: 0.45 },
  night: { sky: '#4B4AA8', ground: '#140F24', hemi: 0.42, amb: 0.22, sun: '#8FA8FF', sunI: 0.6, fill: 0.3 },
  rain: { sky: '#5A6FB8', ground: '#141A2E', hemi: 0.5, amb: 0.25, sun: '#9FB6FF', sunI: 0.55, fill: 0.32 },
};

// The ramen bar: warm lanterns inside, cool street light through the window.
function RamenLights({ mood }: { mood: Mood }) {
  const dim = mood === 'dusk' ? 1 : 0.8;
  return (
    <>
      <hemisphereLight args={['#ffcf9e', '#2a1a12', 0.5 * dim]} />
      <ambientLight intensity={0.22} color="#ffd8b0" />
      <directionalLight castShadow position={[2.5, 9, -11]} intensity={mood === 'dusk' ? 0.9 : 0.5} color={mood === 'dusk' ? '#ffb08a' : '#9fb0ff'} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} shadow-normalBias={0.02}>
        <orthographicCamera attach="shadow-camera" args={[-12, 12, 10, -10, 0.5, 40]} />
      </directionalLight>
      <directionalLight position={[10, 12, 12]} intensity={0.35} color="#ffc89a" />
      {[-6.5, -2.8, 0.9].map((x) => (
        <pointLight key={x} position={[x, 2.7, -2.1]} color="#ffb066" intensity={6} distance={6.5} decay={2} />
      ))}
      <pointLight position={[6.4, 2.6, -3.4]} color="#ff9a5a" intensity={5} distance={6} decay={2} />
      <pointLight position={[6.5, 2.4, 3.6]} color="#ffc27a" intensity={4} distance={5} decay={2} />
      <pointLight position={[-7.9, 2.6, 3.5]} color="#ff7a5a" intensity={4} distance={5} decay={2} />
    </>
  );
}

// The park: a low autumn sun at dusk, the moon and lamp posts after dark.
function ParkLights({ mood }: { mood: Mood }) {
  const dusk = mood === 'dusk';
  return (
    <>
      <hemisphereLight args={dusk ? ['#ffc49a', '#2c3a26', 0.85] : mood === 'rain' ? ['#7a8ab0', '#1a2418', 0.5] : ['#5a6aa8', '#141c14', 0.45]} />
      <ambientLight intensity={dusk ? 0.25 : 0.18} color={dusk ? '#ffe2c8' : '#b8c4ff'} />
      <directionalLight
        castShadow
        position={dusk ? [-7, 6, -10] : [4, 12, -8]}
        intensity={dusk ? 1.7 : 0.55}
        color={dusk ? '#ff9a62' : '#a4b6ff'}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-12, 12, 10, -10, 0.5, 40]} />
      </directionalLight>
      <directionalLight position={[10, 12, 12]} intensity={dusk ? 0.4 : 0.22} color="#c8d4ff" />
    </>
  );
}

function Lights({ mood, world }: { mood: Mood; world: WorldId }) {
  if (world === 'ramen') return <RamenLights mood={mood} />;
  if (world === 'park') return <ParkLights mood={mood} />;
  const m = MOODS[mood];
  return (
    <>
      <hemisphereLight args={[m.sky, m.ground, m.hemi]} />
      <ambientLight intensity={m.amb} color="#C8C0E8" />
      <directionalLight castShadow position={[2.5, 9, -11]} intensity={m.sunI} color={m.sun} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} shadow-normalBias={0.02}>
        <orthographicCamera attach="shadow-camera" args={[-12, 12, 10, -10, 0.5, 40]} />
      </directionalLight>
      <directionalLight position={[10, 12, 12]} intensity={m.fill} color="#D0C8EC" />
      <pointLight position={[-4.5, 2.7, -5.2]} color="#FFC27A" intensity={6} distance={7} decay={2} />
      <pointLight position={[3.5, 2.7, -5.2]} color="#FFC9A0" intensity={5} distance={7} decay={2} />
      <pointLight position={[-8.2, 2.7, 1]} color="#FFC27A" intensity={5} distance={7} decay={2} />
      <pointLight position={[8.6, 1.6, -4.1]} color="#FFB36B" intensity={7} distance={6} decay={2} />
      <pointLight position={[6.5, 2.9, 5.2]} color="#FFE3A8" intensity={1.4} distance={5} decay={2} />
    </>
  );
}

const STATION = { office: Desk, ramen: CookStation, park: PicnicTable } as const;

// Tells the episode title card when a newly chosen place has really drawn.
function FirstFrames() {
  const frames = useRef(0);
  useFrame(() => {
    frames.current++;
    if (frames.current === 3) worldUi.set({ drawn: Date.now() });
  });
  return null;
}

function Scene({ sessions, selected, selectedAgent, onSelect, mood, replay, placed, anchors, labelPos, world }: SceneProps) {
  const Station = STATION[world];
  const info = WORLDS[world];
  const tex = useMemo<ScreenTex>(() => ({ code: codeTexture(), alert: alertTexture(), sleep: sleepTexture() }), []);
  useEffect(
    () => () => {
      tex.code.dispose();
      tex.alert.dispose();
      tex.sleep.dispose();
    },
    [tex],
  );
  const desks = useMemo(() => {
    const out: { screen: Screen; plate?: string }[] = DESKS.map(() => ({ screen: 'off' }));
    for (const p of placed) {
      if (p.departing || p.desk >= DESKS.length) continue;
      const st = p.s.status;
      out[p.desk] = { screen: st === 'working' ? 'work' : st === 'needs-you' ? 'need' : 'idle', plate: sessionColor(p.s.id) };
    }
    return out;
  }, [placed]);
  const needsYou = sessions.some((s) => s.status === 'needs-you');
  const pick = (sid: string, agent?: string) => onSelect(sid, agent || null);
  const focus = (sid: string) => {
    onSelect(sid, null);
    cameraCmd({ type: 'focus', sid });
  };
  return (
    <>
      <Lights mood={mood} world={world} />
      <Environment world={world} mood={mood} />
      <FirstFrames key={world} />
      {world === 'ramen' ? <RamenRoom mood={mood} needsYou={needsYou} /> : world === 'park' ? <ParkScene mood={mood} needsYou={needsYou} /> : <Room mood={mood} needsYou={needsYou} />}
      {DESKS.map((d, i) => (
        <Station key={`${world}-${i}`} i={i} x={d.x} z={d.z} screen={desks[i].screen} plate={desks[i].plate} tex={tex} />
      ))}
      {placed.map((p) => (
        <Person
          key={p.s.id}
          s={p.s}
          station={p.station}
          spawnAtDoor={p.spawnAtDoor && !replay}
          departing={p.departing}
          selected={selected === p.s.id}
          dim={false}
          onSelect={pick}
          onFocus={focus}
          anchors={anchors}
          labelPos={labelPos}
          world={info}
        />
      ))}
      {sessions.map((s) => (
        <Bots key={s.id} s={s} anchors={anchors} labelPos={labelPos} selectedAgent={selected === s.id ? selectedAgent : null} onSelect={pick} />
      ))}
      <CameraRig anchors={anchors} selected={selected} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.86} luminanceSmoothing={0.18} />
        <Vignette offset={0.28} darkness={0.55} />
      </EffectComposer>
    </>
  );
}

interface Props {
  sessions: OfficeSession[];
  selected: string | null;
  selectedAgent: string | null;
  onSelect: (sid: string, agent: string | null) => void;
  mood: Mood;
  tick: number;
  replay?: boolean;
}

interface SceneProps extends Props {
  world: WorldId;
  placed: Placed[];
  anchors: Map<string, THREE.Vector3>;
  labelPos: Map<string, THREE.Vector3>;
}

function CameraTap({ cam }: { cam: React.MutableRefObject<THREE.Camera | null> }) {
  const camera = useThree((st) => st.camera);
  useEffect(() => {
    cam.current = camera;
  }, [camera, cam]);
  return null;
}

// Name tags are plain DOM, placed every frame by projecting each character's
// label anchor through the camera. Overlaps are resolved in screen space: the
// lowest tag stays, any tag it would cover moves up just enough.
function LabelLayer({
  placed,
  sessions,
  selected,
  selectedAgent,
  onSelect,
  labelPos,
  cam,
}: {
  placed: Placed[];
  sessions: OfficeSession[];
  selected: string | null;
  selectedAgent: string | null;
  onSelect: (sid: string, agent: string | null) => void;
  labelPos: Map<string, THREE.Vector3>;
  cam: React.MutableRefObject<THREE.Camera | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stream = cameraUi.use((s) => s.stream);
  const els = useRef(new Map<string, HTMLElement>());
  const sizes = useRef(new Map<string, [number, number]>());
  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const v = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const camera = cam.current;
      const box = host.current;
      if (!camera || !box) return;
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (frame++ % 20 === 0) for (const [k, el] of els.current) sizes.current.set(k, [el.offsetWidth, el.offsetHeight]);
      const chips: { el: HTMLElement; left: number; top: number; w: number; h: number }[] = [];
      for (const [k, el] of els.current) {
        const p = labelPos.get(k);
        if (!p) {
          el.style.visibility = 'hidden';
          continue;
        }
        v.copy(p).project(camera);
        if (v.z > 1 || v.z < -1) {
          el.style.visibility = 'hidden';
          continue;
        }
        const [ew, eh] = sizes.current.get(k) || [el.offsetWidth, el.offsetHeight];
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        if (k.startsWith('bot:')) {
          el.style.transform = `translate3d(${Math.round(x - ew / 2)}px, ${Math.round(y - eh / 2)}px, 0)`;
          el.style.visibility = 'visible';
        } else chips.push({ el, left: x - ew / 2, top: y - eh / 2, w: ew, h: eh });
      }
      chips.sort((a, b) => b.top - a.top);
      const placedBoxes: { l: number; r: number; t: number; b: number }[] = [];
      for (const c of chips) {
        let top = c.top;
        for (let guard = 0; guard < 12; guard++) {
          const hit = placedBoxes.find((p) => c.left < p.r - 4 && c.left + c.w > p.l + 4 && top < p.b && top + c.h > p.t);
          if (!hit) break;
          top = hit.t - c.h - 4;
        }
        placedBoxes.push({ l: c.left, r: c.left + c.w, t: top, b: top + c.h });
        c.el.style.transform = `translate3d(${Math.round(c.left)}px, ${Math.round(top)}px, 0)`;
        c.el.style.visibility = 'visible';
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [labelPos, cam]);
  const ref = (key: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(key, el);
    else {
      els.current.delete(key);
      sizes.current.delete(key);
    }
  };
  return (
    <div className="labels" ref={host}>
      {placed.map((p) => {
        if (stream && p.s.status !== 'needs-you' && p.s.id !== selected) return null;
        const status = p.departing ? 'left' : p.s.status;
        return (
          <button
            key={p.s.id}
            ref={ref(p.s.id)}
            type="button"
            className={`chip ${status}${selected === p.s.id ? ' sel' : ''}`}
            style={{ ['--c' as string]: sessionColor(p.s.id), visibility: 'hidden' }}
            onClick={() => onSelect(p.s.id, null)}
            onDoubleClick={() => {
              onSelect(p.s.id, null);
              cameraCmd({ type: 'focus', sid: p.s.id });
            }}
            aria-label={`${p.s.name}: ${p.departing ? 'left the office' : actionText(p.s)}`}
          >
            <span className="chip-top">
              <span className={`dot ${status}`} aria-hidden="true" />
              {p.s.name}
              {p.s.subsRunning > 0 && <span className="chip-bots">+{p.s.subsRunning}</span>}
            </span>
            <span className="chip-sub">{p.departing ? 'Left the office' : actionText(p.s)}</span>
          </button>
        );
      })}
      {sessions.flatMap((s) => {
        if (stream) return [];
        const { list, extra, chip } = botsFor(s);
        return list
          .map((b, i) => {
            const last = i === list.length - 1 && extra > 0;
            const isSel = selected === s.id && selectedAgent === b.id;
            if (!chip && !last && !isSel) return null;
            const done = b.status !== 'running' && b.status !== 'idle';
            return (
              <button
                key={`bot:${b.id}`}
                ref={ref(`bot:${b.id}`)}
                type="button"
                className={`bot-chip ${done ? 'done' : ''} ${b.status === 'failed' ? 'failed' : ''}`}
                style={{ visibility: 'hidden' }}
                onClick={() => onSelect(s.id, b.id)}
                aria-label={`Subagent ${b.name || b.type}: ${botLabel(b)}`}
              >
                {last ? `+${extra} more` : botLabel(b)}
              </button>
            );
          })
          .filter(Boolean);
      })}
    </div>
  );
}

export default function Office(props: Props & { onBackground: () => void }) {
  const { onBackground, ...rest } = props;
  const placed = usePlacement(props.sessions, props.tick);
  const anchors = useMemo(() => new Map<string, THREE.Vector3>(), []);
  const labelPos = useMemo(() => new Map<string, THREE.Vector3>(), []);
  const cam = useRef<THREE.Camera | null>(null);
  const world = worldUi.use((w) => w.id);
  return (
    <>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [11.5, 12.5, 16.5], fov: 34, near: 0.5, far: 400 }}
        onPointerMissed={onBackground}
      >
        <CameraTap cam={cam} />
        <Scene {...rest} world={world} placed={placed} anchors={anchors} labelPos={labelPos} />
      </Canvas>
      <LabelLayer
        placed={placed}
        sessions={props.sessions}
        selected={props.selected}
        selectedAgent={props.selectedAgent}
        onSelect={props.onSelect}
        labelPos={labelPos}
        cam={cam}
      />
    </>
  );
}
