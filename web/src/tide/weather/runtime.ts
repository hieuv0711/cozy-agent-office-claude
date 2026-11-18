import * as THREE from 'three';
import { setWeather, weatherUi, type Weather } from './state';

// The weather as it plays out over time: how much rain or snow is falling right
// now and how much sun there is (eased, so a change of weather rolls in over a
// few seconds), and how wet or frosted the glass is (that lags behind: drops
// dry slowly). Everything that draws weather reads the shared uniforms below,
// so one update per frame drives every window, view and particle in the scene.

/**
 * Shader time wraps every PERIOD seconds (float precision stays good all day).
 * Every animation that reads uTime loops a whole number of times per period,
 * so the wrap is seamless.
 */
export const PERIOD = 1200;

/** Uniforms shared by reference with every weather material. */
export const U = {
  /** Seconds, wrapping every PERIOD. */
  uTime: { value: 0 },
  /**
   * Where we are in the period, 0..1. Shaders animate with fract(uCycle * n + phase) for a
   * whole number n: that stays precise in 32-bit floats where uTime * n would not.
   */
  uCycle: { value: 0 },
  /** Falling rain, 0..1. */
  uRain: { value: 0 },
  /** Falling snow, 0..1. */
  uSnow: { value: 0 },
  /** Sunshine, 0..1 (a sunny day: daylight outside, sun coming in through the windows). */
  uSun: { value: 0 },
  /** Water on the glass, 0..1 (follows the rain, dries slowly). */
  uWet: { value: 0 },
  /** Frost and settled snow on the glass, 0..1 (creeps in slowly). */
  uFrost: { value: 0 },
  /** Weights of the clear (night), wet, snowy and sunny painted views; they sum to 1. */
  uView: { value: new THREE.Vector4(1, 0, 0, 0) },
};

type Amounts = { rain: number; snow: number; sun: number };

function targetOf(w: Weather): Amounts {
  return { rain: w === 'rain' ? 1 : 0, snow: w === 'snow' ? 1 : 0, sun: w === 'sunny' ? 1 : 0 };
}
/** The painted view for a weather, as weights of [clear, wet, snow, sunny]. */
function viewOf(w: Weather): [number, number, number, number] {
  return w === 'snow' ? [0, 0, 1, 0] : w === 'rain' ? [0, 1, 0, 0] : w === 'sunny' ? [0, 0, 0, 1] : [1, 0, 0, 0];
}

// Start where the saved weather already is: no fade-in on page load.
{
  const w = weatherUi.get().weather;
  const t = targetOf(w);
  U.uRain.value = t.rain;
  U.uSnow.value = t.snow;
  U.uSun.value = t.sun;
  U.uWet.value = t.rain;
  U.uFrost.value = t.snow;
  U.uView.value.set(...viewOf(w));
}

// ---------- the per-frame update ----------

let last = -1;
const hooks: (() => void)[] = [];
const ease = (v: number, to: number, dt: number, up: number, down: number) => v + (to - v) * (1 - Math.exp(-dt / (to > v ? up : down)));

/**
 * Advance the weather to `now` (ms). Safe to call from every useFrame: it only
 * does work once per frame. Returns the shared uniforms.
 */
export function tickWeather(now = performance.now()) {
  if (now - last < 1) return U;
  const dt = last < 0 ? 0 : Math.min(0.25, (now - last) / 1000);
  last = now;
  const w = weatherUi.get().weather;
  const t = targetOf(w);
  U.uRain.value = ease(U.uRain.value, t.rain, dt, 1.4, 1.6);
  U.uSnow.value = ease(U.uSnow.value, t.snow, dt, 1.6, 1.6);
  U.uSun.value = ease(U.uSun.value, t.sun, dt, 1.6, 1.4);
  // drops gather quickly and dry in a few seconds (they cover the whole view, so slow drying looks like nothing changed);
  // frost creeps in and melts away
  U.uWet.value = ease(U.uWet.value, t.rain, dt, 2.2, 2.0);
  U.uFrost.value = ease(U.uFrost.value, t.snow, dt, 4.0, 2.4);
  const [vc, vw, vs, vd] = viewOf(w);
  const v = U.uView.value;
  const k = 1 - Math.exp(-dt / 1.3);
  v.set(v.x + (vc - v.x) * k, v.y + (vw - v.y) * k, v.z + (vs - v.z) * k, v.w + (vd - v.w) * k);
  U.uTime.value = (now / 1000) % PERIOD;
  U.uCycle.value = U.uTime.value / PERIOD;
  for (const fn of hooks) fn();
  return U;
}

/** Run `fn` after every weather update (lazily built textures, for example). */
export function onWeatherTick(fn: () => void) {
  hooks.push(fn);
}

/** True when a painted view (0 clear, 1 wet, 2 snowy, 3 sunny) shows now or is on its way (for lazily built textures). */
export function viewWanted(i: 0 | 1 | 2 | 3): boolean {
  const v = U.uView.value;
  const w = weatherUi.get().weather;
  return v.getComponent(i) > 0.001 || viewOf(w)[i] > 0;
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  const dev = window as unknown as Record<string, unknown>;
  dev.__setWeather = (w: Weather) => setWeather(w);
  dev.__weatherU = U;
}
