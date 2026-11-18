/**
 * Procedural lofi hip hop. Plays seeded tracks (see track.ts) back to back with cross-fades over a
 * constant bed of vinyl crackle and hiss, with tape wow/flutter on the pitched parts, a gentle
 * ~8 kHz low-pass over the whole music bus and a send into the shared dark reverb.
 */
import type { TrackInfo } from './engine';
import { TrackPlayer, makeTrack, type TrackOuts, type TrackSpec } from './track';
import { makeCrackle, newSeed, noiseLoop, unplug } from './util';

export interface KeyInfo {
  tonic: number; // pitch class 0..11
  minor: boolean;
}

const TICK_MS = 25;
const LOOKAHEAD = 0.12; // seconds scheduled ahead of the audio clock
const HIDDEN_LOOKAHEAD = 1.2; // background tabs may throttle timers to ~1 Hz

export class LofiGenerator {
  private readonly input: GainNode;
  private readonly wetIn: GainNode;
  private readonly wow: GainNode;
  private readonly outs: TrackOuts;
  private readonly fixed: AudioNode[] = [];
  private readonly lfos: OscillatorNode[] = [];
  private crackle: AudioBuffer | null = null;
  private vinyl: { gain: GainNode; srcs: AudioScheduledSourceNode[]; nodes: AudioNode[] } | null = null;
  private cur: TrackPlayer | null = null;
  private spec: TrackSpec | null = null;
  private info: TrackInfo | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private resumeBar = 0;
  private pausedAt = 0;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    reverb: AudioNode,
    private readonly onKick: (time: number, velocity: number) => void,
    private readonly onTrack: (track: TrackInfo, key: KeyInfo) => void = () => {},
  ) {
    const c = ctx;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 32; // sub rumble out
    hp.Q.value = 0.6;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8200; // the "worn tape" top end
    lp.Q.value = 0.4;
    this.input = c.createGain();
    this.input.connect(hp).connect(lp).connect(out);
    this.wetIn = c.createGain();
    this.wetIn.connect(reverb);
    // Wow and flutter as a delay-time signal for each track's tape delay. A delay modulated by
    // depth*sin(2*pi*f*t) shifts pitch by up to 2*pi*f*depth: 0.47 Hz * 0.9 ms ≈ ±4.6 cents of slow
    // wow, 6.3 Hz * 25 µs ≈ ±1.7 cents of flutter.
    this.wow = c.createGain();
    const wow = c.createOscillator();
    wow.frequency.value = 0.47;
    const wowDepth = c.createGain();
    wowDepth.gain.value = 0.0009;
    const flutter = c.createOscillator();
    flutter.frequency.value = 6.3;
    const flutterDepth = c.createGain();
    flutterDepth.gain.value = 0.000025;
    wow.connect(wowDepth).connect(this.wow);
    flutter.connect(flutterDepth).connect(this.wow);
    wow.start();
    flutter.start();
    this.lfos.push(wow, flutter);
    this.fixed.push(hp, lp, this.input, this.wetIn, this.wow, wowDepth, flutterDepth);
    this.outs = { dry: this.input, wet: this.wetIn, wow: this.wow };
  }

  get track(): TrackInfo | null {
    return this.info;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Plays: resumes the paused track where it stopped, or starts `seed` (default: a fresh random track). */
  start(seed?: number): TrackInfo {
    if (seed !== undefined || !this.spec) return this.begin(seed ?? newSeed(), true);
    if (!this.running) this.resume();
    return this.info ?? this.begin(newSeed(), true);
  }

  /** Pauses with a short fade; the track and bar are kept for start(). */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    if (this.cur) {
      this.resumeBar = this.cur.barAt(now);
      this.retire(this.cur, now, 0.08);
      this.cur = null;
    }
    this.pausedAt = Date.now();
    this.stopVinyl();
  }

  /** Cross-fades to a brand-new track; while paused it only queues it. */
  next(): TrackInfo {
    return this.begin(newSeed(), this.running);
  }

  dispose(): void {
    this.stop();
    for (const o of this.lfos) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const n of [...this.lfos, ...this.fixed]) unplug(n);
  }

  private begin(seed: number, play: boolean): TrackInfo {
    const spec = makeTrack(seed);
    this.spec = spec;
    this.resumeBar = 0;
    const now = this.ctx.currentTime;
    let at = now + 0.1;
    if (play) {
      if (this.cur) {
        this.retire(this.cur, now, 0.35); // quick cross-fade when skipping
        at = now + 0.25;
      }
      this.cur = new TrackPlayer(this.ctx, spec, this.outs, this.onKick, 0, at);
      this.startTimer();
      this.startVinyl();
    } else {
      this.pausedAt = Date.now();
    }
    return this.announce(spec, at - now);
  }

  private resume(): void {
    const spec = this.spec;
    if (!spec) return;
    this.cur = new TrackPlayer(this.ctx, spec, this.outs, this.onKick, this.resumeBar, this.ctx.currentTime + 0.08);
    if (this.info) {
      // Keep startedAt meaning "elapsed play time": skip the paused stretch.
      this.info = { ...this.info, startedAt: this.info.startedAt + (Date.now() - this.pausedAt) };
      this.onTrack(this.info, { tonic: spec.tonic, minor: spec.minor });
    }
    this.startTimer();
    this.startVinyl();
  }

  private announce(spec: TrackSpec, delay: number): TrackInfo {
    const info: TrackInfo = { title: spec.title, bpm: spec.bpm, key: spec.key, seed: spec.seed, startedAt: Date.now() + Math.max(0, delay) * 1000 };
    this.info = info;
    this.onTrack(info, { tonic: spec.tonic, minor: spec.minor });
    return info;
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(this.tick, TICK_MS);
    this.tick();
  }

  private readonly tick = (): void => {
    const cur = this.cur;
    if (!cur) return;
    const hidden = typeof document !== 'undefined' && document.hidden;
    cur.schedule(this.ctx.currentTime + (hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD));
    if (cur.done) this.handover(cur);
  };

  /** End of a track: the next one starts exactly on the old one's last bar line, under its fading tail. */
  private handover(old: TrackPlayer): void {
    const spec = makeTrack(newSeed());
    this.spec = spec;
    this.resumeBar = 0;
    const at = old.endTime;
    this.retire(old, at, 0.8);
    this.cur = new TrackPlayer(this.ctx, spec, this.outs, this.onKick, 0, at);
    this.announce(spec, at - this.ctx.currentTime);
    this.cur.schedule(this.ctx.currentTime + LOOKAHEAD);
  }

  /** Fades a player out and frees its nodes once the fade is over (notes still ringing go silent). */
  private retire(p: TrackPlayer, at: number, tau: number): void {
    p.fade(0, at, tau);
    const ms = (Math.max(0, at - this.ctx.currentTime) + tau * 8 + 0.5) * 1000;
    setTimeout(() => p.dispose(), ms);
  }

  private startVinyl(): void {
    if (this.vinyl) return;
    const c = this.ctx;
    const t = c.currentTime;
    this.crackle ??= makeCrackle(c);
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, t, 0.4);
    gain.connect(this.input);
    const crackleG = c.createGain();
    crackleG.gain.value = 0.05;
    const a = c.createBufferSource();
    a.buffer = this.crackle;
    a.loop = true;
    a.start(t);
    // A second, slower copy of the same loop: the two never line up the same way twice.
    const b = c.createBufferSource();
    b.buffer = this.crackle;
    b.loop = true;
    b.playbackRate.value = 0.79;
    b.start(t, 3.1);
    const bG = c.createGain();
    bG.gain.value = 0.6;
    a.connect(crackleG);
    b.connect(bG).connect(crackleG);
    crackleG.connect(gain);
    // Hiss: the shared noise band-limited to a soft "shhh" far under the music.
    const hiss = noiseLoop(c, t);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    const hissG = c.createGain();
    hissG.gain.value = 0.012;
    hiss.connect(hp).connect(lp).connect(hissG).connect(gain);
    this.vinyl = { gain, srcs: [a, b, hiss], nodes: [gain, crackleG, bG, hp, lp, hissG] };
  }

  private stopVinyl(): void {
    const v = this.vinyl;
    if (!v) return;
    this.vinyl = null;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, 0.12);
    setTimeout(() => {
      for (const s of v.srcs) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const n of [...v.srcs, ...v.nodes]) unplug(n);
    }, 1200);
  }
}
