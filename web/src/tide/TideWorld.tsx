import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, FXAA, SMAA, Vignette } from '@react-three/postprocessing';
import type { BloomEffect } from 'postprocessing';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OfficeSession } from '../api';
import { preloadAssets, sceneDrawn, setAssetTheme, TEST_HOOKS } from '../lib/assetCache';
import { createStore } from '../lib/store';
import { cameraCmd, shotFor } from '../office/camera';
import { CameraRig } from '../office/CameraRig';
import { worldUi } from '../office/world';
import { useTankEnvironment } from '../tank/water';
import { Crew, type Placement, useCrewPlacement } from './crew/Crew';
import { computeItemPlaces, itemPlacesUi } from './crew/itemPlaces';
import { drawWalkMap } from './crew/walkmap';
import { CustomizePanel, EditableItems } from './Editor';
import { editor, touchedRecently } from './editorState';
import { useItems } from './layoutStore';
import { TideLabels } from './Labels';
import { batchStatic } from './batch';
import { AdaptiveQuality, qualityUi } from './Quality';
import { catalogFor, THEMES } from './themes';
import { ThumbMaker } from './Thumbs';
import type { ThemeId } from './types';
import { SceneWeather } from './weather/SceneWeather';
import { U as weatherU } from './weather/runtime';

// The live scene: your Claude Code sessions as people at work in the theme's
// room (an office, a ramen kitchen, a toy workshop), with the weather outside.
// The room can be customised item by item.

interface Props {
  sessions: OfficeSession[];
  selected: string | null;
  selectedAgent: string | null;
  onSelect: (sid: string, agent: string | null) => void;
  tick: number;
  replay?: boolean;
  /** False while another tab is showing: the room stays as it is but stops drawing. */
  active?: boolean;
  onBackground: () => void;
}

/**
 * The room doesn't draw while it's hidden (another tab is open) or while a
 * theme's shaders compile (Warmup): the last picture stays on the canvas.
 */
const gate = createStore<{ hidden: boolean; warming: boolean }>({ hidden: false, warming: false });

function FrameGate() {
  const get = useThree((s) => s.get);
  const paused = gate.use((g) => g.hidden || g.warming);
  useEffect(() => {
    const st = get();
    // R3F starts its clock again at 0 on every frameloop change, but the room
    // counts on it (how long a step has run, when a break starts, a pose's
    // blend): its time stands still while paused and carries on from there
    const t = st.clock.elapsedTime;
    st.setFrameloop(paused ? 'never' : 'always');
    st.clock.elapsedTime = t;
    // a frame asked for just before (a change to the scene) would still be
    // drawn while paused, and timed by the page's clock in milliseconds: none
    if (paused) st.internal.frames = 0;
  }, [paused, get]);
  return null;
}

/** Width of the customise panel, plus its margin. */
const PANEL_W = 316;

// With the customise panel open on the left, shift the picture so its centre
// sits in the part you can still see (a view offset, so picking stays exact).
function ViewOffset({ left }: { left: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (!camera.isPerspectiveCamera) return;
    const narrow = size.width < 720;
    // the virtual view is wider by the panel, and the camera's aspect must match it
    if (left > 0 && !narrow) {
      camera.aspect = (size.width + left) / size.height;
      camera.setViewOffset(size.width + left, size.height, 0, 0, size.width, size.height);
    } else {
      camera.aspect = size.width / size.height;
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    return () => {
      camera.aspect = size.width / size.height;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
  }, [camera, size.width, size.height, left]);
  return null;
}

// Tells the episode title card when a newly chosen theme has really drawn.
function FirstFrames() {
  const frames = useRef(0);
  useFrame(() => {
    frames.current++;
    if (frames.current === 3) {
      performance.mark('ao:drawn');
      worldUi.set({ drawn: Date.now() });
      // now the pictures painted for this theme can be saved for next time
      sceneDrawn();
    }
  });
  return null;
}

function CameraTap({ cam }: { cam: React.MutableRefObject<THREE.Camera | null> }) {
  const camera = useThree((st) => st.camera);
  const scene = useThree((st) => st.scene);
  const gl = useThree((st) => st.gl);
  const controls = useThree((st) => st.controls);
  const clock = useThree((st) => st.clock);
  useEffect(() => {
    cam.current = camera;
    // in development (or with `?test`), the scene is reachable from the console and from test scripts
    if (TEST_HOOKS) (window as unknown as { __ao?: unknown }).__ao = { scene, camera, gl, controls, clock };
  }, [camera, cam, scene, gl, controls, clock]);
  return null;
}

/** Is the theme's saved scene (from an earlier visit) read back yet? The room waits for it. */
function useAssetsReady(theme: ThemeId) {
  const [ready, setReady] = useState<ThemeId | null>(null);
  useEffect(() => {
    let alive = true;
    setAssetTheme(theme);
    void preloadAssets(theme).then(() => {
      performance.mark(`ao:assets:${theme}`);
      if (alive) setReady(theme);
    });
    return () => {
      alive = false;
    };
  }, [theme]);
  return ready === theme;
}

// Once a room is in the scene, its shaders compile in parallel (the GPU driver
// works while the page stays responsive) before the first frame draws it;
// drawing straight away would compile them one by one and freeze the page.
function Warmup({ theme, ready }: { theme: ThemeId; ready: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    gate.set({ warming: true });
    const id = requestAnimationFrame(() => {
      gl.compileAsync(scene, camera)
        .catch(() => undefined)
        .finally(() => {
          performance.mark(`ao:compiled:${theme}`);
          if (alive) gate.set({ warming: false });
        });
    });
    return () => {
      alive = false;
      cancelAnimationFrame(id);
      gate.set({ warming: false });
    };
  }, [ready, theme, gl, scene, camera]);
  return null;
}

