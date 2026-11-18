import type { Page } from '@playwright/test';
import { expect, expectNoErrors, test, THEMES, type Theme } from './support/fixtures';
import {
  actsAt,
  boardNotes,
  chip,
  counterToys,
  crew,
  helperFigures,
  latheSpeed,
  logCrew,
  openScene,
  pageNow,
  personMarks,
  pickTheme,
  printer,
  printerCycles,
  readLog,
  rowsOf,
  seedStorage,
  storage,
  waitLamps,
  type CrewEntry,
} from './support/app';
import { MockOffice, session, sub, type Session } from './support/mock';

// 2. People: every session is a person who acts out what it does.
// PE-09 and PE-10 (the kitchen's serving) are not here: they are being rebuilt.
//
// Most of these scenarios need a particular moment (a 30-second think, three
// sessions waiting, more idle sessions than seats, someone arriving): they use
// made-up sessions the test controls (support/mock.ts); PE-01 uses ?demo.
// What each person does and where is read from window.__crew (?test).

/** Opens a theme with made-up sessions (given in station order) and samples everyone from the start. */
async function mocked(page: Page, sessions: Session[], world: Theme = 'office', extra = '') {
  await logCrew(page);
  const mock = await new MockOffice(page, sessions).install();
  await openScene(page, `?test&world=${world}&weather=clear${extra}`);
  return mock;
}

/** Waits until a person's state passes a check. */
async function until(page: Page, name: string, ok: (c: CrewEntry) => boolean, what: string, timeout = 20_000) {
  await expect
    .poll(
      async () => {
        const c = (await crew(page))[name];
        return c && ok(c) ? 'ok' : JSON.stringify(c ?? 'not in the scene');
      },
      { timeout, message: `${name} ${what}` },
    )
    .toBe('ok');
}
const at = (spot: string, act?: string) => (c: CrewEntry) => c.at === spot && (!act || c.act === act);
/** A tool of a kind no theme sends anyone off for (no machine, no furniture): they stay at their own spot. */
const STAY: [string, string, string] = ['mcp__notes__save', 'mcp', 'notes'];

/** Spots taken by two people at once (from a log), and the closest two settled people came. */
function sharing(log: [number, string, string, string, number, number][]) {
  const byT = new Map<number, typeof log>();
  for (const r of log) byT.set(r[0], [...(byT.get(r[0]) || []), r]);
  const clashes: string[] = [];
  let closest = Infinity;
  for (const [t, rows] of byT) {
    const settled = rows.filter((r) => !r[3].startsWith('→'));
    const keys = new Map<string, string>();
    for (const r of settled) {
      if (keys.has(r[3])) clashes.push(`${t}ms ${keys.get(r[3])} and ${r[1]} both at ${r[3]}`);
      keys.set(r[3], r[1]);
    }
    for (let i = 0; i < settled.length; i++)
      for (let j = i + 1; j < settled.length; j++) closest = Math.min(closest, Math.hypot(settled[i][4] - settled[j][4], settled[i][5] - settled[j][5]));
  }
  return { clashes, closest };
}

/** The yellow lamps over the office's two waiting spots (x 8.75 and 10.75): lit or not. */
async function lampsLit(page: Page, over = 20) {
  const lamps = await waitLamps(page);
  return [8.75, 10.75].map((x) => {
    const l = lamps.find((q) => Math.abs(q.x - x) < 0.05);
    return l ? l.intensity > over : null;
  });
}

const OFFICE_BUSY = ['ponder', 'scribble', 'sip'];
const BUSY: Record<Theme, string[]> = { office: OFFICE_BUSY, kitchen: ['taste', 'strain', 'wipe'], workshop: ['tinker', 'sand', 'measure'] };
const IDLE_LIKE = ['mug', 'nap', 'doze', 'deskdoze', 'wave', 'stand'];

