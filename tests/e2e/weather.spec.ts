import { regionStats } from './support/png';
import { expect, expectNoErrors, test, THEMES } from './support/fixtures';
import { grade, openScene, pickTheme, pickWeather, sampleFlash, seedStorage, stagePixels, storage, weatherPick, weatherState } from './support/app';

// 3. Weather. WX-04 and WX-05 (clothes and reactions) are in weather-people.spec.ts.
//
// The weather is read from the scene: the rain and snow falling in front of the
// room (meshes drawn at renderOrder 6), the glass we look through (renderOrder
// 50, on the camera), the room's own windows (renderOrder 4), the sun's patches
// and beams on a sunny day, the shared weather uniforms on their materials, the
// room's sky light, and the colour grade over the picture (a CSS filter on the
// canvas).

const ALL = ['Clear', 'Sunny', 'Rain', 'Snow'];

type W = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The weather's own sky light (a hemisphere light it tints for the weather): intensity and colour. */
const skyLight = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const o = (window as W).__ao.scene.getObjectByName('weather-sky');
    return o ? { intensity: o.intensity as number, r: o.color.r as number, g: o.color.g as number, b: o.color.b as number } : null;
  });

/** How much of each painted view the windows show: [clear night, wet, snowy, sunny], from a view material. */
const viewWeights = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    let v: number[] | null = null;
    (window as W).__ao.scene.traverse((o: W) => {
      const m = o.material;
      if (!v && m && m.customProgramCacheKey && m.customProgramCacheKey() === 'weather-view-maps') {
        const u = (window as W).__ao.gl.properties.get(m)?.uniforms?.uView?.value;
        if (u) v = [u.x, u.y, u.z, u.w];
      }
    });
    return v as number[] | null;
  });

test('WX-01 switch the weather', async ({ page, errors }) => {
  await openScene(page);
  // the top bar's Weather choice: these four, and no Storm any more
  await expect(weatherPick(page).locator('option')).toHaveText(ALL);
  for (const w of ALL) {
    const v = w.toLowerCase() as 'clear' | 'sunny' | 'rain' | 'snow';
    await pickWeather(page, v);
    await expect(weatherPick(page)).toHaveValue(v);
    await expect(page.locator('.stage')).toHaveAttribute('data-weather', v);
  }
  // reload: still the last one picked
  expect(await storage(page, 'ao-weather')).toEqual({ weather: 'snow' });
  await openScene(page);
  await expect(weatherPick(page)).toHaveValue('snow');
  await expect(page.locator('.stage')).toHaveAttribute('data-weather', 'snow');
  // another theme: the same weather
  await pickTheme(page, 'kitchen');
  await expect(weatherPick(page)).toHaveValue('snow');
  await expect(page.locator('.stage')).toHaveAttribute('data-weather', 'snow');
  await expect.poll(async () => (await weatherState(page)).snow?.visible).toBe(true);
  expectNoErrors(errors);
});

test('WX-01 a storm saved by an older version, or asked for in the address, becomes rain', async ({ page, errors }) => {
  await seedStorage(page, { 'ao-weather': { weather: 'storm' } });
  await openScene(page);
  await expect(weatherPick(page)).toHaveValue('rain');
  await expect(page.locator('.stage')).toHaveAttribute('data-weather', 'rain');
  expect(await storage(page, 'ao-weather'), 'saved again as rain').toEqual({ weather: 'rain' });
  await openScene(page, '?demo&test&weather=storm');
  await expect(page.locator('.stage')).toHaveAttribute('data-weather', 'rain');
  await expect(weatherPick(page)).toHaveValue('rain');
  expectNoErrors(errors);
});

