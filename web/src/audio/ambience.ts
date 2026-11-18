/**
 * Background ambience built from the shared noise buffer: rain (a filtered bed plus drops), a
 * distant city (low rumble plus the odd passing car) and typing (Poisson-timed key clicks).
 * The weather adds to it: the rain bed in the rain and a soft wind for snow (a clear night or a
 * sunny day add nothing). Everything is quiet by default and fades in and out over about two
 * seconds. The engine turns all of it off when the user turns room sounds off.
 */
import { keyClick } from './instruments';
import { clamp, noiseBurst, noiseLoop, release, unplug } from './util';

/** The weather outside, as far as the ambience cares (the same names as the scene's weather). */
export type WeatherSound = 'clear' | 'sunny' | 'rain' | 'snow';

interface Bed {
  gain: GainNode;
  srcs: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  off: ReturnType<typeof setTimeout> | null;
}

const TICK_MS = 60;
const expo = (rate: number): number => -Math.log(1 - Math.random()) / rate; // Poisson inter-arrival time

export class Ambience {
  private rain: Bed | null = null;
  private wind: Bed | null = null;
  private city: Bed | null = null;
  private rainOn = false;
  private rainPlaying = false;
  private windOn = false;
  private weather: WeatherSound = 'clear';
  private cityOn = false;
  private kps = 0;
  private readonly typing: GainNode;
  private readonly typingPan: StereoPannerNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextDrop = 0;
  private nextCar = 0;
  private nextKey = 0;
  private keysInWord = 4;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {
    this.typing = ctx.createGain();
    this.typing.gain.value = 0.55;
    this.typingPan = ctx.createStereoPanner();
    this.typingPan.pan.value = 0.15;
    this.typing.connect(this.typingPan).connect(out);
  }

  /** The plain rain loop on or off. It also plays whenever the weather is rain. */
  setRain(on: boolean): void {
    if (on === this.rainOn) return;
    this.rainOn = on;
    this.syncWeather();
  }

  /** The weather outside: rain plays the rain loop, snow a soft wind; a clear night or a sunny day nothing extra. */
  setWeather(w: WeatherSound): void {
    const next: WeatherSound = w === 'rain' || w === 'snow' || w === 'sunny' ? w : 'clear';
    if (next === this.weather) return;
    this.weather = next;
    this.syncWeather();
  }

  setCity(on: boolean): void {
    if (on === this.cityOn) return;
    this.cityOn = on;
    if (on) {
      this.city ??= this.makeCity();
      this.fadeIn(this.city);
      this.nextCar = this.ctx.currentTime + 3 + Math.random() * 8;
    } else if (this.city) {
      const bed = this.city;
      this.fadeOut(bed, () => {
        if (this.city === bed) this.city = null;
      });
    }
    this.syncTimer();
  }

