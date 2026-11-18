import http from 'node:http';
import os from 'node:os';
import { expect, expectNoErrors, test } from './support/fixtures';
import { chip, openScene, pickTheme, pickWeather, viewTab, waitDrawn } from './support/app';

// 15. Security and privacy.

test('SC-01 only this machine can open it', async () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && !a.internal)
    .map((a) => (a.family === 'IPv6' ? `[${a.address.split('%')[0]}]` : a.address))
    .filter((a) => !a.startsWith('[fe80'));
  test.skip(!addresses.length, 'this Mac has no network address');
  test.info().annotations.push({ type: 'addresses tried', description: `${addresses.length} (IPv4 and IPv6, every interface)` });
  for (const a of addresses) {
    const r = await fetch(`http://${a}:4777/`, { signal: AbortSignal.timeout(4000) }).then(
      (res) => `answered ${res.status}`,
      (e: Error & { cause?: { code?: string } }) => `refused (${e.cause?.code || e.name})`,
    );
    expect(r, `the app on ${a}`).toMatch(/^refused/);
  }
  // a page that reaches 127.0.0.1 under another host name (DNS rebinding) is turned away too
  const status = await new Promise<number>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 4777, path: '/api/office', headers: { Host: 'attacker.example:4777' } }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    }).on('error', reject);
  });
  expect(status).toBe(403);
});

test('SC-02 no requests to other sites', async ({ page, errors }) => {
  test.setTimeout(180_000);
  const elsewhere: string[] = [];
  let count = 0;
  page.on('request', (r) => {
    count++;
    const u = r.url();
    if (!/^(http:\/\/127\.0\.0\.1:4777\/|data:|blob:)/.test(u)) elsewhere.push(`${r.method()} ${u}`);
  });
  page.on('websocket', (ws) => elsewhere.push(`websocket ${ws.url()}`));
  const t0 = Date.now();
  // every view, for about a minute (music off)
  await openScene(page);
  await page.waitForTimeout(4000);
  for (const t of ['kitchen', 'workshop', 'office'] as const) {
    await pickTheme(page, t);
    await page.waitForTimeout(2500);
  }
  for (const w of ['sunny', 'snow', 'clear', 'rain'] as const) {
    await pickWeather(page, w);
    await page.waitForTimeout(800);
  }
  await page.locator('.topbar').getByRole('button', { name: 'Customize' }).click();
  await page.waitForTimeout(4000);
  await page.locator('aside.customize').getByRole('button', { name: 'Done' }).click();
  await chip(page, 'web-shop-81').click();
  for (const tab of ['Timeline', 'Subagents', 'Tokens', 'Overview']) await page.locator('aside.panel').getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
  await page.keyboard.press('Escape');
  await viewTab(page, 'Team').click();
  await page.waitForTimeout(3000);
  await viewTab(page, 'History').click();
  await expect(page.locator('.dy-card').first()).toBeVisible({ timeout: 30_000 });
  await page.locator('.dy-card .dy-open').nth(1).click();
  await page.locator('.hx-actions').getByRole('button', { name: 'Replay', exact: true }).click();
  await page.waitForTimeout(3000);
  await viewTab(page, 'Recap').click();
  for (const p of ['Today', 'Yesterday', 'This week', 'Last 7 days', 'This month']) {
    await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: p, exact: true }).click();
    await page.waitForTimeout(700);
  }
  await viewTab(page, 'Office').click();
  await waitDrawn(page);
  const left = 62_000 - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
  expect(count, 'requests seen').toBeGreaterThan(20);
  expect(elsewhere, 'requests that left this machine').toEqual([]);
  expectNoErrors(errors);
});

test('SC-03 demo shows nothing real', async ({ page, request, errors }) => {
  const live = ((await (await request.get('/api/office')).json()) as { sessions: { name: string; project: string; title: string; cwd: string }[] }).sessions;
  const demoWords = ['notes-app', 'web-shop', 'photo-api', 'docs-site', 'billing', 'Fix sync conflict on reconnect', 'Add order history page', 'Rate limit', 'Upgrade to Vite 7', 'Explain the billing schema', 'Tidy the settings screen'];
  const real = [...new Set(live.flatMap((s) => [s.name, s.project, s.title]).filter((w) => w && w.trim().length >= 4))].filter((w) => !demoWords.some((d) => d.includes(w) || w.includes(d)));
  test.skip(!real.length, 'no real session is running to compare with');
  await openScene(page);
  await page.waitForTimeout(1500);
  const seen = async () =>
    page.evaluate(() =>
      [
        document.title,
        document.body.innerText,
        // the names of things, and what their tooltips would say
        ...[...document.querySelectorAll('[aria-label],[title],[data-tip]')].map((e) => ['aria-label', 'title', 'data-tip', 'data-tip-title', 'data-tip-note'].map((a) => e.getAttribute(a) || '').join(' ')),
      ].join('\n'),
    );
  let text = await seen();
  // the people's cards and the "everyone" list too
  await chip(page, 'web-shop-81').click();
  await page.locator('.rail-label').click();
  text += await seen();
  // the team view lists the demo's sessions
  await viewTab(page, 'Team').click();
  text += await seen();
  const leaks = real.filter((w) => text.includes(w));
  expect(leaks.length, `real names or projects shown in demo (${leaks.length} of ${real.length})`).toBe(0);
  expectNoErrors(errors);
});