test('PE-01 everyone gets a person', async ({ page, errors }) => {
  await openScene(page);
  await expect(page.locator('.labels .chip')).toHaveCount(7);
  expect(Object.keys(await crew(page))).toHaveLength(7);
  // a working session's tag: its name, and under it what it is doing
  const seen = new Set<string>();
  await expect
    .poll(
      async () => {
        for (const t of await page.locator('.labels .chip.working .chip-sub').allTextContents()) seen.add(t);
        return ['Edit OrderList.tsx', 'Thinking…'].filter((t) => !seen.has(t));
      },
      { timeout: 40_000, intervals: [250] },
    )
    .toEqual([]);
  const tag = chip(page, 'web-shop-81');
  await expect(tag.locator('.chip-top .chip-name')).toHaveText('web-shop-81');
  // its helpers: "+2" after the name
  await expect(tag.locator('.chip-top .chip-bots')).toHaveText('+2');
  await expect(page.locator('.labels .chip .chip-bots')).toHaveCount(1);
  // the line under the name sits under it
  const top = await tag.locator('.chip-top').boundingBox();
  const sub2 = await tag.locator('.chip-sub').boundingBox();
  expect(sub2!.y).toBeGreaterThanOrEqual(top!.y + top!.height - 1);
  expectNoErrors(errors);
});

test('PE-02 working people act out their tool', async ({ page, errors }) => {
  const expected: Record<Theme, Record<string, string>> = {
    office: { editor: 'type', runner: 'watch', reader: 'paper', searcher: 'phone' },
    kitchen: { editor: 'chop', runner: 'stir', reader: 'read', searcher: 'book' },
    workshop: { editor: 'saw', runner: 'hammer', reader: 'blueprint', searcher: 'rummage' },
  };
  await mocked(page, [
    session({ name: 'editor', tool: ['Edit', 'edit', 'src/app.ts'] }),
    session({ name: 'runner', tool: ['Bash', 'run', 'npm test'] }),
    session({ name: 'reader', tool: ['Read', 'read', 'README.md'] }),
    session({ name: 'searcher', tool: ['WebSearch', 'web', 'vite docs'] }),
  ]);
  for (const theme of THEMES) {
    if (theme !== 'office') await pickTheme(page, theme);
    // from the theme's first frames (a command that runs on sends its person off after a few seconds)
    const t0 = (await page.evaluate(() => performance.getEntriesByName('ao:drawn').at(-1)!.startTime)) - 500;
    for (const [who, act] of Object.entries(expected[theme])) {
      await expect
        .poll(async () => [...actsAt(await readLog(page, t0), who, /^st:/)], { timeout: 8000, message: `${theme}: ${who} at their spot` })
        .toContain(act);
    }
  }
  expectNoErrors(errors);
});

test('PE-03 thinking keeps them busy', async ({ page, errors }) => {
  test.setTimeout(240_000);
  const thinkers = ['think-a', 'think-b', 'think-c'];
  await mocked(page, [...thinkers.map((name) => session({ name, tool: null, since: 40 })), session({ name: 'editor', tool: ['Edit', 'edit', 'a.ts'] })]);
  for (const theme of THEMES) {
    if (theme !== 'office') await pickTheme(page, theme);
    const t0 = await pageNow(page);
    await page.waitForTimeout(30_500);
    const log = await readLog(page, t0);
    const atDesk = thinkers.map((n) => [...actsAt(log, n, /^st:/)].filter((a) => BUSY[theme].includes(a)));
    for (const n of thinkers) {
      const settled = rowsOf(log, n).filter((r) => !r[3].startsWith('→'));
      const idle = settled.filter((r) => IDLE_LIKE.includes(r[2]));
      expect(idle.map((r) => `${r[2]}@${r[3]}`).slice(0, 3), `${theme}: ${n} never looks idle`).toEqual([]);
    }
    if (theme === 'office') {
      // the office sends long thinkers to the board and the espresso machine (PE-05); whoever
      // stays at a desk goes through chin on hand, notes and a sip
      expect(Math.max(...atDesk.map((a) => a.length)), `office: someone at a desk changes jobs (${JSON.stringify(atDesk)})`).toBe(3);
    } else {
      for (const [i, n] of thinkers.entries()) expect(atDesk[i].sort(), `${theme}: ${n} changes small jobs`).toEqual([...BUSY[theme]].sort());
    }
  }
  expectNoErrors(errors);
});

