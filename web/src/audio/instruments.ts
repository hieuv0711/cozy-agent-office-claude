/**
 * Synth voices. Each call builds a few short-lived nodes for one note, schedules it at `t`
 * (AudioContext time) and disconnects everything when the note has finished.
 */
import { clamp, midiHz, noiseBurst, release } from './util';

type Ctx = BaseAudioContext;

function filter(ctx: Ctx, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/**
 * Electric piano (Rhodes-like FM). A 1:1 sine modulator gives the warm "bark" whose brightness
 * (modulation index) dies away in ~0.3 s; a quiet 14:1 modulator adds the tine's metallic ping for
 * the first few tens of milliseconds. Low notes get more index (they growl), high notes less.
 */
export function epiano(ctx: Ctx, dest: AudioNode, t: number, midi: number, dur: number, vel: number, bright = 1): void {
  const f = midiHz(midi);
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const tine = ctx.createOscillator();
  const modG = ctx.createGain();
  const tineG = ctx.createGain();
  const amp = ctx.createGain();
  car.frequency.value = f;
  car.detune.value = (Math.random() * 2 - 1) * 4; // a few cents of spread: a natural chorus between notes
  mod.frequency.value = f * 1.0006; // tiny offset makes the timbre slowly "breathe" like a real tine
  tine.frequency.value = f * 14;
  const reg = clamp(1.3 - (midi - 48) / 36, 0.4, 1.3);
  const index = (0.6 + 1.1 * vel) * bright * reg;
  modG.gain.setValueAtTime(index * f, t);
  modG.gain.setTargetAtTime(index * f * 0.22, t, 0.22);
  tineG.gain.setValueAtTime(0.05 * vel * reg * 14 * f, t);
  tineG.gain.setTargetAtTime(0, t, 0.018);
  const peak = 0.1 * vel;
  const end = t + Math.max(0.08, dur);
  const ring = 0.9 + 2.2 * clamp((84 - midi) / 36, 0, 1); // low notes ring longer
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.009); // soft attack, no click
  amp.gain.setTargetAtTime(peak * 0.55, t + 0.009, 0.12);
  if (end > t + 0.35) amp.gain.setTargetAtTime(0, t + 0.35, ring);
  amp.gain.setTargetAtTime(0, end, 0.22); // long, gentle release when the key lifts
  mod.connect(modG).connect(car.frequency);
  tine.connect(tineG).connect(car.frequency);
  car.connect(amp).connect(dest);
  const stop = end + 1.4;
  car.start(t);
  mod.start(t);
  tine.start(t);
  car.stop(stop);
  mod.stop(stop);
  tine.stop(t + 0.3);
  release(car, [mod, tine, modG, tineG, amp]);
}

/** Partial of a struck bar: [frequency ratio, level, decay time constant (s)]. */
export type Partial = readonly [number, number, number];

/** Cantilever tine: soft fundamental plus the inharmonic 6.27x "tink" that dies almost at once. */
export const KALIMBA: readonly Partial[] = [[1, 1, 0.36], [6.27, 0.22, 0.04], [2, 0.06, 0.12]];
/** Tuned wooden bar: fundamental, the 4x partial a marimba is tuned for, a faint 10x. */
export const MARIMBA: readonly Partial[] = [[1, 1, 0.24], [4, 0.3, 0.05], [9.9, 0.05, 0.014]];
/** Small singing bowl / soft desk bell: inharmonic plate modes with long decays. */
export const BELL: readonly Partial[] = [[1, 1, 1.1], [2.76, 0.3, 0.42], [5.4, 0.1, 0.17], [8.93, 0.035, 0.07]];

export interface MalletOpts {
  attack?: number; // seconds
  decay?: number; // multiplies every partial's decay
  click?: number; // level of a tiny mallet/finger noise
  beat?: number; // Hz: a detuned twin of the fundamental for a slow, bell-like shimmer
}