test('WX-02 the whole picture changes', async ({ page, errors }) => {
  await openScene(page, '?demo&test&weather=clear');
  await page.waitForTimeout(3000);
  const centre = { x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.7 };
  const clear = { grade: await grade(page), w: await weatherState(page), mid: regionStats(await stagePixels(page), centre) };
  expect(clear.w.rain?.visible, 'clear: no rain').toBe(false);
  expect(clear.w.snow?.visible, 'clear: no snow').toBe(false);
  expect(clear.w.glass?.visible, 'clear: nothing on the glass').toBe(false);
  expect(clear.w.sun.shown, 'clear: a night, no sun').toBe(false);

  // a sunny day: the sun comes in, the room brighter and warmer, nothing falling, the glass dry
  await pickWeather(page, 'sunny');
  await page.waitForTimeout(4500);
  const sunny = { grade: await grade(page), w: await weatherState(page), mid: regionStats(await stagePixels(page), centre) };
  expect(sunny.w.sun.shown, 'the sun comes in').toBe(true);
  expect(sunny.w.sun.level).toBeGreaterThan(0.9);
  expect(sunny.w.sun.patches, 'patches of sun on the floor and tops').toBeGreaterThan(0);
  expect(sunny.w.sun.beams, 'beams from the windows').toBeGreaterThan(0);
  expect(sunny.w.rain?.visible || sunny.w.snow?.visible, 'nothing falling').toBe(false);
  expect(sunny.w.glass?.visible, 'the glass is dry').toBe(false);
  expect(sunny.grade.brightness, `sunny is brighter (${sunny.grade.raw})`).toBeGreaterThan(clear.grade.brightness);
  expect(sunny.grade.hue, 'sunny is warmer').toBeGreaterThan(0);
  expect(sunny.mid.mean, 'the room is lit up').toBeGreaterThan(clear.mid.mean * 1.1);

  // rain: across the whole view, drops down the edges of the glass, cooler and dimmer
  await pickWeather(page, 'rain');
  await page.waitForTimeout(4500);
  const rain = { grade: await grade(page), w: await weatherState(page), mid: regionStats(await stagePixels(page), centre) };
  expect(rain.w.rain?.visible, 'rain falls in front of the room').toBe(true);
  expect(rain.w.rain!.show).toBeGreaterThan(0.45);
  expect(rain.w.glass?.visible, 'drops on the glass we look through').toBe(true);
  expect(rain.w.glass!.wet).toBeGreaterThan(0.8);
  expect(rain.w.sun.level, 'the sun has gone in').toBeLessThan(0.1);
  expect(rain.grade.brightness, `rain is dimmer (${rain.grade.raw})`).toBeLessThan(clear.grade.brightness);
  expect(rain.grade.hue, 'rain is cooler').toBeLessThan(0);

  // snow: drifting across the view, frost in the corners and snow on the sills, brighter and cooler
  await pickWeather(page, 'snow');
  await page.waitForTimeout(7000);
  const snow = { grade: await grade(page), w: await weatherState(page), mid: regionStats(await stagePixels(page), centre) };
  expect(snow.w.snow?.visible, 'snow drifts in front of the room').toBe(true);
  expect(snow.w.snow!.show).toBeGreaterThan(0.9);
  expect(snow.w.rain?.show ?? 0, 'the rain has faded').toBeLessThan(0.05);
  expect(snow.w.glass!.frost, 'frost on the glass').toBeGreaterThan(0.6);
  const windows = await page.evaluate(() => {
    let n = 0;
    (window as W).__ao.scene.traverse((o: W) => {
      if (o.renderOrder === 4 && o.visible && o.material?.uniforms?.uFrost) n++;
    });
    return n;
  });
  expect(windows, "the room's windows show the snow (on their sills and bars)").toBeGreaterThan(0);
  expect(snow.grade.brightness, `snow is brighter (${snow.grade.raw})`).toBeGreaterThan(clear.grade.brightness);
  expect(snow.grade.hue, 'snow light is cooler').toBeLessThan(0);

  // the middle of the view stays clear enough to see everyone
  expect(rain.w.glass!.clear[0], 'the glass keeps its middle clear').toBeGreaterThan(0.3);
  test.info().annotations.push({ type: 'centre contrast', description: `clear ${clear.mid.std.toFixed(1)}, sunny ${sunny.mid.std.toFixed(1)}, rain ${rain.mid.std.toFixed(1)}, snow ${snow.mid.std.toFixed(1)}` });
  expect(sunny.mid.std, 'sunny: the middle keeps its detail').toBeGreaterThan(clear.mid.std * 0.6);
  expect(rain.mid.std, 'rain: the middle keeps its detail').toBeGreaterThan(clear.mid.std * 0.6);
  expect(snow.mid.std, 'snow: the middle keeps its detail').toBeGreaterThan(clear.mid.std * 0.6);
  await expect(page.locator('.labels .chip')).toHaveCount(7);
  expectNoErrors(errors);
});