test('PE-04 a long command sends them to the machine', async ({ page, errors }) => {
  test.setTimeout(240_000);
  const mock = await mocked(page, [session({ name: 'runner', tool: ['Bash', 'run', 'npm run build'] }), session({ name: 'right-side', tool: ['Edit', 'edit', 'b.ts'] })]);

  // office: to the printer by the door, which prints a page every 1.5 s while they wait
  await until(page, 'runner', at('st:0', 'watch'), 'watches the command at the desk first', 5000);
  await until(page, 'runner', at('place:printer', 'printwait'), 'waits at the printer');
  const p = await printerCycles(page, 4600);
  expect(p.visibleFrames, 'a page is coming out').toBeGreaterThan(0);
  expect(p.cycles, 'about one page every 1.5 s').toBeGreaterThanOrEqual(2);
  expect(p.cycles).toBeLessThanOrEqual(4);
  expect(p.maxPages, 'pages pile on the tray').toBeGreaterThan(0);
  // the command ends: back to their own desk, and the printer stops
  await mock.set({ runner: { tool: ['Edit', 'edit', 'a.ts'] } });
  await until(page, 'runner', at('st:0', 'type'), 'is back at the desk');
  await expect.poll(async () => JSON.stringify(await printer(page)), { timeout: 8000 }).toMatch(/"sheet":false.*"pages":0/);

  // kitchen: to a big broth pot on the back line, to ladle
  await pickTheme(page, 'kitchen');
  await mock.set({ runner: { tool: ['Bash', 'run', 'npm run build'] } });
  await until(page, 'runner', (c) => c.at === 'place:pot-left' && c.act === 'ladle', 'ladles at the broth pot on their side', 25_000);
  await mock.set({ runner: { tool: STAY } });
  await until(page, 'runner', at('st:0'), 'is back at the counter');

  // workshop: to the lathe (it spins up) or the drill press, whichever is on their side
  await pickTheme(page, 'workshop');
  await mock.set({ runner: { tool: ['Bash', 'run', 'npm run build'] }, 'right-side': { tool: ['Bash', 'run', 'make'] } });
  await until(page, 'runner', at('place:lathe', 'lathe'), 'works the lathe (their side)');
  await until(page, 'right-side', at('place:drill', 'drill'), 'works the drill press (their side)');
  await expect.poll(() => latheSpeed(page), { message: 'the lathe spins up' }).toBeGreaterThan(8);
  await mock.set({ runner: { tool: STAY }, 'right-side': { tool: STAY } });
  await until(page, 'runner', at('st:0'), 'is back at the bench');
  await until(page, 'right-side', at('st:1'), 'is back at the bench');
  await expect.poll(() => latheSpeed(page), { timeout: 10_000, message: 'the lathe spins down' }).toBeLessThan(1);
  expectNoErrors(errors);
});

test('PE-05 planning, long thinking, long searching', async ({ page, errors }) => {
  test.setTimeout(180_000);
  const mock = await mocked(page, [
    session({ name: 'planner', tool: ['TodoWrite', 'plan', '4 steps'] }),
    session({ name: 'thinker', tool: null, since: 30 }),
    session({ name: 'searcher', tool: ['Edit', 'edit', 'a.ts'] }),
  ]);
  // office: planning is sketched on the task board; a long think goes to the board or the espresso machine
  await until(page, 'planner', (c) => /^place:board-[ab]$/.test(c.at) && ['sketch', 'note'].includes(c.act), 'sketches on the task board');
  await until(page, 'thinker', (c) => (c.at === 'place:coffee' && c.act === 'coffee') || (/^place:board-[ab]$/.test(c.at) && ['sketch', 'note'].includes(c.act)), 'goes to the board or makes an espresso');
  // the task changes: they come back
  await mock.set({ planner: { tool: ['Edit', 'edit', 'a.ts'] }, thinker: { tool: ['Edit', 'edit', 'b.ts'] } });
  await until(page, 'planner', at('st:0', 'type'), 'comes back to the desk');
  await until(page, 'thinker', at('st:1', 'type'), 'comes back to the desk');

  // workshop: a long web search goes to browse the shelves
  await pickTheme(page, 'workshop');
  await mock.set({ searcher: { tool: ['WebSearch', 'web', 'wooden toy joints'] } });
  await until(page, 'searcher', (c) => /^place:shelves-[ab]$/.test(c.at) && c.act === 'browse', 'browses the shelves');
  await mock.set({ searcher: { tool: STAY } });
  await until(page, 'searcher', at('st:2'), 'comes back to the bench');
  expectNoErrors(errors);
});

