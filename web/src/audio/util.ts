/**
 * Shared DSP helpers: seeded randomness, pitch maths, node clean-up and the few generated
 * buffers everything reuses (one noise buffer, one reverb impulse, one vinyl crackle loop).
 * Nothing here loads files or touches the network.
 */

export type Rand = () => number;

/** mulberry32: a tiny seeded PRNG, so the same seed always rebuilds the same track. */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes numbers into one 32-bit seed (per-bar / per-section randomness stays reproducible). */
export function mix(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}

export function newSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

export class Rng {
  readonly next: Rand;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  /** Integer in [lo, hi], both inclusive. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length) % items.length];
  }
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of items) total += w;
    let r = this.next() * total;
    for (const [v, w] of items) {
      r -= w;
      if (r <= 0) return v;
    }
    return items[items.length - 1][0];
  }
  /** Bell-shaped jitter in [-amount, amount] (sum of two uniforms): humans cluster near the grid. */
  jitter(amount: number): number {
    return (this.next() + this.next() - 1) * amount;
  }
}

export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Disconnects a voice's nodes once its longest-lived source has ended, so finished notes can be collected. */
export function release(last: AudioScheduledSourceNode, nodes: readonly AudioNode[]): void {
  last.onended = () => {
    last.disconnect();
    for (const n of nodes) n.disconnect();
  };
}

/** Disconnect that never throws (an AudioParam connection may already be gone). */
export function unplug(from: AudioNode, to?: AudioParam): void {
  try {
    if (to) from.disconnect(to);
    else from.disconnect();
  } catch {
    /* already disconnected */
  }
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** The one shared white-noise buffer (4 s, mono). Every hat, snare, click, rain bed and hiss slices it. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    const len = Math.floor(ctx.sampleRate * 4);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** A one-shot slice of the shared noise from a random offset, so repeated hits never sound identical. */
export function noiseBurst(ctx: BaseAudioContext, t: number, dur: number): AudioBufferSourceNode {
  const buf = noiseBuffer(ctx);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const d = Math.min(dur, buf.duration - 0.05);
  src.start(t, Math.random() * (buf.duration - d - 0.02), d);
  return src;
}

/** A looping noise source for beds (rain, hiss, city rumble). */
export function noiseLoop(ctx: BaseAudioContext, t: number, rate = 1): AudioBufferSourceNode {
  const buf = noiseBuffer(ctx);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = rate;
  src.start(t, Math.random() * buf.duration);
  return src;
}

/**
 * Generated stereo reverb impulse: decaying noise, -60 dB at `t60`. It is "dark" because a
 * one-pole low-pass closes over the tail (about 4.5 kHz down to 350 Hz), so highs die first
 * like in a soft, furnished room. Channels use independent noise for width.
 */
export function makeImpulse(ctx: BaseAudioContext, t60 = 2.1): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * t60);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.014); // short pre-delay keeps the dry attack clear
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let a = 0;
    let norm = 1;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const x = t / t60;
      if (((i - pre) & 63) === 0) {
        const fc = 4500 * Math.pow(350 / 4500, Math.min(1, x * 1.3));
        a = Math.exp((-2 * Math.PI * fc) / sr);
        norm = Math.sqrt((1 + a) / (1 - a)); // undo the filter's level loss: only `env` shapes loudness
      }
      lp = a * lp + (1 - a) * (Math.random() * 2 - 1);
      const env = Math.exp(-6.9 * x) * Math.min(1, t / 0.025); // soft 25 ms onset, no "slap"
      d[i] = lp * norm * env;
    }
  }
  return buf;
}

/**
 * A pre-rendered vinyl crackle loop (stereo, ~7 s): sparse Poisson ticks, mostly tiny with a few
 * pops and the odd burst, rounded off by a low-pass so they sound dusty rather than digital.
 * Rendering it once and looping costs far less CPU than scheduling every click as nodes.
 */
export function makeCrackle(ctx: BaseAudioContext, seconds = 7.3): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const rnd = mulberry32(0x5eed1e);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let t = rnd() * 0.2;
    while (t < seconds - 0.05) {
      const burst = rnd() < 0.15 ? 2 + Math.floor(rnd() * 4) : 1;
      let bt = t;
      for (let k = 0; k < burst; k++) {
        const amp = 0.1 + 0.9 * Math.pow(rnd(), 4);
        const tau = (0.00008 + rnd() * 0.0004) * sr;
        const i0 = Math.floor(bt * sr);
        const n = Math.min(len - i0, Math.ceil(tau * 5));
        for (let i = 0; i < n; i++) d[i0 + i] += amp * Math.exp(-i / tau) * (rnd() * 2 - 1);
        bt += 0.001 + rnd() * 0.005;
      }
      t += -Math.log(1 - rnd()) / 9; // ~9 events per second
    }
    let lp = 0;
    let peak = 1e-9;
    for (let i = 0; i < len; i++) {
      lp += 0.45 * (d[i] - lp);
      d[i] = lp;
      peak = Math.max(peak, Math.abs(lp));
    }
    for (let i = 0; i < len; i++) d[i] /= peak;
  }
  return buf;
}
