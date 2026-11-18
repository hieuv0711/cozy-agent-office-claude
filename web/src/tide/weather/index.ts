// The weather: a global setting (clear, sunny, rain, snow) shown in every room.
export { isWeather, setWeather, useWeather, weatherLight, weatherUi, WEATHER_HINT, WEATHER_LABEL, WEATHER_ORDER } from './state';
export type { Weather } from './state';
export { tickWeather, U as weatherUniforms } from './runtime';
export { SceneWeather } from './SceneWeather';
export { WindowWeather } from './WindowWeather';
export type { WindowWeatherProps } from './WindowWeather';
export { Precipitation } from './Precipitation';
export type { PrecipitationProps } from './Precipitation';
export { SunShine } from './SunShine';
export type { SunShineProps, SunSurface, SunWindow } from './SunShine';
export { WeatherPicker } from './WeatherPicker';
export { viewColor, viewValue, weatherVertexColors, weatherView } from './views';
export type { ViewLook, ViewMaps } from './views';