  /** Average key presses per second (Poisson timing); 0 turns typing off. */
  setTyping(keysPerSecond: number): void {
    const kps = clamp(Number.isFinite(keysPerSecond) ? keysPerSecond : 0, 0, 20);
    if (kps > 0 && this.kps === 0) this.nextKey = this.ctx.currentTime + 0.05;
    this.kps = kps;
    this.syncTimer();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const bed of [this.rain, this.wind, this.city]) if (bed) this.kill(bed);
    this.rain = this.wind = this.city = null;
    unplug(this.typing);
    unplug(this.typingPan);
  }

  /** Brings the rain and wind beds in line with setRain() and setWeather(). */
  private syncWeather(): void {
    const w = this.weather;
    const rain = this.rainOn || w === 'rain';
    if (rain !== this.rainPlaying) {
      this.rainPlaying = rain;
      if (rain) {
        this.rain ??= this.makeRain();
        this.fadeIn(this.rain);
        this.nextDrop = this.ctx.currentTime + 0.3;
      } else if (this.rain) {
        const bed = this.rain;
        this.fadeOut(bed, () => {
          if (this.rain === bed) this.rain = null;
        });
      }
    }
    const wind = w === 'snow';
    if (wind !== this.windOn) {
      this.windOn = wind;
      if (wind) {
        this.wind ??= this.makeWind();
        this.fadeIn(this.wind);
      } else if (this.wind) {
        const bed = this.wind;
        this.fadeOut(bed, () => {
          if (this.wind === bed) this.wind = null;
        });
      }
    }
    this.syncTimer();
  }

  private syncTimer(): void {
    const active = this.rainPlaying || this.cityOn || this.kps > 0;
    if (active && !this.timer) this.timer = setInterval(this.tick, TICK_MS);
    else if (!active && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private readonly tick = (): void => {
    const now = this.ctx.currentTime;
    const horizon = now + (typeof document !== 'undefined' && document.hidden ? 1.2 : 0.2);
    if (this.rainPlaying) {
      if (this.nextDrop < now) this.nextDrop = now + 0.02;
      while (this.nextDrop < horizon) {
        this.drop(this.nextDrop);
        this.nextDrop += expo(6);
      }
    }
    if (this.cityOn) {
      if (this.nextCar < now) this.nextCar = now + 2 + Math.random() * 6;
      while (this.nextCar < horizon) {
        this.car(this.nextCar);
        this.nextCar += 7 + Math.random() * 16;
      }
    }
    if (this.kps > 0) {
      if (this.nextKey < now) this.nextKey = now + 0.02;
      while (this.nextKey < horizon) {
        this.key(this.nextKey);
        this.nextKey += Math.max(0.045, expo(this.kps)); // nobody types faster than ~22 keys/s
      }
    }
  };

  private fadeIn(bed: Bed): void {
    if (bed.off) clearTimeout(bed.off);
    bed.off = null;
    const t = this.ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(t);
    bed.gain.gain.setTargetAtTime(1, t, 0.6); // ~2 s to full
  }

  private fadeOut(bed: Bed, done: () => void): void {
    const t = this.ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(t);
    bed.gain.gain.setTargetAtTime(0, t, 0.6);
    if (bed.off) clearTimeout(bed.off);
    bed.off = setTimeout(() => {
      this.kill(bed);
      done();
    }, 3500);
  }

  private kill(bed: Bed): void {
    if (bed.off) clearTimeout(bed.off);
    bed.off = null;
    for (const s of bed.srcs) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const n of [...bed.srcs, ...bed.nodes]) unplug(n);
  }

  private filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  private gainNode(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  /** Rain bed: two decorrelated copies of the noise (different start and speed) spread left and right. */
  private makeRain(): Bed {
    const c = this.ctx;
    const t = c.currentTime;
    const gain = this.gainNode(0);
    gain.connect(this.out);
    const bed = this.gainNode(0.35);
    const a = noiseLoop(c, t, 1);
    const b = noiseLoop(c, t, 0.89);
    const pa = c.createStereoPanner();
    pa.pan.value = -0.6;
    const pb = c.createStereoPanner();
    pb.pan.value = 0.6;
    const hp = this.filter('highpass', 380, 0.5);
    const lp = this.filter('lowpass', 2600, 0.5);
    a.connect(pa).connect(hp);
    b.connect(pb).connect(hp);
    hp.connect(lp).connect(bed).connect(gain);
    const sizzle = this.filter('highpass', 5200); // rain on glass
    const sizzleG = this.gainNode(0.035);
    hp.connect(sizzle).connect(sizzleG).connect(gain);
    const lfo = c.createOscillator(); // slow swells in intensity
    lfo.frequency.value = 0.06;
    const lfoG = this.gainNode(0.1);
    lfo.connect(lfoG).connect(bed.gain);
    lfo.start(t);
    return { gain, srcs: [a, b, lfo], nodes: [gain, bed, pa, pb, hp, lp, sizzle, sizzleG, lfoG], off: null };
  }

  /** Snow: a soft wind, a band of dark noise whose pitch and level drift on slow cycles. */
  private makeWind(): Bed {
    const c = this.ctx;
    const t = c.currentTime;
    const gain = this.gainNode(0);
    gain.connect(this.out);
    const src = noiseLoop(c, t, 0.5);
    const bp = this.filter('bandpass', 330, 0.9);
    const lp = this.filter('lowpass', 900, 0.5);
    const bed = this.gainNode(0.2);
    const pan = c.createStereoPanner();
    pan.pan.value = -0.2;
    src.connect(bp).connect(lp).connect(bed).connect(pan).connect(gain);
    const pitch = c.createOscillator(); // the wind rising and falling in pitch
    pitch.frequency.value = 0.052;
    const pitchG = this.gainNode(110);
    pitch.connect(pitchG).connect(bp.frequency);
    const swell = c.createOscillator(); // and in strength, on an unrelated cycle
    swell.frequency.value = 0.037;
    const swellG = this.gainNode(0.11);
    swell.connect(swellG).connect(bed.gain);
    const drift = c.createOscillator(); // moving a little across the window
    drift.frequency.value = 0.021;
    const driftG = this.gainNode(0.35);
    drift.connect(driftG).connect(pan.pan);
    pitch.start(t);
    swell.start(t);
    drift.start(t);
    return { gain, srcs: [src, pitch, swell, drift], nodes: [gain, bp, lp, bed, pan, pitchG, swellG, driftG], off: null };
  }

  /** One drop: mostly a tiny band-passed tick, sometimes a "plink" (a short upward chirp). */
  private drop(t: number): void {
    const rain = this.rain;
    if (!rain) return;
    const c = this.ctx;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(rain.gain);
    if (Math.random() < 0.12) {
      const o = c.createOscillator();
      const g = c.createGain();
      const f = 1200 + Math.random() * 1400;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.03);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.02, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.006, 0.012);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.1);
      release(o, [g, pan]);
    } else {
      const n = noiseBurst(c, t, 0.03);
      const bp = this.filter('bandpass', 1800 + Math.random() * 3500, 2.5 + Math.random() * 3);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08 + Math.random() * 0.08, t + 0.001);
      g.gain.setTargetAtTime(0, t + 0.002, 0.006);
      n.connect(bp).connect(g).connect(pan);
      release(n, [bp, g, pan]);
    }
  }

  /** Distant traffic: half-speed (darker) noise low-passed to a rumble, swelling slowly. */
  private makeCity(): Bed {
    const c = this.ctx;
    const t = c.currentTime;
    const gain = this.gainNode(0);
    gain.connect(this.out);
    const src = noiseLoop(c, t, 0.5);
    const lp1 = this.filter('lowpass', 160);
    const lp2 = this.filter('lowpass', 260, 0.5);
    const bed = this.gainNode(0.5);
    src.connect(lp1).connect(lp2).connect(bed).connect(gain);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoG = this.gainNode(0.18);
    lfo.connect(lfoG).connect(bed.gain);
    lfo.start(t);
    return { gain, srcs: [src, lfo], nodes: [gain, lp1, lp2, bed, lfoG], off: null };
  }

  /** A car passing far away: a band-passed whoosh that rises and falls while panning across. */
  private car(t: number): void {
    const city = this.city;
    if (!city) return;
    const c = this.ctx;
    const d = 3 + Math.random() * 2.5;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const n = noiseBurst(c, t, d);
    const bp = this.filter('bandpass', 260, 0.9);
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.linearRampToValueAtTime(650 + Math.random() * 250, t + d * 0.5);
    bp.frequency.linearRampToValueAtTime(280, t + d);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15 + Math.random() * 0.1, t + d * 0.5);
    g.gain.linearRampToValueAtTime(0, t + d);
    const pan = c.createStereoPanner();
    pan.pan.setValueAtTime(-0.8 * dir, t);
    pan.pan.linearRampToValueAtTime(0.8 * dir, t + d);
    n.connect(bp).connect(g).connect(pan).connect(city.gain);
    release(n, [bp, g, pan]);
  }

  /** A typing click; every few keys a deeper, slightly louder space bar. */
  private key(t: number): void {
    const space = --this.keysInWord <= 0;
    if (space) this.keysInWord = 3 + Math.floor(Math.random() * 5);
    keyClick(this.ctx, this.typing, t, space ? 0.7 : 0.45 + Math.random() * 0.3, space ? 0.72 : 0.9 + Math.random() * 0.25);
  }
}