/**
 * Shadows within a budget: the shadow map is redrawn every other frame (people
 * move slowly; nobody sees the difference), and once a room is in, things too
 * small to cast a visible shadow (mugs, pens, hands) stop casting one.
 */
function ShadowBudget({ theme, ready }: { theme: ThemeId; ready: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      const v = new THREE.Vector3();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.castShadow) return;
        const g = m.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        m.getWorldScale(v);
        if ((g.boundingSphere?.radius ?? 0) * Math.max(v.x, v.y, v.z) < 0.14) m.castShadow = false;
      });
      gl.shadowMap.needsUpdate = true;
    }, 1500);
    return () => window.clearTimeout(id);
  }, [ready, theme, scene, gl]);
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 2 === 0) gl.shadowMap.needsUpdate = true;
  });
  return null;
}

/**
 * The things added to the room that people use (crew/itemPlaces.ts): worked out
 * from a top-down walk map of the room once it has settled, and again whenever
 * its things change (not while they're being moved about).
 */
function ItemPlaces({ theme }: { theme: ThemeId }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const items = useItems(theme);
  const editing = editor.use((e) => e.editing);
  const first = useRef(true);
  useEffect(() => {
    if (editing) return;
    const id = window.setTimeout(() => {
      const crew = THEMES[theme].crew;
      const t0 = performance.now();
      const map = drawWalkMap(gl, scene, crew.plan.room);
      const list = computeItemPlaces(crew, items, catalogFor(theme), map);
      performance.measure('ao:walkmap', { start: t0, end: performance.now() });
      itemPlacesUi.set({ theme, list });
      if (TEST_HOOKS) (window as unknown as { __walkmap?: unknown }).__walkmap = { map, list };
    }, first.current ? 1800 : 900);
    first.current = false;
    return () => window.clearTimeout(id);
  }, [theme, items, editing, gl, scene]);
  useEffect(() => () => itemPlacesUi.set({ theme: null, list: [] }), [theme]);
  return null;
}

// The room's shell catches only a little of the studio reflections, so it
// stays dim and warm around the people, who keep them all.
function RoomShell({ theme }: { theme: ThemeId }) {
  const g = useRef<THREE.Group>(null);
  useEffect(() => {
    g.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.3;
    });
  });
  // once the room has settled, what never moves is merged into a draw call per material (tide/batch.ts)
  useEffect(() => {
    if (DIAG.batch === false) return;
    let undo: (() => void) | null = null;
    let cancel: (() => void) | null = null;
    const start = window.setTimeout(() => {
      if (!g.current) return;
      cancel = batchStatic(g.current, 1200, (b) => {
        if (!b) return;
        undo = b.undo;
        if (TEST_HOOKS) (window as unknown as { __batch?: unknown }).__batch = { theme, before: b.before, after: b.after };
      });
    }, 2500);
    return () => {
      window.clearTimeout(start);
      cancel?.();
      undo?.();
    };
  }, [theme]);
  const { Room } = THEMES[theme];
  return (
    <group ref={g}>
      <Room />
    </group>
  );
}

