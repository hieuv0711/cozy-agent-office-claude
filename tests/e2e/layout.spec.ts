import type { Page } from '@playwright/test';
import { expect, expectNoErrors, test } from './support/fixtures';
import { chip, openScene, viewTab, waitDrawn } from './support/app';
import { MockOffice, session } from './support/mock';

// 11. Layout at different window sizes.

const VIEWS = ['Office', 'Team', 'History', 'Recap'];

/** The top bar's items: where they are, and whether any is cut off or overlaps another. */
async function topBar(page: Page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll('header.topbar > *')].filter((e) => getComputedStyle(e).display !== 'none') as HTMLElement[];
    const boxes = items.map((e) => {
      const r = e.getBoundingClientRect();
      return { name: (e.getAttribute('aria-label') || e.className || e.tagName).toString().slice(0, 30), top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: (r.top + r.bottom) / 2, clipped: e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' };
    });
    const overlaps: string[] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1) overlaps.push(`${a.name} / ${b.name}`);
      }
    const rows = new Set(boxes.map((b) => Math.round(b.mid / 12))).size;
    return { boxes, overlaps, rows, width: innerWidth };
  });
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test('LA-01 wide screens', async ({ page, errors }) => {
  for (const [w, h] of [
    [2560, 1344],
    [1440, 900],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await openScene(page);
    const bar = await topBar(page);
    const mids = bar.boxes.map((b) => b.mid);
    expect(Math.max(...mids) - Math.min(...mids), `${w}×${h}: one-row top bar`).toBeLessThan(10);
    expect(bar.overlaps, `${w}×${h}: nothing overlaps`).toEqual([]);
    for (const b of bar.boxes) {
      expect(b.left, `${w}×${h}: ${b.name} on screen`).toBeGreaterThanOrEqual(0);
      expect(b.right, `${w}×${h}: ${b.name} on screen`).toBeLessThanOrEqual(w);
      expect(b.clipped, `${w}×${h}: ${b.name} not cut off`).toBe(false);
    }
    // the camera and weather buttons can be seen and reached
    for (const b of await page.locator('.camera-bar button, .camera-bar input').all()) {
      const box = (await b.boundingBox())!;
      expect(box.x >= 0 && box.x + box.width <= w && box.y >= 0 && box.y + box.height <= h, `${w}×${h}: ${await b.getAttribute('aria-label') || await b.textContent()} in view`).toBe(true);
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.camera-bar button, .camera-bar input') !== null, [box.x + box.width / 2, box.y + box.height / 2]);
      expect(top, `${w}×${h}: ${await b.textContent()} not covered`).toBe(true);
    }
    expect(await sideways(page), `${w}×${h}: no sideways scroll`).toBeLessThanOrEqual(0);
  }
  expectNoErrors(errors);
});

test.describe('800 px wide', () => {
  test.use({ viewport: { width: 800, height: 900 } });
  test('LA-02 800 px wide', async ({ page, errors }) => {
    await openScene(page);
    for (const v of VIEWS) {
      await viewTab(page, v).click();
      await page.waitForTimeout(v === 'Office' ? 0 : 1500);
      if (v === 'Office') await waitDrawn(page);
      const bar = await topBar(page);
      expect(bar.rows, `${v}: the top bar wraps into rows`).toBeGreaterThan(1);
      expect(bar.overlaps, `${v}: no overlap`).toEqual([]);
      for (const b of bar.boxes) expect(b.right, `${v}: ${b.name} on screen`).toBeLessThanOrEqual(800);
      expect(await sideways(page), `${v}: no sideways scroll`).toBeLessThanOrEqual(0);
    }
    expectNoErrors(errors);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('LA-03 phone', async ({ page, errors }) => {
    await openScene(page);
    for (const v of VIEWS) {
      // usable: every view is reached from its tab, on screen
      const tab = viewTab(page, v);
      const box = (await tab.boundingBox())!;
      expect(box.x >= 0 && box.x + box.width <= 390, `${v} tab on screen`).toBe(true);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(1500);
      expect(await sideways(page), `${v}: no sideways scroll`).toBeLessThanOrEqual(0);
      // readable: no visible text smaller than 11 px, nothing running off the right edge
      const small = await page.evaluate(() => {
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = (n.textContent || '').trim();
          const el = n.parentElement;
          if (!t || !el || el.closest('[aria-hidden="true"], .labels')) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
          if (parseFloat(cs.fontSize) < 11) out.push(`${t.slice(0, 30)} (${cs.fontSize})`);
          if (r.right > innerWidth + 1 && cs.overflowX === 'visible' && !el.closest('[style*="overflow"]')) out.push(`${t.slice(0, 30)} runs off (${Math.round(r.right)})`);
        }
        return [...new Set(out)].slice(0, 10);
      });
      expect(small, `${v}: readable`).toEqual([]);
    }
    // a card opens as a sheet over the lower part of the window, tall enough to read
    await viewTab(page, 'Office').click();
    await waitDrawn(page).catch(() => undefined);
    // (tags crowd on a phone, so the click goes to the tag itself, not whatever lies over it)
    await chip(page, 'web-shop-81').dispatchEvent('click');
    const card = page.locator('aside.panel[aria-label="Agent detail"]');
    await expect(card).toBeVisible();
    const cb = (await card.boundingBox())!;
    const bar = (await page.locator('header.topbar').boundingBox())!;
    expect(cb.height, 'the card is tall enough to read').toBeGreaterThan(844 * 0.55);
    expect(cb.y, 'the top bar stays in view above it').toBeGreaterThanOrEqual(bar.y + bar.height - 1);
    expect(cb.x >= 0 && cb.x + cb.width <= 390, 'the card fits the width').toBe(true);
    await expect(card.locator('.panel-body')).toBeVisible();
    expectNoErrors(errors);
  });
});

test('LA-04 long names', async ({ page, errors }) => {
  const long = 'a-very-long-session-name-that-keeps-going-'.repeat(4).slice(0, 120);
  expect(long).toHaveLength(120);
  const mock = await new MockOffice(page, [session({ name: long, title: 'Long name test', tool: ['Edit', 'edit', 'src/a.ts'] }), session({ name: 'short-one', tool: ['Read', 'read', 'b.md'] })]).install();
  await openScene(page, '?test&weather=clear');
  const tag = chip(page, long);
  await expect(tag).toBeVisible();
  // cut short with "…", no wider than about 260 px
  const box = (await tag.boundingBox())!;
  expect(box.width, 'the tag stays narrow').toBeLessThanOrEqual(270);
  const name = tag.locator('.chip-name');
  expect(await name.evaluate((e) => getComputedStyle(e).textOverflow)).toBe('ellipsis');
  expect(await name.evaluate((e) => e.scrollWidth > e.clientWidth), 'the name is cut short').toBe(true);
  // the card shows the whole name
  await tag.click();
  const where = page.locator('aside.panel[aria-label="Agent detail"] .where');
  await expect(where).toContainText(long);
  const shown = await where.evaluate((e) => ({ fits: e.scrollWidth <= e.clientWidth + 1, clip: getComputedStyle(e).textOverflow }));
  expect(shown.fits, 'the whole name is visible in the card (it wraps)').toBe(true);
  expect(shown.clip).not.toBe('ellipsis');
  // it waits for you: the caption cuts the name, never the question, and "Go to …" stays on screen
  await page.keyboard.press('Escape');
  await mock.set({ [long]: { status: 'needs-you', waitingFor: 'permission prompt', tool: ['Bash', 'run', 'npm test'] } });
  const ask = page.locator('.caps .cap.ask');
  await expect(ask.locator('.say .base')).toHaveText('Can I run npm test?');
  expect(await ask.locator('.say .base').evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'the whole question shows').toBe(true);
  expect(await ask.locator('.who').evaluate((e) => e.scrollWidth > e.clientWidth && getComputedStyle(e).textOverflow === 'ellipsis'), 'the name is cut short with "…"').toBe(true);
  const go = page.locator('.rail .answer');
  await expect(go).toContainText('a-very-long');
  const gb = (await go.boundingBox())!;
  expect(gb.x + gb.width, 'the button stays on screen').toBeLessThanOrEqual(1440);
  expect(await go.locator('.answer-label').evaluate((e) => e.scrollWidth > e.clientWidth && getComputedStyle(e).textOverflow === 'ellipsis'), 'its name ends in "…" inside it').toBe(true);
  expectNoErrors(errors);
});
