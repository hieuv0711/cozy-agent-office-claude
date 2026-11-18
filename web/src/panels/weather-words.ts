import type { Weather } from '../tide/weather/state';

// The weather in words, for the top bar's Weather choice and its tooltip (kept
// out of the scene's code, so changing the words never rebuilds the rooms).

/** What each weather is called in the Weather choice (short: the top bar is full; the tooltip says more). */
export const WEATHER_PICK: Record<Weather, string> = {
  clear: 'Clear',
  sunny: 'Sunny',
  rain: 'Rain',
  snow: 'Snow',
};

/** What each weather looks like, and what it does to the people. */
export const WEATHER_TIP: Record<Weather, string> = {
  clear: 'A clear night: stars and the moon outside. Everyone in their usual clothes.',
  sunny: 'A bright, warm day: sunshine through the windows, and iced drinks on breaks.',
  rain: 'Rain outside and drops running down the glass. Rain jackets on, and umbrellas at the door.',
  snow: 'Snow falling outside and frost on the glass. Scarves, beanies and hot drinks.',
};