function Scene({ theme, placed, selected, onSelect, anchors, labelPos }: { theme: ThemeId; placed: Placement[]; selected: string | null; onSelect: (sid: string, agent: string | null) => void; anchors: Map<string, THREE.Vector3>; labelPos: Map<string, THREE.Vector3> }) {
  useTankEnvironment(0.45);
  const editing = editor.use((e) => e.editing);
  const catalog = useMemo(() => [...catalogFor(theme).values()], [theme]);
  const def = THEMES[theme];
  const ready = useAssetsReady(theme);
  return (
    <>
      <color attach="background" args={[def.background]} />
      <AdaptiveQuality />
      <group userData={{ walkIgnore: true }}>
        <SceneWeather />
      </group>
      <ViewOffset left={editing ? PANEL_W : 0} />
      <Warmup theme={theme} ready={ready} />
      <ShadowBudget theme={theme} ready={ready} />
      {ready && <FirstFrames key={theme} />}
      {ready && <RoomShell key={`room-${theme}`} theme={theme} />}
      {ready && <EditableItems key={`items-${theme}`} theme={theme} />}
      {ready && <ItemPlaces key={`places-${theme}`} theme={theme} />}
      {ready && editing && <ThumbMaker catalog={catalog} />}
      {ready && (
        <Crew
          key={`crew-${theme}`}
          theme={def.crew}
          placed={placed}
          selected={selected}
          interactive={!editing}
          onSelect={(sid) => onSelect(sid, null)}
          onFocus={(sid) => {
            onSelect(sid, null);
            cameraCmd({ type: 'focus', sid });
          }}
          anchors={anchors}
          labelPos={labelPos}
        />
      )}
      <CameraRig anchors={anchors} selected={selected} />
      {DIAG.fx && (
        <EffectComposer multisampling={DIAG.msaa}>
          <WeatherBloom strength={DIAG.bloom ? 0.7 : 0} />
          <Vignette offset={0.3} darkness={0.55} />
          {DIAG.aa === 'smaa' ? <SMAA /> : DIAG.aa === 'fxaa' ? <FXAA /> : <></>}
        </EffectComposer>
      )}
    </>
  );
}

/**
 * Bloom, eased off in sunshine. It is there for lamps glowing in the night; in daylight it turned
 * the sunlit tops of the white bots and chef's hats into glowing blobs, worst from above.
 */
function WeatherBloom({ strength }: { strength: number }) {
  const ref = useRef<BloomEffect>(null);
  useFrame(() => {
    const b = ref.current;
    if (!b) return;
    const sun = weatherU.uSun.value; // 0..1, fading with the weather
    b.intensity = strength * (1 - 0.55 * sun);
    b.luminanceMaterial.threshold = 0.82 + 0.12 * sun;
  });
  return <Bloom ref={ref} mipmapBlur intensity={strength} luminanceThreshold={0.82} luminanceSmoothing={0.2} />;
}

/**
 * How the picture is finished: bloom and a vignette, and SMAA for the edges.
 * (4x multisampling looked the same here and cost about 40% of the frame.)
 * Diagnostic switches for measuring: `?fx=0` (no post-processing),
 * `?msaa=0|2|4`, `?aa=smaa|fxaa|none`, `?bloom=0`, `?batch=0` (no static batching).
 */
const DIAG = (() => {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  return { fx: q.get('fx') !== '0', msaa: q.has('msaa') ? Number(q.get('msaa')) : 0, bloom: q.get('bloom') !== '0', aa: q.get('aa') ?? 'smaa', batch: q.get('batch') !== '0' };
})();

export default function TideWorld(props: Props) {
  const { sessions, selected, selectedAgent, onSelect, tick, onBackground, active = true } = props;
  const theme = worldUi.use((w) => w.id);
  useEffect(() => {
    gate.set({ hidden: !active });
  }, [active]);
  const editing = editor.use((e) => e.editing);
  const anchors = useMemo(() => new Map<string, THREE.Vector3>(), []);
  const labelPos = useMemo(() => new Map<string, THREE.Vector3>(), []);
  const cam = useRef<THREE.Camera | null>(null);
  // one placement for the people and their labels
  const placed = useCrewPlacement(sessions, tick);
  const start = useMemo(() => shotFor('wide', worldUi.get().id), []);
  // the pixel ratio the adaptive quality settled on (a fixed prop would reset it on every re-render)
  const dpr = qualityUi.use((q) => q.dpr);
  return (
    <>
      <Canvas
        shadows="percentage"
        dpr={dpr}
        // the post-processing does the anti-aliasing: a multisampled canvas would only cost
        gl={{ antialias: !DIAG.fx, powerPreference: 'high-performance' }}
        camera={{ position: [start[0], start[1], start[2]], fov: 40, near: 0.1, far: 300 }}
        onCreated={({ gl }) => {
          // reading back every shader's compile log blocks on the GPU (a few hundred ms when a
          // room opens); the logs only matter while the shaders are being written
          gl.debug.checkShaderErrors = import.meta.env.DEV;
        }}
        onPointerMissed={() => {
          if (editor.get().editing) {
            if (!editor.get().placing && !touchedRecently()) editor.set({ selected: null });
          } else onBackground();
        }}
      >
        <CameraTap cam={cam} />
        <FrameGate />
        <Scene theme={theme} placed={placed} selected={selected} onSelect={onSelect} anchors={anchors} labelPos={labelPos} />
      </Canvas>
      {!editing && <TideLabels placed={placed} sessions={sessions} selected={selected} selectedAgent={selectedAgent} onSelect={onSelect} labelPos={labelPos} cam={cam} leftText={THEMES[theme].crew.leftText} />}
      <CustomizePanel theme={theme} />
    </>
  );
}
