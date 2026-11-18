import { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import * as THREE from 'three';
import { loadJSON, saveJSON } from '../lib/store';
import { cameraUi, closeShot, distanceToZoom, MAX_DIST, MIN_DIST, onCameraCmd, shotFor, streamShotsFor, zoomToDistance, type Preset } from './camera';
import { worldUi } from './world';

type CC = ComponentRef<typeof CameraControls>;

const STREAM_SHOT_MS = 28_000;
// The last camera pose you left, per theme (each room has its own size and
// layout, and a pose saved in one would frame another badly; poses from the
// old aquarium are under other keys and are never read).
const poseKey = (theme: string) => `ao-crew-pose-v1:${theme}`;

/**
 * The camera stays in front of the room: the rooms are open on the camera's
 * side only, so it may swing about 35 degrees either way, look down from
 * above, and come in close, but never go round behind a wall.
 */
const AZIMUTH = 0.62;
const POLAR: [number, number] = [0.2, 1.5];
/** Where the camera may look at: inside the room. */
const LOOK_BOX = new THREE.Box3(new THREE.Vector3(-11.5, 0, -6.2), new THREE.Vector3(11.5, 6, 4.5));

type Pose6 = [number, number, number, number, number, number];

/** A saved pose that still makes sense for these limits (else null). */
function validPose(p: unknown): Pose6 | null {
  if (!Array.isArray(p) || p.length !== 6 || !p.every((n) => Number.isFinite(n))) return null;
  const [px, py, pz, tx, ty, tz] = p as Pose6;
  if (!LOOK_BOX.containsPoint(new THREE.Vector3(tx, ty, tz))) return null;
  const dx = px - tx;
  const dy = py - ty;
  const dz = pz - tz;
  const d = Math.hypot(dx, dy, dz);
  if (d < MIN_DIST * 0.9 || d > MAX_DIST) return null;
  const az = Math.atan2(dx, dz);
  const polar = Math.acos(Math.max(-1, Math.min(1, dy / d)));
  if (Math.abs(az) > AZIMUTH + 0.02 || polar < POLAR[0] - 0.02 || polar > POLAR[1] + 0.02) return null;
  return p as Pose6;
}

export function CameraRig({ anchors, selected }: { anchors: Map<string, THREE.Vector3>; selected: string | null }) {
  const ref = useRef<CC>(null);
  const selRef = useRef(selected);
  selRef.current = selected;
  const st = useRef({ lastZoomPush: 0, streamShot: 0, streamNext: 0, pausedUntil: 0, tmp: new THREE.Vector3(), tmp2: new THREE.Vector3() });
  // Tall, narrow windows (phones): pull every shot back so the whole place fits.
  const size = useThree((x) => x.size);
  const aspect = size.width / Math.max(1, size.height);
  const fitRef = useRef(1);
  fitRef.current = aspect < 1.6 ? Math.min(2.7, 1.6 / aspect) : 1;
  const portrait = fitRef.current > 1;

  const go = (shot: [number, number, number, number, number, number], smooth = true, slow = false) => {
    const c = ref.current;
    if (!c) return;
    c.smoothTime = slow ? 2.6 : 0.45;
    const k = fitRef.current;
    const [px, py, pz, tx, ty, tz] = shot;
    void c.setLookAt(tx + (px - tx) * k, ty + (py - ty) * k, tz + (pz - tz) * k, tx, ty, tz, smooth);
  };

  const preset = (p: Preset, smooth = true) => {
    if (p === 'desk') {
      const a = selRef.current ? anchors.get(selRef.current) : null;
      if (!a) return;
      go(closeShot(a), smooth);
    } else go(shotFor(p, worldUi.get().id), smooth);
    cameraUi.set({ preset: p });
  };

  /**
   * How you last left a theme: a shot you picked (Wide, Close...) or your own
   * angle. Each theme keeps its own, so a shot picked in one theme never
   * overrides the angle you left another at.
   */
  const memoryOf = (theme: string) => loadJSON<{ preset?: Preset | null; p?: number[] }>(poseKey(theme), {});
  /** Back to how you left this theme (else the shot last picked anywhere, else wide). */
  const restore = (theme: string, smooth: boolean) => {
    const c = ref.current;
    if (!c) return;
    const m = memoryOf(theme);
    const pose = validPose(m.p);
    const fallback = cameraUi.get().preset;
    if (m.preset && m.preset !== 'desk') {
      go(shotFor(m.preset, theme), smooth);
      cameraUi.set({ preset: m.preset });
    } else if (fitRef.current === 1 && pose) {
      // a pose saved on a wide screen would crop a phone, so phones use the fitted shots
      void c.setLookAt(...pose, smooth);
      cameraUi.set({ preset: null });
    } else if (fallback && fallback !== 'desk' && m.preset === undefined) {
      go(shotFor(fallback, theme), smooth);
    } else {
      go(shotFor('wide', theme), smooth);
      cameraUi.set({ preset: 'wide' });
    }
  };

  // first pose: the shot you chose, else the last pose you left, else the wide shot
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.setBoundary(LOOK_BOX);
    restore(worldUi.get().id, false);
    const onRest = () => {
      // remembered per theme: the shot you picked, or your own angle (not while streaming or following)
      const ui = cameraUi.get();
      if (ui.stream || ui.follow) return;
      const p = c.getPosition(st.current.tmp);
      const t = c.getTarget(st.current.tmp2);
      const pose = [p.x, p.y, p.z, t.x, t.y, t.z].map((n) => Math.round(n * 100) / 100);
      saveJSON(poseKey(worldUi.get().id), ui.preset && ui.preset !== 'desk' ? { preset: ui.preset, p: pose } : { preset: null, p: pose });
    };
    const onControl = () => {
      st.current.pausedUntil = performance.now() + 15_000;
      if (cameraUi.get().preset) cameraUi.set({ preset: null });
    };
    c.addEventListener('rest', onRest);
    c.addEventListener('controlstart', onControl);
    return () => {
      c.removeEventListener('rest', onRest);
      c.removeEventListener('controlstart', onControl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = cameraUi.get().preset;
    if (p && p !== 'desk') go(shotFor(p, worldUi.get().id), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portrait]);

  // a new place: move to its own framing of the current shot (or its wide shot)
  const place = worldUi.use((w) => w.id);
  const firstPlace = useRef(true);
  useEffect(() => {
    if (firstPlace.current) {
      firstPlace.current = false;
      return;
    }
    restore(place, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  useEffect(
    () =>
      onCameraCmd((cmd) => {
        const c = ref.current;
        if (!c) return;
        c.smoothTime = 0.45;
        if (cmd.type === 'preset') preset(cmd.preset);
        else if (cmd.type === 'zoomTo') void c.dollyTo(zoomToDistance(cmd.value), true);
        else if (cmd.type === 'zoomBy') {
          const d = c.getPosition(st.current.tmp).distanceTo(c.getTarget(st.current.tmp2));
          void c.dollyTo(zoomToDistance(distanceToZoom(d) + cmd.delta), true);
        } else if (cmd.type === 'focus') {
          const a = anchors.get(cmd.sid);
          if (a) {
            go(closeShot(a));
            cameraUi.set({ preset: 'desk' });
          }
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchors],
  );

  useFrame((_, dt) => {
    const c = ref.current;
    if (!c) return;
    const S = st.current;
    const ui = cameraUi.get();
    const now = performance.now();
    // Follow: keep the camera's offset, move the target with the agent.
    if (ui.follow && selRef.current) {
      const a = anchors.get(selRef.current);
      if (a) {
        c.smoothTime = 0.6;
        const t = c.getTarget(S.tmp, true);
        if (Math.abs(t.x - a.x) > 0.02 || Math.abs(t.z - a.z) > 0.02) void c.moveTo(a.x, t.y, a.z, true);
      }
    }
    // Stream: slow cinematic drift between viewpoints, paused while you steer.
    if (ui.stream && now > S.pausedUntil) {
      if (now > S.streamNext) {
        const shots = streamShotsFor(worldUi.get().id);
        S.streamShot = (S.streamShot + 1) % shots.length;
        S.streamNext = now + STREAM_SHOT_MS;
        go(shots[S.streamShot], true, true);
      } else {
        void c.rotate(dt * 0.012, 0, false);
      }
    }
    // Report the zoom level for the slider (~8 times a second).
    if (now - S.lastZoomPush > 120) {
      S.lastZoomPush = now;
      const d = c.getPosition(S.tmp).distanceTo(c.getTarget(S.tmp2));
      const z = Math.round(distanceToZoom(d) * 100) / 100;
      if (Math.abs(z - ui.zoom) > 0.005) cameraUi.set({ zoom: z });
    }
  });

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={MIN_DIST}
      maxDistance={MAX_DIST * (portrait ? 2.7 : 1)}
      minPolarAngle={POLAR[0]}
      maxPolarAngle={POLAR[1]}
      minAzimuthAngle={-AZIMUTH}
      maxAzimuthAngle={AZIMUTH}
      boundaryEnclosesCamera={false}
      smoothTime={0.45}
      draggingSmoothTime={0.12}
      dollySpeed={0.45}
      dollyToCursor
    />
  );
}