test('PE-06 one person per place', async ({ page, errors }) => {
  test.setTimeout(180_000);
  const mock = await mocked(page, [session({ name: 'left-a', tool: ['Bash', 'run', 'npm test'] }), session({ name: 'right', tool: ['Edit', 'edit', 'x.ts'] }), session({ name: 'left-b', tool: ['Bash', 'run', 'make'] })], 'workshop');
  // workshop: both on the left want the lathe; one gets it, the other takes the free drill press
  await expect
    .poll(async () => {
      const c = await crew(page);
      return [c['left-a'].at, c['left-b'].at].sort().join(' ');
    }, { timeout: 25_000 })
    .toBe('place:drill place:lathe');
  // kitchen: two pots, one each
  const t1 = await pageNow(page);
  await pickTheme(page, 'kitchen');
  await expect
    .poll(async () => {
      const c = await crew(page);
      return [c['left-a'].at, c['left-b'].at].sort().join(' ');
    }, { timeout: 25_000 })
    .toBe('place:pot-left place:pot-right');
  // office: one printer; the other watches from their desk
  await pickTheme(page, 'office');
  await expect
    .poll(async () => {
      const c = await crew(page);
      return [`${c['left-a'].at}`, `${c['left-b'].at}`].sort().join(' ');
    }, { timeout: 25_000 })
    .toMatch(/^place:printer st:[02]$|^st:[02] place:printer$/);
  await mock.set({ right: { tool: ['Bash', 'run', 'npm run lint'] } });
  await page.waitForTimeout(8000);
  const c = await crew(page);
  expect(['left-a', 'left-b', 'right'].filter((n) => c[n].at === 'place:printer'), 'only one at the printer').toHaveLength(1);
  // never two people on one spot
  const log = await readLog(page, t1);
  const s = sharing(log);
  expect(s.clashes.slice(0, 5)).toEqual([]);
  expect(s.closest, 'settled people keep apart').toBeGreaterThan(0.5);
  expectNoErrors(errors);
});

test('PE-06 one person per place: seven waiting, more than the waiting spots', async ({ page, errors }) => {
  test.setTimeout(120_000);
  const names = ['w-1', 'w-2', 'w-3', 'w-4', 'w-5', 'w-6', 'w-7'];
  await mocked(page, names.map((name, i) => session({ name, status: 'needs-you', tool: ['Bash', 'run', `job ${i}`], since: 80 - i * 5 })));
  // everyone gets to a waiting spot of their own: the line, then beside it
  await expect
    .poll(async () => {
      const c = await crew(page);
      return names.filter((n) => c[n] && /^wait:\d+$/.test(c[n].at)).length;
    }, { timeout: 40_000, message: 'all seven reach their waiting spot' })
    .toBe(7);
  await page.waitForTimeout(1500);
  const c = await crew(page);
  const close: string[] = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = c[names[i]];
      const b = c[names[j]];
      if (Math.hypot(a.x - b.x, a.z - b.z) < 0.5) close.push(`${names[i]} ${a.at} (${a.x},${a.z}) and ${names[j]} ${b.at} (${b.x},${b.z})`);
    }
  expect(close, 'two people on one spot').toEqual([]);
  expectNoErrors(errors);
});

