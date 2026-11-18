import { createStore, loadJSON, saveJSON } from '../lib/store';
import type { CrewPlan, Shot } from '../tide/crew/plan';
import { KITCHEN_PLAN } from '../tide/kitchen/plan';
import { OFFICE_PLAN } from '../tide/office/plan';
import { WORKSHOP_PLAN } from '../tide/workshop/plan';

export type Preset = 'wide' | 'cozy' | 'top' | 'window' | 'desk';

export const PRESETS: { id: Preset; label: string; key: string }[] = [
  { id: 'wide', label: 'Wide', key: '1' },
  { id: 'cozy', label: 'Close', key: '2' },
  { id: 'top', label: 'From above', key: '3' },
  { id: 'window', label: 'Side', key: '4' },
  { id: 'desk', label: 'Close-up', key: '5' },
];

export const MIN_DIST = 3.5;
export const MAX_DIST = 30;

export type { Shot };

// Each theme frames its own fixed shots (its plan's `shots`): [camera x, y, z,
// target x, y, z].
const PLANS: Record<string, CrewPlan> = { office: OFFICE_PLAN, kitchen: KITCHEN_PLAN, workshop: WORKSHOP_PLAN };
const planFor = (place?: string) => PLANS[place ?? 'office'] ?? OFFICE_PLAN;

export function shotFor(p: Exclude<Preset, 'desk'>, place?: string): Shot {
  return planFor(place).shots[p];
}

/** Close-up on one person, from the front and a little above (whichever way they face, the camera stays on the open side of the room). */
export function closeShot(a: { x: number; y: number; z: number }): Shot {
  return [a.x * 0.85 + 0.6, a.y + 1.9, a.z + 5.6, a.x, a.y + 0.45, a.z];
}

// Viewpoints the Stream mode drifts between.
export const streamShotsFor = (place?: string): Shot[] => planFor(place).stream;

interface CameraUi {
  follow: boolean;
  stream: boolean;
  zoom: number; // 0 = farthest, 1 = closest
  preset: Preset | null;
}

const saved = loadJSON<Partial<CameraUi>>('ao-camera-ui', {});
// `?stream` in the URL opens straight into Stream mode (handy as an OBS browser source).
const streamParam = typeof location !== 'undefined' && new URLSearchParams(location.search).has('stream');
// A close-up was of a creature selected then; after a reload nothing is selected, so it isn't restored.
// No preset saved (your own angle, saved per theme by the camera rig) stays that way.
export const cameraUi = createStore<CameraUi>({ follow: !!saved.follow, stream: streamParam, zoom: 0.35, preset: saved.preset === undefined ? 'wide' : saved.preset === 'desk' ? null : saved.preset });
cameraUi.subscribe(() => {
  const s = cameraUi.get();
  saveJSON('ao-camera-ui', { follow: s.follow, preset: s.preset });
});

export type CameraCmd =
  | { type: 'preset'; preset: Preset }
  | { type: 'zoomBy'; delta: number }
  | { type: 'zoomTo'; value: number }
  | { type: 'focus'; sid: string };

const listeners = new Set<(c: CameraCmd) => void>();
export function cameraCmd(c: CameraCmd) {
  listeners.forEach((l) => l(c));
}
export function onCameraCmd(fn: (c: CameraCmd) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Logarithmic so the slider feels even from far to close.
export function zoomToDistance(z: number) {
  return MAX_DIST * Math.pow(MIN_DIST / MAX_DIST, Math.min(1, Math.max(0, z)));
}
export function distanceToZoom(d: number) {
  return Math.min(1, Math.max(0, Math.log(d / MAX_DIST) / Math.log(MIN_DIST / MAX_DIST)));
}
