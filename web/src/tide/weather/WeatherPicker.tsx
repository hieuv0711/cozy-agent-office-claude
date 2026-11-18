import { setWeather, useWeather, WEATHER_HINT, WEATHER_LABEL, WEATHER_ORDER } from './state';

/** The weather switch for the top bar: a segmented control like the mood one. */
export function WeatherPicker() {
  const weather = useWeather();
  return (
    <div className="seg" role="group" aria-label="Weather">
      {WEATHER_ORDER.map((w) => (
        <button key={w} type="button" aria-pressed={weather === w} title={WEATHER_HINT[w]} onClick={() => setWeather(w)}>
          {WEATHER_LABEL[w]}
        </button>
      ))}
    </div>
  );
}