test('WX-03 a sunny day', async ({ page, errors }) => {
  test.setTimeout(150_000);
  await openScene(page, '?demo&test&weather=sunny');
  for (const theme of THEMES) {
    if (theme !== 'office') await pickTheme(page, theme);
    await page.waitForTimeout(2000);
    // the windows show the day (the sunny paintings), the sun comes in, the room's light is warm daylight
    await expect.poll(async () => (await viewWeights(page))?.[3] ?? 0, { message: `${theme}: the windows show a sunny day` }).toBeGreaterThan(0.95);
    const w = await weatherState(page);
    expect(w.sun.shown, `${theme}: the sun comes in`).toBe(true);
    expect(w.sun.patches, `${theme}: sun on the floor and furniture`).toBeGreaterThan(1);
    expect(w.sun.beams, `${theme}: a beam from each window`).toBeGreaterThan(1);
    const sky = await skyLight(page);
    expect(sky, `${theme}: the weather's sky light`).not.toBeNull();
    expect(sky!.intensity, `${theme}: daylight lifts the room`).toBeGreaterThan(1.5);
    expect(sky!.r, `${theme}: a warm light`).toBeGreaterThan(sky!.b);
  }
  // the light holds steady (nothing flashes in any weather now)
  const steady = await sampleFlash(page, 4000);
  expect(steady.frames).toBeGreaterThan(30);
  expect(steady.rise, 'the light holds steady').toBeLessThan(0.02);
  // and back to a clear night: the sun goes in within a few seconds, and soon stops being drawn at all
  await pickWeather(page, 'clear');
  const t0 = Date.now();
  await expect.poll(async () => (await weatherState(page)).sun.level, { message: 'the sun goes in', timeout: 6000, intervals: [200] }).toBeLessThan(0.05);
  test.info().annotations.push({ type: 'sun goes in', description: `${Date.now() - t0} ms` });
  await expect.poll(async () => (await weatherState(page)).sun.shown, { message: 'the sun is no longer drawn', timeout: 10_000 }).toBe(false);
  await expect.poll(async () => (await viewWeights(page))?.[0] ?? 0, { message: 'the night is back in the windows' }).toBeGreaterThan(0.95);
  expectNoErrors(errors);
});

test('WX-06 back to clear', async ({ page, errors }) => {
  await openScene(page, '?demo&test&weather=rain');
  await page.waitForTimeout(1500);
  const full = await weatherState(page);
  expect(full.rain?.visible).toBe(true);
  expect(full.glass?.wet).toBeGreaterThan(0.9);
  const startShow = full.rain!.show;
  await pickWeather(page, 'clear');
  const t0 = await page.evaluate(() => performance.now());
  // sample the falling rain and the wet glass for 14 s from the click
  const samples: { t: number; show: number; wet: number; falling: boolean; glass: boolean }[] = [];
  for (;;) {
    const [t, w] = await Promise.all([page.evaluate((t0) => performance.now() - t0, t0), weatherState(page)]);
    samples.push({ t, show: w.rain?.show ?? 0, wet: w.glass?.wet ?? 0, falling: !!w.rain?.visible || !!w.snow?.visible, glass: !!w.glass?.visible });
    if (t > 14_000) break;
    await page.waitForTimeout(80);
  }
  const at = (ms: number) => samples.find((s) => s.t >= ms)!;
  // the rain stops within about 3 s
  expect(at(3000).show / startShow, 'falling rain left after 3 s (of full)').toBeLessThan(0.2);
  // the glass dries within about 8 s
  expect(at(8000).wet, 'water left on the glass after 8 s').toBeLessThan(0.05);
  // nothing left falling, nothing on the glass
  const end = samples.at(-1)!;
  expect(end.falling, 'nothing falling').toBe(false);
  expect(end.glass, 'the glass is clear').toBe(false);
  await expect(weatherPick(page)).toHaveValue('clear');
  expectNoErrors(errors);
});
