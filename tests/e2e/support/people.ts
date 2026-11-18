import { expect, type Page } from '@playwright/test';
import { crew, type CrewEntry } from './app';

// Reading people off the scene: every person is a group named `person:<outfit>`
// (chef, office, maker, diner), its torso mesh is named `torso:<garment>`
// (`torso:rain` for a rain jacket), and the weather's extras are named `hood`,
// `scarf` and `beanie`, the hats `hat:<kind>`, what they hold `held:<act>`.

type W = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Figure {
  outfit: string;
  torso: string;
  hood: boolean;
  scarf: boolean;
  beanie: boolean;
  hat: string;
  umbrella: boolean;
  /** Drawn (faded in, in the room): customers fade in and out at the street. */
  shown: boolean;
}

/** Everyone in the scene, as they're dressed right now. */
export async function figures(page: Page): Promise<Figure[]> {
  return page.evaluate(() => {
    const out: W[] = [];
    (window as W).__ao.scene.traverse((o: W) => {
      if (typeof o.name !== 'string' || !o.name.startsWith('person:')) return;
      const f: W = { outfit: o.name.slice(7), torso: '', hood: false, scarf: false, beanie: false, hat: '', umbrella: false, shown: true };
      let s = o;
      while (s) {
        if (!s.visible) f.shown = false;
        s = s.parent;
      }
      o.traverse((c: W) => {
        if (c.name?.startsWith('torso:')) f.torso = c.name.slice(6);
        if (c.name === 'hood') f.hood = true;
        if (c.name === 'scarf') f.scarf = true;
        if (c.name === 'beanie') f.beanie = true;
        if (c.name?.startsWith('hat:')) f.hat = c.name.slice(4);
        if (c.name === 'held:umbrella') f.umbrella = c.visible;
      });
      out.push(f);
    });
    return out as Figure[];
  });
}

/** The kitchen's dining floor (window.__dining). */
export async function dining(page: Page) {
  return page.evaluate(() => {
    const d = (window as W).__dining;
    return {
      customers: (d.customers as W[]).map((c) => ({ phase: c.phase as string, served: !!c.served, seat: c.seat as number, for: c.for as string, eatFor: c.eatFor as number })),
      bowls: (d.bowls as W[]).length,
      hasWaiter: 'waiter' in d,
    };
  });
}

/** Waits until a person's state passes a check. */
export async function until(page: Page, name: string, ok: (c: CrewEntry) => boolean, what: string, timeout = 20_000) {
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