test('PE-07 office end of turn', async ({ page, errors }) => {
  test.setTimeout(150_000);
  const mock = await mocked(page, [
    session({ name: 'finisher', tool: ['Edit', 'edit', 'a.ts'] }),
    session({ name: 'worker', tool: ['Read', 'read', 'b.md'] }),
    session({ name: 'asker', status: 'needs-you', tool: ['Bash', 'run', 'rm -rf dist'], since: 30 }),
  ]);
  // a note per working session in Doing, a yellow one per waiting session
  await expect.poll(() => boardNotes(page)).toEqual({ doing: 2, waiting: 1, done: 0 });
  // a session finishes: its person walks to the board and moves a note to Done
  await mock.set({ finisher: { status: 'idle' } });
  await until(page, 'finisher', (c) => /^place:board-[ab]$/.test(c.at) && c.act === 'note', 'moves a note on the board');
  await expect.poll(() => boardNotes(page), { timeout: 10_000 }).toEqual({ doing: 1, waiting: 1, done: 1 });
  const saved = (await storage(page, 'ao-finished:office')) as { day: string; colors: string[] };
  expect(saved.colors).toHaveLength(1);
  // reload: today's Done notes are still there
  await openScene(page, '?test&world=office&weather=clear');
  await expect.poll(() => boardNotes(page)).toEqual({ doing: 1, waiting: 1, done: 1 });
  // a new day starts with an empty Done
  await seedStorage(page, { 'ao-finished:office': { day: '2001-01-01', colors: ['#ff0000', '#00ff00', '#0000ff'] } });
  await openScene(page, '?test&world=office&weather=clear');
  await expect.poll(() => boardNotes(page)).toEqual({ doing: 1, waiting: 1, done: 0 });
  expectNoErrors(errors);
});

test('PE-08 workshop end of turn', async ({ page, errors }) => {
  test.setTimeout(150_000);
  const mock = await mocked(page, [session({ name: 'maker', tool: ['Edit', 'edit', 'a.ts'] }), session({ name: 'other', tool: ['Read', 'read', 'b.md'] })], 'workshop');
  expect(await counterToys(page)).toBe(0);
  // a session finishes: its toymaker carries a toy to the shop counter and sets it down
  await mock.set({ maker: { status: 'idle' } });
  await until(page, 'maker', (c) => c.at === '→place:counter' && c.act === 'carrytoy', 'carries a toy to the counter');
  await until(page, 'maker', at('place:counter', 'settoy'), 'sets the toy down');
  await expect.poll(() => counterToys(page), { timeout: 8000 }).toBe(1);
  expect(((await storage(page, 'ao-finished:workshop')) as { colors: string[] }).colors).toHaveLength(1);
  // up to four of today's newest toys wait there
  const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));
  await seedStorage(page, { 'ao-finished:workshop': { day: today, colors: ['#111111', '#222222', '#333333', '#444444', '#555555'] } });
  await openScene(page, '?test&world=workshop&weather=clear');
  await expect.poll(() => counterToys(page)).toBe(4);
  expectNoErrors(errors);
});

