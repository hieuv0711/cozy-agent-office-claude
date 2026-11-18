import { createStore, saveJSON } from '../../lib/store';

// The weather outside every room: one global setting, saved between visits.
// `?weather=snow` in the URL overrides the saved choice (screenshots, previews)
// without overwriting it.

export type Weather = 'clear' | 'sunny' | 'rain' | 'snow';

export const WEATHER_ORDER: Weather[] = ['clear', 'sunny', 'rain', 'snow'];

/** Short labels for buttons. */
export const WEATHER_LABEL: Record<Weather, string> = { clear: 'Clear', sunny: 'Sunny', rain: 'Rain', snow: 'Snow' };

/** A sentence for tooltips. */
export const WEATHER_HINT: Record<Weather, string> = {
  clear: 'A clear night: stars and the moon outside',
  sunny: 'A bright, warm day: sunshine through the windows',
  rain: 'Rain outside and drops running down the glass',
  snow: 'Snow falling outside and a little frost on the glass',
};

const KEY = 'ao-weather';

export function isWeather(x: unknown): x is Weather {
  return typeof x === 'string' && (WEATHER_ORDER as string[]).includes(x);
}

/** A weather from older versions or a link: 'storm' is gone and becomes rain. */
function migrate(x: unknown): unknown {
  return x === 'storm' ? 'rain' : x;
}

function initial(): Weather {
  if (typeof location !== 'undefined') {
    const p = migrate(new URLSearchParams(location.search).get('weather'));
    if (isWeather(p)) return p;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v: unknown = JSON.parse(raw);
      const old = typeof v === 'string' ? v : (v as { weather?: unknown } | null)?.weather;
      const w = migrate(old);
      if (isWeather(w)) {
        // a saved storm is saved again as rain
        if (w !== old) saveJSON(KEY, { weather: w });
        return w;
      }
    }
  } catch {
    // storage blocked or corrupt: use the default
  }
  return 'rain';
}

export const weatherUi = createStore<{ weather: Weather }>({ weather: initial() });

let saved = weatherUi.get().weather;
weatherUi.subscribe(() => {
  const w = weatherUi.get().weather;
  if (w === saved) return;
  saved = w;
  saveJSON(KEY, { weather: w });
});

export function setWeather(w: Weather) {
  if (isWeather(w) && weatherUi.get().weather !== w) weatherUi.set({ weather: w });
}

/** The current weather, re-rendering when it changes. */
export function useWeather(): Weather {
  return weatherUi.use((s) => s.weather);
}

/**
 * Room light levels for a weather (ambient, hemisphere and a warm side fill).
 * Clear is the usual night; rain is a little darker; snow is a little
 * brighter and cooler (snow throws light back up); a sunny day is much
 * brighter and warm.
 */
export function weatherLight(w: Weather): { amb: number; hemi: number; fill: number } {
  switch (w) {
    case 'sunny':
      return { amb: 0.3, hemi: 0.42, fill: 0.5 };
    case 'rain':
      return { amb: 0.12, hemi: 0.17, fill: 0.07 };
    case 'snow':
      return { amb: 0.17, hemi: 0.27, fill: 0.08 };
    default:
      return { amb: 0.14, hemi: 0.2, fill: 0.12 };
  }
}
