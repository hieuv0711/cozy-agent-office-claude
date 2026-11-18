import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { createStore } from '../lib/store';

// Keeps the scene smooth on any screen and any load. The picture is drawn at
// most at about three million pixels (a 2560-wide window at 1x, or a laptop's
// Retina screen a little under 2x). If frames come too slowly, the resolution
// steps down, but only while that actually helps: when the time goes to the
// processor rather than to pixels (a busy machine), a lower resolution would
// only blur the picture, so it goes back up and stays. It never gives up
// sharpness to chase more than 90 frames a second (on 120 Hz screens), and
// creeps back up when there's room.

/** The most pixels worth drawing per frame. */
const BUDGET = 3.0e6;
const FLOOR = 0.7;
/** Frames per measurement window. */
const WINDOW = 40;
/** The fastest pace worth trading resolution for (90 fps). */
const FASTEST = 1000 / 90;

/** The pixel ratio to start a stage of this size at. */
export function startDpr(width = window.innerWidth, height = window.innerHeight * 0.8) {
  const dev = Math.min(2, window.devicePixelRatio || 1);
  return Math.max(FLOOR, Math.min(dev, Math.sqrt(BUDGET / Math.max(1, width * height))));
}

/**
 * The pixel ratio in use. The Canvas takes its `dpr` from here: the Canvas
 * re-applies its prop whenever it re-renders (about every second), so a fixed
 * prop would undo every adjustment.
 */
export const qualityUi = createStore<{ dpr: number }>({ dpr: typeof window === 'undefined' ? 1 : startDpr() });

export function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const size = useThree((s) => s.size);
  const cap = startDpr(size.width, size.height);
  const st = useRef({
    dpr: cap,
    frames: [] as number[],
    /** The display's frame interval (ms), learned from the quickest steady frames. */
    interval: 1000 / 60,
    bad: 0,
    good: 0,
    cooldown: 3,
    /** After a step down: the frame time before it, to see whether it helped. */
    before: 0,
    /** Stepping down doesn't help (the time isn't in the pixels): leave the resolution alone until then. */
    lockedUntil: 0,
  });

  // a new stage size: never above the new cap (and the Canvas's prop agrees with what's in use)
  useEffect(() => {
    const S = st.current;
    if (S.dpr > cap + 0.01 || S.dpr < FLOOR) S.dpr = cap;
    if (Math.abs(qualityUi.get().dpr - S.dpr) > 0.005) {
      setDpr(S.dpr);
      qualityUi.set({ dpr: S.dpr });
    }
  }, [cap, setDpr]);

  useFrame((_, delta) => {
    const S = st.current;
    if (document.hidden) return;
    S.frames.push(delta * 1000);
    if (S.frames.length < WINDOW) return;
    const sorted = [...S.frames].sort((a, b) => a - b);
    S.frames.length = 0;
    const median = sorted[Math.floor(sorted.length / 2)];
    // the display's pace: the quick end of steady frames (vsync makes it the refresh interval)
    const quick = sorted[Math.floor(sorted.length * 0.15)];
    S.interval += (Math.min(34, Math.max(4, quick)) - S.interval) * 0.25;
    const target = Math.max(S.interval, FASTEST);
    const now = performance.now();
    if (S.cooldown > 0) {
      S.cooldown--;
      return;
    }
    // did the last step down help? if not, the time is elsewhere: put it back
    if (S.before > 0) {
      const helped = median < S.before * 0.9;
      if (!helped) {
        S.dpr = Math.min(cap, S.dpr / 0.85);
        setDpr(S.dpr);
        qualityUi.set({ dpr: S.dpr });
        S.lockedUntil = now + 30_000;
        S.cooldown = 2;
      }
      S.before = 0;
      return;
    }
    if (median > target * 1.25) {
      S.bad++;
      S.good = 0;
    } else if (median < target * 0.8) {
      S.good++;
      S.bad = 0;
    } else {
      S.bad = 0;
      S.good = 0;
    }
    if (S.bad >= 2 && S.dpr > FLOOR + 0.01 && now > S.lockedUntil) {
      S.before = median;
      S.dpr = Math.max(FLOOR, S.dpr * 0.85);
      setDpr(S.dpr);
      qualityUi.set({ dpr: S.dpr });
      S.bad = 0;
      S.cooldown = 2;
    } else if (S.good >= 8 && S.dpr < cap - 0.01) {
      S.dpr = Math.min(cap, S.dpr * 1.08);
      setDpr(S.dpr);
      qualityUi.set({ dpr: S.dpr });
      S.good = 0;
      S.cooldown = 2;
    }
  });
  return null;
}