test('PE-11 waiting for you', async ({ page, errors }) => {
  test.setTimeout(150_000);
  const mock = await mocked(page, [
    session({ name: 'first-ask', status: 'needs-you', waitingFor: 'permission prompt', tool: ['Bash', 'run', 'git push'], since: 60 }),
    session({ name: 'second-ask', tool: ['Edit', 'edit', 'a.ts'] }),
    session({ name: 'third-ask', tool: ['Read', 'read', 'b.md'] }),
  ]);
  // at the first waiting spot, under a lamp that turns yellow
  await until(page, 'first-ask', at('wait:0'), 'stands at the first waiting spot');
  await expect.poll(() => lampsLit(page)).toEqual([true, false]);
  // a yellow "?" over their head; the tag says why
  await expect.poll(async () => (await personMarks(page, 'first-ask'))?.ask).toBe(true);
  expect((await personMarks(page, 'second-ask'))?.ask).toBe(false);
  await expect(chip(page, 'first-ask').locator('.chip-sub')).toHaveText('Permission prompt: Bash');
  await expect(chip(page, 'first-ask')).toHaveClass(/needs-you/);
  // the rail: a yellow caption and "Go to"
  const cap = page.locator('.caps .cap.ask');
  await expect(cap).toHaveCount(1);
  await expect(cap.locator('.who')).toHaveText('first-ask');
  expect(await cap.locator('.who').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(255, 216, 74)');
  await expect(page.locator('.rail .answer')).toHaveText('Go to first-ask');

  // a second session waits: the second lamp; a third waits beside them
  await mock.set({ 'second-ask': { status: 'needs-you', tool: ['Edit', 'edit', 'a.ts'] } });
  await until(page, 'second-ask', at('wait:1'), 'takes the second lamp');
  await expect.poll(() => lampsLit(page)).toEqual([true, true]);
  await mock.set({ 'third-ask': { status: 'needs-you', waitingFor: 'question', tool: ['AskUserQuestion', 'other', ''] } });
  await until(page, 'third-ask', at('wait:2'), 'waits beside them');

  // answered: back to work, and the lamps dim
  await mock.set({ 'first-ask': { status: 'working', tool: ['Edit', 'edit', 'c.ts'] }, 'second-ask': { status: 'working', tool: ['Edit', 'edit', 'a.ts'] }, 'third-ask': { status: 'working', tool: STAY } });
  await until(page, 'first-ask', at('st:0', 'type'), 'walks back to their desk');
  await until(page, 'second-ask', at('st:1', 'type'), 'walks back to their desk');
  await until(page, 'third-ask', at('st:2'), 'walks back to their desk');
  await expect.poll(() => lampsLit(page, 2)).toEqual([false, false]);
  expectNoErrors(errors);
});

test('PE-12 idle', async ({ page, errors }) => {
  test.setTimeout(150_000);
  const mock = await mocked(page, [
    session({ name: 'long-idle', status: 'idle', since: 600 }),
    session({ name: 'nodding', status: 'idle', since: 60 }),
    session({ name: 'goes-idle', tool: ['Edit', 'edit', 'a.ts'] }),
    session({ name: 'idle-x', tool: ['Read', 'read', 'b.md'] }),
    session({ name: 'idle-y', tool: ['Read', 'read', 'c.md'] }),
    session({ name: 'idle-z', tool: ['Read', 'read', 'd.md'] }),
  ], 'office', '&breaks=0');
  // idle for ten minutes: asleep in the idle corner ("Zz")
  await until(page, 'long-idle', (c) => c.act === 'nap' && c.at.startsWith('seat:'), 'naps in a seat');
  await expect.poll(async () => (await personMarks(page, 'long-idle'))?.zs).toBe(true);
  // idle a little under 2.5 minutes: a mug, then a nap once it passes 2.5 minutes
  await mock.set({ nodding: { since: 146 } });
  await until(page, 'nodding', (c) => c.act === 'mug' && c.at.startsWith('seat:'), 'has a mug in a seat', 3000);
  expect((await personMarks(page, 'nodding'))?.zs).toBe(false);
  await until(page, 'nodding', (c) => c.act === 'nap' && c.at.startsWith('seat:'), 'nods off after 2.5 minutes', 10_000);
  await expect.poll(async () => (await personMarks(page, 'nodding'))?.zs).toBe(true);
  // a session goes idle: (after its closing act) a seat in the idle corner, with a mug
  await mock.set({ 'goes-idle': { status: 'idle' } });
  await until(page, 'goes-idle', (c) => c.act === 'mug' && c.at.startsWith('seat:'), 'sits in the idle corner with a mug', 30_000);
  // more idle sessions than seats (four): the others doze at their own spot
  await mock.set({ 'idle-x': { status: 'idle' } });
  await page.waitForTimeout(300);
  await mock.set({ 'idle-y': { status: 'idle' } });
  await page.waitForTimeout(300);
  await mock.set({ 'idle-z': { status: 'idle' } });
  await until(page, 'idle-x', (c) => c.at.startsWith('seat:'), 'takes the last seat', 30_000);
  await until(page, 'idle-y', at('st:4', 'deskdoze'), 'dozes at their own desk', 30_000);
  await until(page, 'idle-z', at('st:5', 'deskdoze'), 'dozes at their own desk', 30_000);
  const c = await crew(page);
  const seats = Object.values(c).filter((v) => v.at.startsWith('seat:')).map((v) => v.at);
  expect(new Set(seats).size, 'four seats, one each').toBe(4);
  expectNoErrors(errors);
});

test('PE-13 coming and going', async ({ page, errors }) => {
  test.setTimeout(150_000);
  const mock = await mocked(page, [session({ name: 'stayer', tool: ['Edit', 'edit', 'a.ts'] }), session({ name: 'leaver', tool: ['Read', 'read', 'b.md'] })]);
  // a session starts: in through the door, then to a free spot
  const t0 = await pageNow(page);
  await mock.push([...mock.sessions, session({ name: 'newcomer', tool: ['Edit', 'edit', 'c.ts'] })]);
  await until(page, 'newcomer', at('st:2', 'type'), 'walks to the free desk', 30_000);
  const first = rowsOf(await readLog(page, t0), 'newcomer')[0];
  expect(Math.abs(first[4] - 9.9), 'appears at the door (x)').toBeLessThan(0.5);
  expect(first[5], 'appears at the door, outside (z)').toBeLessThan(-6.4);

  // a session ends: "Went home", out through the door, fading
  await mock.push(mock.sessions.filter((s) => s.name !== 'leaver'));
  await expect(chip(page, 'leaver')).toHaveClass(/\bleft\b/);
  await expect(chip(page, 'leaver').locator('.chip-sub')).toHaveText('Went home');
  await until(page, 'leaver', (c) => c.at === '→door' || c.at === 'door', 'heads for the door', 5000);
  await expect.poll(async () => (await personMarks(page, 'leaver'))?.visible ?? false, { timeout: 20_000, message: 'fades out at the door' }).toBe(false);
  // gone after a while, and the spot is free again
  await expect.poll(async () => 'leaver' in (await crew(page)), { timeout: 25_000 }).toBe(false);
  await expect(chip(page, 'leaver')).toHaveCount(0);
  await mock.push([...mock.sessions, session({ name: 'next-one', tool: ['Edit', 'edit', 'd.ts'] })]);
  await until(page, 'next-one', at('st:1', 'type'), 'takes the freed desk', 30_000);
  expectNoErrors(errors);
});

test('PE-14 helpers', async ({ page, errors }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => ((window as unknown as { __logHelpers: boolean }).__logHelpers = true));
  const many = [sub('Explore'), sub('Plan'), sub('Explore'), sub('general-purpose')];
  const one = [sub('Explore')];
  const mock = await mocked(page, [session({ name: 'lead', tool: ['Edit', 'edit', 'a.ts'], subs: many }), session({ name: 'solo', tool: ['Read', 'read', 'b.md'], subs: one })]);
  // up to three per session: four in all
  await expect.poll(async () => (await helperFigures(page)).length).toBe(4);
  // they walk from their person to the helper spots (the back desk), then to free desks
  const helperLog = await page.evaluate(() => (window as unknown as { __helperLog: [number, [number, number, number][]][] }).__helperLog);
  const firstSeen = helperLog.find(([, hs]) => hs.length > 0)![1];
  const people = await crew(page);
  for (const [x, z] of firstSeen) {
    const near = Math.min(...Object.values(people).map((p) => Math.hypot(p.x - x, p.z - z)));
    expect(near, `a helper starts at their person (${x}, ${z})`).toBeLessThan(1);
  }
  const spots = (theme: Theme) =>
    ({
      office: [[-2.0, -4.75], [2.0, -4.75]],
      kitchen: [[-2.0, -4.83], [2.0, -4.83]],
      workshop: [[-2.1, -4.82], [2.0, -4.82]],
    })[theme];
  const free = [[-3.6, -1.45], [3.6, -1.45]];
  const settledAt = async (want: number[][]) =>
    expect
      .poll(async () => {
        const hs = await helperFigures(page);
        return want.every(([x, z]) => hs.some((h) => Math.abs(h.x - x) < 0.15 && Math.abs(h.z - z) < 0.2)) ? 'ok' : JSON.stringify(hs);
      }, { timeout: 20_000 })
      .toBe('ok');
  await settledAt([...spots('office'), ...free]);
  // a subagent finishes: its helper leaves
  await mock.set({ solo: { subs: [{ ...one[0], status: 'done' }] } });
  await expect.poll(async () => (await helperFigures(page)).length).toBe(3);
  await mock.set({ lead: { subs: [many[0], { ...many[1], status: 'done' }, { ...many[2], status: 'done' }, { ...many[3], status: 'done' }] } });
  await expect.poll(async () => (await helperFigures(page)).length).toBe(1);
  // the other themes' helper spots: the kitchen's back line, the workshop's paint table
  await mock.set({ lead: { subs: many }, solo: { subs: one } });
  for (const theme of ['kitchen', 'workshop'] as const) {
    await pickTheme(page, theme);
    await expect.poll(async () => (await helperFigures(page)).length).toBe(4);
    await settledAt([...spots(theme), ...free.map(([x]) => [x, -1.55])]);
  }
  expectNoErrors(errors);
});
