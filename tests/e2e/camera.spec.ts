import type { Page } from '@playwright/test';
import { expect, expectNoErrors, test } from './support/fixtures';
import { camBtn, camState, chip, crew, hitAt, logCrew, openScene, pickTheme, storage, toScreen } from './support/app';
import { MockOffice, session } from './support/mock';

// 4. Camera. Its pose is read from window.__ao.camera and the camera
// controls (window.__ao.controls); drags and the wheel are real mouse input.

type V3 = [number, number, number];
const OFFICE = {
  wide: [0, 5.4, 15.6, 0, 2.05, -2.6],
  cozy: [0, 4.1, 12.2, 0, 1.9, -2.0],
  top: [0, 17.5, 7.4, 0, 0.3, -2.6],
  window: [-9.3, 5.2, 4.2, -10.5, 2.0, -4.3],
} as const;
const KITCHEN_WIDE_TARGET_Z = -2.0;
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** How far the shots are pulled back for this stage's shape (tall windows). */
async function fitOf(page: Page) {
  const r = await page.locator('.stage canvas').boundingBox();
  const aspect = r!.width / r!.height;
  return aspect < 1.6 ? Math.min(2.7, 1.6 / aspect) : 1;
}

async function expectShot(page: Page, shot: readonly number[], what: string) {
  const k = await fitOf(page);
  const t: V3 = [shot[3], shot[4], shot[5]];
  const p: V3 = [t[0] + (shot[0] - t[0]) * k, t[1] + (shot[1] - t[1]) * k, t[2] + (shot[2] - t[2]) * k];
  await expect
    .poll(
      async () => {
        const s = await camState(page);
        return dist(s.pos, p) < 0.3 && dist(s.target, t) < 0.2 ? 'ok' : `camera ${s.pos} → ${s.target}`;
      },
      { message: `${what}: camera at ${p} looking at ${t}` },
    )
    .toBe('ok');
}

/** A point on the canvas itself (not under a name tag), to drag from. */
async function canvasPoint(page: Page) {
  const box = (await page.locator('.stage canvas').boundingBox())!;
  for (const [fx, fy] of [[0.5, 0.82], [0.3, 0.85], [0.7, 0.85], [0.5, 0.6], [0.2, 0.5]]) {
    const x = box.x + box.width * fx;
    const y = box.y + box.height * fy;
    if ((await hitAt(page, x, y)).startsWith('canvas')) return { x, y };
  }
  throw new Error('no free spot on the canvas');
}

async function drag(page: Page, dx: number, dy: number) {
  const { x, y } = await canvasPoint(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 25; i++) await page.mouse.move(x + (dx * i) / 25, y + (dy * i) / 25);
  await page.mouse.up();
  await page.waitForTimeout(900);
}

test('CA-01 shots by button and by key', async ({ page, errors }) => {
  await openScene(page);
  const presets = [
    ['Wide', 'wide'],
    ['Close', 'cozy'],
    ['From above', 'top'],
    ['Side', 'window'],
  ] as const;
  for (const [label, id] of presets) {
    await camBtn(page, label).click();
    await expect(camBtn(page, label)).toHaveAttribute('aria-pressed', 'true');
    await expectShot(page, OFFICE[id], label);
  }
  for (const [i, [label, id]] of presets.entries()) {
    await page.keyboard.press(String(i + 1));
    await expect(camBtn(page, label), `key ${i + 1}`).toHaveAttribute('aria-pressed', 'true');
    await expectShot(page, OFFICE[id], `key ${i + 1}`);
  }
  await page.keyboard.press('0');
  await expect(camBtn(page, 'Wide'), 'key 0').toHaveAttribute('aria-pressed', 'true');
  await expectShot(page, OFFICE.wide, 'key 0');
  expectNoErrors(errors);
});

