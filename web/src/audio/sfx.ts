/**
 * Soft "indie" event sounds: kalimba, marimba and bell plucks tuned to the music's pentatonic
 * scale (C major pentatonic until a track has played), so they sit on top of the music instead of
 * fighting it. Every sound is rate-limited, so bursts of events never pile up.
 */
import { BELL, KALIMBA, MARIMBA, keyClick, mallet } from './instruments';
import { midiHz, noiseBurst, release } from './util';

const PENTA = [0, 2, 4, 7, 9];
const KEYS_PER_SECOND = 12;

export class Sfx {
  private home = 0; // pitch class of the major-pentatonic "do"
  private readonly last = new Map<string, number>();
  private tokens = KEYS_PER_SECOND;
  private tokenAt = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly wet: AudioNode,
  ) {}

  /** Follow the music: the key's major pentatonic (the relative major's when the key is minor). */
  setKey(tonic: number, minor: boolean): void {
    this.home = (((minor ? tonic + 3 : tonic) % 12) + 12) % 12;
  }

  /** Rising 3-note kalimba motif plus a soft shimmer: "someone needs you", never an alarm. */
  needsYou(): boolean {
    if (!this.gate('needsYou', 5)) return false;
    const t = this.now();
    const o = this.voice(0, 0.35, 5);
    [2, 3, 5].forEach((deg, i) => mallet(this.ctx, o, t + i * 0.13, this.hz(deg), 0.75 + i * 0.1, KALIMBA, { click: 0.2 }));
    [2, 3, 5].forEach((deg, i) => mallet(this.ctx, o, t + 0.3 + i * 0.05, this.hz(deg + 5), 0.12, BELL, { attack: 0.12, decay: 0.6 }));
    return true;
  }

  /** Café door bell: ding (3rd) then dong (home). */
  arrive(): boolean {
    if (!this.gate('arrive', 0.6)) return false;
    const t = this.now();
    const o = this.voice(-0.2, 0.4, 5);
    mallet(this.ctx, o, t, this.hz(2), 0.55, BELL, { decay: 0.55, beat: 2.5 });
    mallet(this.ctx, o, t + 0.26, this.hz(0), 0.5, BELL, { decay: 0.6, beat: 2 });
    return true;
  }

  /** The door bell in reverse, softer: someone slipping out. */
  leave(): boolean {
    if (!this.gate('leave', 0.6)) return false;
    const t = this.now();
    const o = this.voice(0.2, 0.4, 5);
    mallet(this.ctx, o, t, this.hz(0), 0.35, BELL, { decay: 0.5, beat: 2 });
    mallet(this.ctx, o, t + 0.24, this.hz(2), 0.3, BELL, { decay: 0.5, beat: 2.5 });
    return true;
  }

  /** A small bubbly "bloop" for a new helper bot: two quick upward sine chirps landing on scale notes. */
  spawn(): boolean {
    if (!this.gate('spawn', 0.12)) return false;
    const t = this.now();
    const o = this.voice((Math.random() * 2 - 1) * 0.4, 0.15, 1);
    const deg = 3 + Math.floor(Math.random() * 5);
    this.bubble(o, t, this.hz(deg), 0.11);
    this.bubble(o, t + 0.055, this.hz(deg + 2), 0.06);
    return true;
  }

  /** Warm 4-note marimba arpeggio up to the octave. */
  success(): boolean {
    if (!this.gate('success', 1)) return false;
    const t = this.now();
    const o = this.voice(0.1, 0.3, 3.5);
    [0, 2, 3, 5].forEach((deg, i) => mallet(this.ctx, o, t + i * 0.085, this.hz(deg - 5), 0.6 + i * 0.08, MARIMBA, { click: 0.25, decay: i === 3 ? 1.6 : 1 }));
    return true;
  }

  /** A low, soft, muted thud with a minor second on top: "hm, that didn't work", not an alarm. */
  fail(): boolean {
    if (!this.gate('fail', 1)) return false;
    const c = this.ctx;
    const t = this.now();
    const o = this.voice(0, 0.12, 2, 1200);
    const thud = c.createOscillator();
    const g = c.createGain();
    thud.frequency.setValueAtTime(95, t);
    thud.frequency.exponentialRampToValueAtTime(58, t + 0.14);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.005);
    g.gain.setTargetAtTime(0, t + 0.02, 0.07);
    thud.connect(g).connect(o);
    thud.start(t);
    thud.stop(t + 0.5);
    release(thud, [g]);
    const low = this.midi(-10); // home, two octaves down
    mallet(c, o, t + 0.03, midiHz(low), 0.45, MARIMBA, { decay: 0.45 });
    mallet(c, o, t + 0.03, midiHz(low + 1), 0.38, MARIMBA, { decay: 0.45 });
    return true;
  }

  /** `count` soft mechanical key clicks over ~0.6 s; at most ~12 clicks per second overall. */
  keys(count = 6): boolean {
    const nowMs = performance.now();
    this.tokens = Math.min(KEYS_PER_SECOND, this.tokens + ((nowMs - this.tokenAt) / 1000) * KEYS_PER_SECOND);
    this.tokenAt = nowMs;
    const n = Math.min(Math.max(1, Math.round(count) || 1), Math.floor(this.tokens));
    if (n <= 0) return false;
    this.tokens -= n;
    const t = this.now();
    const o = this.voice((Math.random() * 2 - 1) * 0.35, 0.05, 1.5);
    const times = Array.from({ length: n }, () => Math.random() * 0.6).sort((a, b) => a - b);
    let prev = -1;
    for (const dt of times) {
      const at = Math.max(dt, prev + 0.035);
      prev = at;
      keyClick(this.ctx, o, t + at, 0.5 + Math.random() * 0.4, 0.9 + Math.random() * 0.2);
    }
    return true;
  }

  /**
   * Cat purr (~1.5 s): low-passed noise pulsed ~25 times a second by an inverted sawtooth (sharp
   * onset, soft decay per pulse); a longer exhale, a tiny pause, then a softer, slower inhale.
   */
  purr(): boolean {
    if (!this.gate('purr', 3)) return false;
    const c = this.ctx;
    const t = this.now();
    const o = this.voice(0.1, 0.06, 2.5);
    const src = noiseBurst(c, t, 1.7);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    lp.Q.value = 0.8;
    const am = c.createGain();
    am.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.setValueAtTime(25, t);
    lfo.frequency.setValueAtTime(22, t + 0.85);
    const depth = c.createGain();
    depth.gain.value = -0.5;
    lfo.connect(depth).connect(am.gain);
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1.4, t + 0.1);
    env.gain.linearRampToValueAtTime(1.2, t + 0.7);
    env.gain.linearRampToValueAtTime(0.1, t + 0.82);
    env.gain.linearRampToValueAtTime(0.9, t + 0.95);
    env.gain.linearRampToValueAtTime(0.8, t + 1.4);
    env.gain.linearRampToValueAtTime(0, t + 1.6);
    src.connect(lp).connect(am).connect(env).connect(o);
    lfo.start(t);
    lfo.stop(t + 1.7);
    release(lfo, [src, lp, am, depth, env]);
    return true;
  }

  /** One soft desk bell with a slow shimmer (Pomodoro). */
  bell(): boolean {
    if (!this.gate('bell', 1)) return false;
    const o = this.voice(0, 0.45, 8);
    mallet(this.ctx, o, this.now(), this.hz(0), 0.85, BELL, { beat: 1.3, click: 0.05 });
    return true;
  }

  private bubble(dest: AudioNode, t: number, f: number, level: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(f * 0.45, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.03, 0.035);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.3);
    release(osc, [g]);
  }

  /** A per-sound strip: optional low-pass, pan, dry to the sfx bus and a reverb send; unplugged after `life` s. */
  private voice(pan: number, wet: number, life: number, lowpass = 0): GainNode {
    const c = this.ctx;
    const input = c.createGain();
    const p = c.createStereoPanner();
    p.pan.value = pan;
    const send = c.createGain();
    send.gain.value = wet;
    const nodes: AudioNode[] = [input, p, send];
    let head: AudioNode = input;
    if (lowpass) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      input.connect(f);
      head = f;
      nodes.push(f);
    }
    head.connect(p).connect(this.out);
    head.connect(send).connect(this.wet);
    setTimeout(() => {
      for (const n of nodes) n.disconnect();
    }, (life + 1) * 1000);
    return input;
  }

  private now(): number {
    return this.ctx.currentTime + 0.01;
  }

  /** Pentatonic degree to MIDI: 0 is "do" near C5, 5 is an octave up, negatives go down. */
  private midi(deg: number): number {
    const o = Math.floor(deg / 5);
    const base = 72 + (this.home > 6 ? this.home - 12 : this.home);
    return base + 12 * o + PENTA[deg - o * 5];
  }

  private hz(deg: number): number {
    return midiHz(this.midi(deg));
  }

  private gate(name: string, gapSeconds: number): boolean {
    const now = performance.now();
    if (now - (this.last.get(name) ?? -Infinity) < gapSeconds * 1000) return false;
    this.last.set(name, now);
    return true;
  }
}