/** Additive struck/plucked voice used for kalimba, marimba and bells. */
export function mallet(ctx: Ctx, dest: AudioNode, t: number, freq: number, vel: number, partials: readonly Partial[], o: MalletOpts = {}): void {
  const out = ctx.createGain();
  out.gain.value = 0.16 * vel; // vel 1 peaks around -16 dBFS before the buses
  out.connect(dest);
  const nodes: AudioNode[] = [out];
  const att = o.attack ?? 0.002;
  const dk = o.decay ?? 1;
  const list: Partial[] = [...partials];
  if (o.beat) list.push([1 + o.beat / freq, 0.45, partials[0][2]]);
  let last: AudioScheduledSourceNode | null = null;
  let lastStop = 0;
  for (const [ratio, level, tau] of list) {
    const f = freq * ratio;
    if (f > 15000) continue;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + att);
    g.gain.setTargetAtTime(0, t + att, tau * dk);
    osc.connect(g).connect(out);
    const stop = t + att + tau * dk * 7; // about -60 dB
    osc.start(t);
    osc.stop(stop);
    nodes.push(osc, g);
    if (stop > lastStop) {
      lastStop = stop;
      last = osc;
    }
  }
  if (o.click) {
    const n = noiseBurst(ctx, t, 0.012);
    const bp = filter(ctx, 'bandpass', Math.min(9000, freq * 3), 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.click, t);
    g.gain.setTargetAtTime(0, t, 0.003);
    n.connect(bp).connect(g).connect(out);
    nodes.push(n, bp, g);
  }
  if (last) release(last, nodes);
}

/** Round bass: sine plus a little triangle for definition on small speakers. */
export function bass(ctx: Ctx, dest: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  const f = midiHz(midi);
  const sine = ctx.createOscillator();
  const tri = ctx.createOscillator();
  const triG = ctx.createGain();
  const amp = ctx.createGain();
  sine.frequency.value = f;
  tri.type = 'triangle';
  tri.frequency.value = f;
  triG.gain.value = 0.3; // odd harmonics so the line still reads on laptop speakers
  const peak = 0.3 * vel;
  const end = t + Math.max(0.1, dur);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.012);
  amp.gain.setTargetAtTime(peak * 0.7, t + 0.012, 0.3);
  amp.gain.setTargetAtTime(0, end, 0.045);
  sine.connect(amp);
  tri.connect(triG).connect(amp);
  amp.connect(dest);
  sine.start(t);
  tri.start(t);
  sine.stop(end + 0.35);
  tri.stop(end + 0.35);
  release(sine, [tri, triG, amp]);
}

/** Breathy flute-ish lead: sine + soft triangle, delayed vibrato and a puff of noise at the start. */
export function flute(ctx: Ctx, dest: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  const f = midiHz(midi);
  const sine = ctx.createOscillator();
  const tri = ctx.createOscillator();
  const triG = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoG = ctx.createGain();
  const amp = ctx.createGain();
  sine.frequency.value = f;
  tri.type = 'triangle';
  tri.frequency.value = f;
  triG.gain.value = 0.25;
  lfo.frequency.value = 4.8 + Math.random() * 0.8;
  lfoG.gain.setValueAtTime(0, t);
  lfoG.gain.setValueAtTime(0, t + 0.15);
  lfoG.gain.linearRampToValueAtTime(9, t + 0.6); // vibrato blooms after the attack, in cents
  lfo.connect(lfoG);
  lfoG.connect(sine.detune);
  lfoG.connect(tri.detune);
  const peak = 0.1 * vel;
  const end = t + Math.max(0.1, dur);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.06);
  amp.gain.setTargetAtTime(peak * 0.82, t + 0.06, 0.25);
  amp.gain.setTargetAtTime(0, end, 0.09);
  sine.connect(amp);
  tri.connect(triG).connect(amp);
  amp.connect(dest);
  const breath = noiseBurst(ctx, t, 0.12);
  const bp = filter(ctx, 'bandpass', Math.min(6000, f * 2.2), 0.9);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.02 * vel, t);
  bg.gain.setTargetAtTime(0, t + 0.02, 0.035);
  breath.connect(bp).connect(bg).connect(dest);
  const stop = end + 0.6;
  for (const o of [sine, tri, lfo]) {
    o.start(t);
    o.stop(stop);
  }
  release(sine, [tri, triG, lfo, lfoG, amp, breath, bp, bg]);
}