test('CA-02 zoom', async ({ page, errors }) => {
  await openScene(page);
  const slider = page.locator('.camera-bar input[type=range][aria-label="Zoom"]');
  const value = async () => Number(await slider.inputValue());
  const d = async () => (await camState(page)).dist;
  // camera moves ease in over a second or two: wait until it holds still
  const settle = async () => {
    let last = -1;
    await expect
      .poll(async () => {
        const now = await d();
        const still = Math.abs(now - last) < 0.005;
        last = now;
        return still;
      }, { intervals: [250], timeout: 8000 })
      .toBe(true);
  };

  let v = await value();
  let dd = await d();
  await page.locator('.camera-bar').getByRole('button', { name: 'Zoom in' }).click();
  await settle();
  expect(await d(), 'zoom in: closer').toBeLessThan(dd - 0.5);
  await expect.poll(value, { message: 'the slider follows' }).toBeGreaterThan(v + 0.03);

  v = await value();
  dd = await d();
  await page.locator('.camera-bar').getByRole('button', { name: 'Zoom out' }).click();
  await settle();
  expect(await d(), 'zoom out: farther').toBeGreaterThan(dd + 0.5);
  await expect.poll(value).toBeLessThan(v - 0.03);

  // drag the slider
  const box = (await slider.boundingBox())!;
  v = await value();
  dd = await d();
  await page.mouse.move(box.x + box.width * v, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await settle();
  await expect.poll(value).toBeGreaterThan(0.7);
  expect(await d(), 'the slider zooms the view').toBeLessThan(dd - 3);

  // the + and − keys
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  dd = await d();
  v = await value();
  await page.keyboard.press('-');
  await settle();
  expect(await d(), 'key −').toBeGreaterThan(dd + 0.3);
  await expect.poll(value).toBeLessThan(v);
  dd = await d();
  v = await value();
  await page.keyboard.press('+');
  await settle();
  expect(await d(), 'key +').toBeLessThan(dd - 0.3);
  await expect.poll(value).toBeGreaterThan(v);
  expectNoErrors(errors);
});

test('CA-03 close-up', async ({ page, errors }) => {
  await openScene(page);
  const cu = camBtn(page, 'Close-up');
  await expect(cu, 'nobody selected').toBeDisabled();

  const framed = async (name: string) => {
    const c = (await crew(page))[name];
    await expect
      .poll(async () => {
        const s = await camState(page);
        // looking at them, from the front (+z is the open side of the room), close by
        return Math.abs(s.target[0] - c.x) < 0.3 && Math.abs(s.target[2] - c.z) < 0.3 && s.pos[2] > c.z + 4 && s.dist < 7 ? 'ok' : JSON.stringify({ s, c });
      }, { message: `framed on ${name}` })
      .toBe('ok');
  };
  // someone who stays put: notes-app-3f waits at the reception
  await chip(page, 'notes-app-3f').click();
  await expect(cu).toBeEnabled();
  await cu.click();
  await expect(cu).toHaveAttribute('aria-pressed', 'true');
  await framed('notes-app-3f');

  // key 5, for someone else (napping in the lounge), from the wide shot
  await camBtn(page, 'Wide').click();
  await page.waitForTimeout(1500);
  await chip(page, 'photo-api-9d').click();
  await page.keyboard.press('5');
  await framed('photo-api-9d');
  expectNoErrors(errors);
});

test('CA-04 follow', async ({ page, errors }) => {
  // a person who is about to walk: a command that runs on sends them to the printer
  await logCrew(page);
  const mock = await new MockOffice(page, [session({ name: 'walker', tool: ['Bash', 'run', 'npm run build'] }), session({ name: 'sitter', tool: ['Edit', 'edit', 'a.ts'] })]).install();
  await openScene(page, '?test&weather=clear');
  await chip(page, 'walker').click();
  const follow = camBtn(page, 'Follow');
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  const samples: { c: { x: number; z: number }; t: number[]; ndc: number[] }[] = [];
  for (let i = 0; i < 70; i++) {
    const c = (await crew(page)).walker;
    const s = await camState(page);
    const p = await toScreen(page, [c.x, 1.5, c.z]);
    samples.push({ c, t: s.target, ndc: [p.ndcX, p.ndcY] });
    await page.waitForTimeout(150);
  }
  const moved = dist([samples[0].c.x, 0, samples[0].c.z], [samples.at(-1)!.c.x, 0, samples.at(-1)!.c.z]);
  expect(moved, 'they walked across the room').toBeGreaterThan(6);
  const lag = Math.max(...samples.map((s) => Math.hypot(s.t[0] - s.c.x, s.t[2] - s.c.z)));
  expect(lag, 'the camera keeps up').toBeLessThan(3);
  for (const s of samples) expect(Math.max(Math.abs(s.ndc[0]), Math.abs(s.ndc[1])), 'they stay in view').toBeLessThan(1);
  const last = samples.at(-1)!;
  expect(Math.hypot(last.t[0] - last.c.x, last.t[2] - last.c.z), 'centred on them once they stop').toBeLessThan(0.6);

  // released: the camera stays while they walk away
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  const t0 = (await camState(page)).target;
  await mock.set({ walker: { tool: ['Edit', 'edit', 'b.ts'] } });
  await expect.poll(async () => (await crew(page)).walker.at, { timeout: 20_000 }).toBe('st:0');
  expect(dist((await camState(page)).target, t0), 'not following any more').toBeLessThan(0.3);

  // F does the same
  await page.keyboard.press('f');
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('f');
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  expectNoErrors(errors);
});

test('CA-05 stream mode', async ({ page, errors }) => {
  await openScene(page);
  const app = page.locator('.app');
  const before = await camState(page);
  await camBtn(page, 'Stream').click();
  await expect(app).toHaveClass(/\bstream\b/);
  // the interface rests: tools fade once the mouse is still; only the waiting person keeps a tag
  await expect(app).toHaveClass(/\bsleepy\b/, { timeout: 6000 });
  await expect.poll(() => page.locator('header.topbar').evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
  await expect.poll(() => page.locator('.rail-tools').evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
  await expect(page.locator('.labels .chip')).toHaveCount(1);
  await expect(page.locator('.labels .chip .chip-name')).toHaveText('notes-app-3f');
  // the camera drifts between shots
  await page.waitForTimeout(1500);
  const a = await camState(page);
  await page.waitForTimeout(1500);
  const b = await camState(page);
  expect(dist(before.pos, a.pos), 'it moved off the shot').toBeGreaterThan(0.3);
  expect(dist(a.pos, b.pos), 'and keeps drifting').toBeGreaterThan(0.05);

  // Exit stream (the mouse wakes the tools)
  await page.mouse.move(600, 500);
  await page.mouse.move(640, 520);
  await camBtn(page, 'Exit stream').click();
  await expect(app).not.toHaveClass(/\bstream\b/);
  await expect.poll(() => page.locator('header.topbar').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  await expect(page.locator('.labels .chip')).toHaveCount(7);

  // S and Esc
  await page.keyboard.press('s');
  await expect(app).toHaveClass(/\bstream\b/);
  await page.keyboard.press('Escape');
  await expect(app).not.toHaveClass(/\bstream\b/);
  await expect(page.locator('.labels .chip')).toHaveCount(7);
  expectNoErrors(errors);
});

test('CA-06 the camera stays in front of the room', async ({ page, errors }) => {
  await openScene(page);
  const seen: { az: number; polar: number; y: number }[] = [];
  for (const [dx, dy] of [
    [-1600, 0],
    [1600, 0],
    [1600, 0],
    [0, -1600],
    [0, 1600],
    [-1600, 1600],
  ]) {
    await drag(page, dx, dy);
    const s = await camState(page);
    seen.push({ az: s.az, polar: s.polar, y: s.pos[1] });
    // never round a wall, never below the floor
    expect(Math.abs(s.az), `swing after a drag of ${dx},${dy}`).toBeLessThanOrEqual(0.63);
    expect(s.polar).toBeGreaterThanOrEqual(0.19);
    expect(s.polar).toBeLessThanOrEqual(1.51);
    expect(s.pos[1], 'above the floor').toBeGreaterThan(0.3);
  }
  // the drags did reach the stops
  expect(Math.max(...seen.map((s) => Math.abs(s.az))), 'swung as far as allowed').toBeGreaterThan(0.58);
  expect(Math.min(...seen.map((s) => s.polar)), 'looked down as far as allowed').toBeLessThan(0.25);
  expect(Math.max(...seen.map((s) => s.polar)), 'looked along the floor as far as allowed').toBeGreaterThan(1.45);
  // zoom far out: it stops before going far away
  const { x, y } = await canvasPoint(page);
  await page.mouse.move(x, y);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1200);
  const far = await camState(page);
  expect(far.dist, 'not far away').toBeLessThanOrEqual(30.05);
  expect(far.dist, 'zoomed out to the limit').toBeGreaterThan(25);
  expectNoErrors(errors);
});

test('CA-07 each theme remembers its angle', async ({ page, errors }) => {
  await openScene(page);
  // your own angle in the office
  await drag(page, 260, -60);
  await page.waitForTimeout(1200);
  const mine = await camState(page);
  await expect(camBtn(page, 'Wide')).toHaveAttribute('aria-pressed', 'false');
  expect(Math.abs(mine.az), 'the view really turned').toBeGreaterThan(0.1);
  await expect.poll(async () => ((await storage(page, 'ao-crew-pose-v1:office')) as { p?: number[] } | null)?.p?.length).toBe(6);

  // reload: the angle is back
  await openScene(page);
  await page.waitForTimeout(800);
  expect(dist((await camState(page)).pos, mine.pos), 'after a reload').toBeLessThan(0.3);

  // the kitchen opens at its own angle
  await pickTheme(page, 'kitchen');
  await page.waitForTimeout(1500);
  const kitchen = await camState(page);
  expect(Math.abs(kitchen.az), "the kitchen's own (wide) shot").toBeLessThan(0.05);
  expect(Math.abs(kitchen.target[2] - KITCHEN_WIDE_TARGET_Z)).toBeLessThan(0.3);

  // back to the office: the angle you left
  await pickTheme(page, 'office');
  await page.waitForTimeout(1500);
  const back = await camState(page);
  expect.soft(dist(back.pos, mine.pos), `back in the office the camera is at ${back.pos}, the angle left was ${mine.pos}`).toBeLessThan(0.3);
  expectNoErrors(errors);
});

test.describe('on a phone-shaped window', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('CA-08 tall windows', async ({ page, errors }) => {
    await openScene(page);
    await page.waitForTimeout(1500);
    const k = await fitOf(page);
    const w = OFFICE.wide;
    const wideDist = dist([w[0], w[1], w[2]], [w[3], w[4], w[5]]);
    const s = await camState(page);
    const box = (await page.locator('.stage canvas').boundingBox())!;
    test.info().annotations.push({ type: 'phone stage', description: `${Math.round(box.width)}×${Math.round(box.height)} px, pull-back ×${k.toFixed(2)}, camera ${s.dist.toFixed(1)} from the target (wide shot ${wideDist.toFixed(1)})` });
    expect(s.dist, 'the shot is not closer than the wide one').toBeGreaterThanOrEqual(wideDist * 0.99);
    // the whole room fits: the corners of the back wall (what the wide shot frames on a wide screen)
    const corners: V3[] = [
      [-12.5, 0, -6.4],
      [12.5, 0, -6.4],
      [-12.5, 5, -6.4],
      [12.5, 5, -6.4],
    ];
    const out: string[] = [];
    for (const c of corners) {
      const p = await toScreen(page, c);
      if (Math.abs(p.ndcX) > 1.02 || Math.abs(p.ndcY) > 1.02) out.push(`${c} at ${p.ndcX.toFixed(2)},${p.ndcY.toFixed(2)}`);
    }
    expect(out, 'room corners outside the picture').toEqual([]);
    expectNoErrors(errors);
  });
});