/** Soft kick: sine sweeping ~110 to 46 Hz with a short body and a dull 6 ms click. */
export function kick(ctx: Ctx, dest: AudioNode, t: number, vel: number): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(112, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.55 * vel, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.03, 0.085);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.7);
  const n = noiseBurst(ctx, t, 0.008);
  const lp = filter(ctx, 'lowpass', 2200);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.12 * vel, t);
  ng.gain.setTargetAtTime(0, t, 0.002);
  n.connect(lp).connect(ng).connect(dest);
  release(o, [g, n, lp, ng]);
}

/** Low tom for fills: the kick's recipe, higher and longer. */
export function tom(ctx: Ctx, dest: AudioNode, t: number, vel: number, high: boolean): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f0 = high ? 190 : 150;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.18);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.28 * vel, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.02, 0.11);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.8);
  release(o, [g]);
}

/**
 * Lofi snare or rim: band-passed noise burst plus a 180-220 Hz triangle body, low-passed so it is
 * soft rather than crisp. `send` takes a little of it to the reverb.
 */
export function snare(ctx: Ctx, dest: AudioNode, send: AudioNode, t: number, vel: number, rim: boolean): void {
  const n = noiseBurst(ctx, t, rim ? 0.07 : 0.28);
  const bp = filter(ctx, 'bandpass', rim ? 2500 : 1800, rim ? 1.6 : 0.8);
  const lp = filter(ctx, 'lowpass', rim ? 6000 : 4200, 0.5);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime((rim ? 0.22 : 0.3) * vel, t + 0.002);
  ng.gain.setTargetAtTime(0, t + 0.004, rim ? 0.014 : 0.055);
  n.connect(bp).connect(lp).connect(ng);
  ng.connect(dest);
  ng.connect(send);
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(rim ? 220 : 200, t);
  o.frequency.exponentialRampToValueAtTime(rim ? 192 : 168, t + 0.06);
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime((rim ? 0.12 : 0.16) * vel, t + 0.002);
  og.gain.setTargetAtTime(0, t + 0.004, rim ? 0.018 : 0.035);
  o.connect(og).connect(dest);
  o.start(t);
  o.stop(t + 0.4);
  release(o, [og, n, bp, lp, ng]);
}

/** Hi-hat: high-passed noise, closed (tight) or open (a short wash). */
export function hat(ctx: Ctx, dest: AudioNode, t: number, vel: number, open: boolean): void {
  const n = noiseBurst(ctx, t, open ? 0.5 : 0.08);
  const hp = filter(ctx, 'highpass', 6800, 0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime((open ? 0.09 : 0.12) * vel, t + 0.001);
  g.gain.setTargetAtTime(0, t + 0.002, open ? 0.11 : 0.016);
  n.connect(hp).connect(g).connect(dest);
  release(n, [hp, g]);
}

/** One soft mechanical key: a filtered noise tick plus a tiny low "thock". `tone` < 1 is deeper (space bar). */
export function keyClick(ctx: Ctx, dest: AudioNode, t: number, vel: number, tone = 1): void {
  const n = noiseBurst(ctx, t, 0.02);
  const bp = filter(ctx, 'bandpass', (2400 + Math.random() * 1800) * tone, 1.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.0007);
  g.gain.setTargetAtTime(0, t + 0.001, 0.005);
  n.connect(bp).connect(g).connect(dest);
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.frequency.value = (170 + Math.random() * 70) * tone;
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime(0.05 * vel, t + 0.001);
  og.gain.setTargetAtTime(0, t + 0.002, 0.012);
  o.connect(og).connect(dest);
  o.start(t);
  o.stop(t + 0.08);
  release(o, [og, n, bp, g]);
}
