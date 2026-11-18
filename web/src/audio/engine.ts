/**
 * The audio engine singleton: one lazily created AudioContext, the mixer, the lofi generator,
 * event sounds and ambience. UI code talks to `audio` only.
 *
 *   generator dry ─> music vol ─> break ─> duck ────┐
 *   ambience ─────> ambience vol ──────────────────┼─> master (vol, mute) ─> glue comp ─> limiter ─> trim ─> out
 *   sfx dry ──────> sfx vol ───────────────────────┤
 *   generator wet ─> music vol ─> break ─> duck ┐   │   (the wet path mirrors the dry faders so the
 *   sfx wet ──────> sfx vol ────────────────────┴─> reverb ─┘    shared reverb follows each bus)
 *
 * An analyser taps the generator's dry output for level(); beat() comes from the kick scheduler.
 */
import { Ambience, type WeatherSound } from './ambience';
import { LofiGenerator, type KeyInfo } from './lofi';
import { Sfx } from './sfx';
import { clamp, dbToGain, makeImpulse } from './util';

export type Bus = 'master' | 'music' | 'ambience' | 'sfx';
export type Source = 'generator' | 'youtube' | 'spotify' | 'off';
export interface TrackInfo {
  title: string;
  bpm: number;
  key: string;
  seed: number;
  startedAt: number; // Date.now() ms; shifted on resume so now - startedAt is the time played
}
export interface AudioState {
  unlocked: boolean;
  playing: boolean;
  source: Source;
  track: TrackInfo | null;
  volumes: Record<Bus, number>; // 0..1, persisted in localStorage 'ao-audio'
  muted: boolean;
  /** The room's own sounds (rain, snow wind, the street, typing, the office's chimes); persisted, on by default. */
  roomSounds: boolean;
  onBreak: boolean;
}

export interface AudioEngine {
  unlock(): Promise<void>;
  getState(): AudioState;
  subscribe(fn: (s: AudioState) => void): () => void;
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  setSource(s: Source): void;
  setVolume(bus: Bus, v: number): void;
  setMuted(m: boolean): void;
  /** Room sounds on or off: every ambience bed and the office's event chimes (the music and the focus timer's bell carry on). */
  setRoomSounds(on: boolean): void;
  duck(amountDb: number, seconds: number): void;
  setBreak(on: boolean): void;
  beat(): number;
  level(): number;
  sfx: { needsYou(): void; arrive(): void; leave(): void; spawn(): void; success(): void; fail(): void; keys(count?: number): void; purr(): void; bell(): void };
  ambience: {
    setRain(on: boolean): void;
    setCity(on: boolean): void;
    setTyping(keysPerSecond: number): void;
    /** Rain loop for rain, soft wind for snow, nothing extra for a clear night or a sunny day. */
    setWeather(w: WeatherSound): void;
  };
}

const STORE_KEY = 'ao-audio';
const BUSES: readonly Bus[] = ['master', 'music', 'ambience', 'sfx'];
const SOURCES: readonly Source[] = ['generator', 'youtube', 'spotify', 'off'];
const DEFAULT_VOLUMES: Record<Bus, number> = { master: 0.8, music: 0.7, ambience: 0.6, sfx: 0.7 };
const BREAK_GAIN = dbToGain(-12);
const FADER_TAU = 0.05;
const YT_BEAT = 60 / 80; // synthetic pulse for YouTube and Spotify, whose audio we cannot analyse
const KICK_SLOTS = 8;

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  musicBreak: GainNode;
  musicDuck: GainNode;
  verbMusic: GainNode;
  verbBreak: GainNode;
  verbDuck: GainNode;
  ambience: GainNode;
  sfxBus: GainNode;
  verbSfx: GainNode;
  analyser: AnalyserNode;
  scope: Float32Array<ArrayBuffer>;
  gen: LofiGenerator;
  sfx: Sfx;
  amb: Ambience;
}

function loadPrefs(): Pick<AudioState, 'volumes' | 'muted' | 'source' | 'roomSounds'> {
  const out = { volumes: { ...DEFAULT_VOLUMES }, muted: false, source: 'generator' as Source, roomSounds: true };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { volumes?: Partial<Record<Bus, unknown>>; muted?: unknown; source?: unknown; roomSounds?: unknown };
      for (const b of BUSES) {
        const v = p.volumes?.[b];
        if (typeof v === 'number' && Number.isFinite(v)) out.volumes[b] = clamp(v, 0, 1);
      }
      if (typeof p.muted === 'boolean') out.muted = p.muted;
      if (SOURCES.includes(p.source as Source)) out.source = p.source as Source;
      if (typeof p.roomSounds === 'boolean') out.roomSounds = p.roomSounds;
    }
  } catch {
    /* storage blocked or corrupt: keep defaults */
  }
  return out;
}

let state: AudioState = { unlocked: false, playing: false, track: null, onBreak: false, ...loadPrefs() };
const listeners = new Set<(s: AudioState) => void>();
let g: Graph | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const want = { rain: false, city: false, typing: 0, weather: 'clear' as WeatherSound }; // ambience requested before unlock
const kickT = new Float64Array(KICK_SLOTS).fill(-1);
const kickV = new Float32Array(KICK_SLOTS);
let kickI = 0;
const beatCache = { at: -1, v: 0 };
const lvl = { at: 0, v: 0 };

function set(patch: Partial<AudioState>): void {
  if ((Object.keys(patch) as (keyof AudioState)[]).every((k) => Object.is(state[k], patch[k]))) return;
  state = { ...state, ...patch };
  for (const fn of [...listeners]) fn(state);
}

function save(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ volumes: state.volumes, muted: state.muted, source: state.source, roomSounds: state.roomSounds }));
    } catch {
      /* storage full or blocked */
    }
  }, 250);
}

/** Slider position to gain: squared, so half way is about -12 dB and the low end stays usable. */
const taper = (v: number): number => v * v;

function ramp(p: AudioParam, v: number, tau = FADER_TAU): void {
  if (!g) return;
  const t = g.ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setTargetAtTime(v, t, tau);
}

function applyFaders(): void {
  if (!g) return;
  const v = state.volumes;
  ramp(g.master.gain, state.muted ? 0 : taper(v.master));
  ramp(g.music.gain, taper(v.music));
  ramp(g.verbMusic.gain, taper(v.music));
  ramp(g.ambience.gain, taper(v.ambience));
  ramp(g.sfxBus.gain, taper(v.sfx));
  ramp(g.verbSfx.gain, taper(v.sfx));
}

function onKick(time: number, velocity: number): void {
  kickT[kickI] = time;
  kickV[kickI] = clamp(velocity, 0, 1);
  kickI = (kickI + 1) % KICK_SLOTS;
}

function onTrack(track: TrackInfo, key: KeyInfo): void {
  g?.sfx.setKey(key.tonic, key.minor);
  set({ track });
}

/** Creates the context and mixer on first use (synchronously, so it happens inside the user gesture). */
function graph(): Graph | null {
  if (g) return g;
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  let ctx: AudioContext;
  try {
    ctx = new AC({ latencyHint: 'playback' }); // bigger buffers, lower CPU; beat() compensates latency
  } catch {
    return null;
  }
  const gain = (v: number, to: AudioNode): GainNode => {
    const n = ctx.createGain();
    n.gain.value = v;
    n.connect(to);
    return n;
  };
  const v = state.volumes;
  const brk = state.onBreak ? BREAK_GAIN : 1;

  // Output stage. DynamicsCompressorNode adds its own make-up gain ((1/fullRangeGain)^0.6, about
  // +4 dB for the glue and +3.4 dB for the limiter here), so a fixed trim brings the ceiling back
  // to roughly -6 dBFS: never clipping, with the music normally peaking far lower.
  const trim = gain(0.6, ctx.destination);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  limiter.connect(trim);
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -14;
  glue.knee.value = 10;
  glue.ratio.value = 2;
  glue.attack.value = 0.02;
  glue.release.value = 0.3;
  glue.connect(limiter);
  const master = gain(state.muted ? 0 : taper(v.master), glue);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 2.1);
  reverb.connect(gain(0.8, master));

  const musicDuck = gain(1, master);
  const musicBreak = gain(brk, musicDuck);
  const music = gain(taper(v.music), musicBreak);
  const verbDuck = gain(1, reverb);
  const verbBreak = gain(brk, verbDuck);
  const verbMusic = gain(taper(v.music), verbBreak);
  const ambience = gain(taper(v.ambience), master);
  const sfxBus = gain(taper(v.sfx), master);
  const verbSfx = gain(taper(v.sfx), reverb);

  const musicTap = gain(1, music);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  musicTap.connect(analyser); // measured before the volume fader, so visuals do not depend on it

  const gen = new LofiGenerator(ctx, musicTap, verbMusic, onKick, onTrack);
  const sfx = new Sfx(ctx, sfxBus, verbSfx);
  const amb = new Ambience(ctx, ambience);
  g = { ctx, master, music, musicBreak, musicDuck, verbMusic, verbBreak, verbDuck, ambience, sfxBus, verbSfx, analyser, scope: new Float32Array(analyser.fftSize), gen, sfx, amb };
  ctx.onstatechange = () => set({ unlocked: ctx.state === 'running' });
  applyAmbience();
  return g;
}

/** What the room should be playing: what the app asked for, or nothing while room sounds are off. */
function applyAmbience(): void {
  if (!g) return;
  const on = state.roomSounds;
  g.amb.setRain(on && want.rain);
  g.amb.setWeather(on ? want.weather : 'clear');
  g.amb.setCity(on && want.city);
  g.amb.setTyping(on ? want.typing : 0);
}

function setRoomSounds(on: boolean): void {
  if (on === state.roomSounds) return;
  set({ roomSounds: on });
  applyAmbience();
  save();
}

/** The office's event chimes play only while room sounds are on (and sound has been started). */
const roomReady = (): Graph | null => (state.roomSounds ? ready() : null);

async function unlock(): Promise<void> {
  const gr = graph();
  if (!gr) return;
  if (gr.ctx.state !== 'running') {
    try {
      await gr.ctx.resume();
    } catch {
      /* not allowed yet: needs a user gesture */
    }
  }
  set({ unlocked: gr.ctx.state === 'running' });
}

function ready(): Graph | null {
  return g && g.ctx.state === 'running' ? g : null;
}

function play(): void {
  void unlock(); // creates the graph synchronously, then resumes
  if (g && state.source === 'generator') g.gen.start();
  set({ playing: true });
}

function pause(): void {
  g?.gen.stop();
  set({ playing: false });
}

function setSource(s: Source): void {
  if (!SOURCES.includes(s) || s === state.source) return;
  set({ source: s });
  save();
  if (!g) return;
  if (s === 'generator' && state.playing) {
    void unlock();
    g.gen.start();
  } else {
    g.gen.stop();
  }
}

function setVolume(bus: Bus, value: number): void {
  if (!BUSES.includes(bus)) return;
  const v = clamp(Number.isFinite(value) ? value : 0, 0, 1);
  if (state.volumes[bus] === v) return;
  set({ volumes: { ...state.volumes, [bus]: v } });
  applyFaders();
  save();
}

function setMuted(m: boolean): void {
  if (m === state.muted) return;
  set({ muted: m });
  applyFaders();
  save();
}

function duck(amountDb: number, seconds: number): void {
  if (!g) return;
  const t = g.ctx.currentTime;
  const v = dbToGain(Math.min(0, amountDb || 0));
  const hold = Math.max(0.1, seconds || 0);
  for (const p of [g.musicDuck.gain, g.verbDuck.gain]) {
    p.cancelScheduledValues(t);
    p.setTargetAtTime(v, t, 0.08);
    p.setTargetAtTime(1, t + hold, 0.5);
  }
}

function setBreak(on: boolean): void {
  set({ onBreak: on });
  if (!g) return;
  ramp(g.musicBreak.gain, on ? BREAK_GAIN : 1, 0.7);
  ramp(g.verbBreak.gain, on ? BREAK_GAIN : 1, 0.7);
}

/** Context time of the sample reaching the speakers right now (output latency compensated). */
function heardTime(ctx: AudioContext): number {
  const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
  if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
    return ts.contextTime + clamp((performance.now() - ts.performanceTime) / 1000, 0, 0.25);
  }
  return ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0);
}

function ytPulse(t: number): number {
  const n = Math.floor(t / YT_BEAT);
  return (n % 4 === 0 ? 0.65 : 0.45) * Math.exp(-(t - n * YT_BEAT) / 0.11);
}

function beat(): number {
  if (!state.playing) return 0;
  if (state.source === 'youtube' || state.source === 'spotify') return ytPulse(performance.now() / 1000);
  if (state.source !== 'generator' || !g) return 0;
  const p = performance.now();
  if (p - beatCache.at < 4) return beatCache.v; // many lights may ask in the same frame
  const now = heardTime(g.ctx);
  let v = 0;
  for (let i = 0; i < KICK_SLOTS; i++) {
    const dt = now - kickT[i];
    if (dt >= 0 && dt < 0.6) v = Math.max(v, kickV[i] * Math.exp(-dt / 0.075)); // ~200 ms to near zero
  }
  beatCache.at = p;
  beatCache.v = v;
  return v;
}

function level(): number {
  const p = performance.now();
  const dt = (p - lvl.at) / 1000;
  if (dt < 0.015) return lvl.v;
  lvl.at = p;
  let target = 0;
  if (g && state.playing) {
    if (state.source === 'generator') {
      const s = g.scope;
      g.analyser.getFloatTimeDomainData(s);
      let sum = 0;
      for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
      const db = 20 * Math.log10(Math.sqrt(sum / s.length) + 1e-9);
      target = clamp((db + 48) / 36, 0, 1); // -48 dBFS -> 0, -12 dBFS -> 1
    } else if (state.source === 'youtube' || state.source === 'spotify') {
      target = 0.45 + 0.08 * Math.sin(p / 1900) + 0.25 * ytPulse(p / 1000);
    }
  }
  const tau = target > lvl.v ? 0.06 : 0.3; // fast rise, slow fall
  lvl.v += (target - lvl.v) * (1 - Math.exp(-Math.min(dt, 0.5) / tau));
  return lvl.v;
}

export const audio: AudioEngine = {
  unlock,
  getState: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  play,
  pause,
  toggle: () => (state.playing ? pause() : play()),
  next: () => {
    if (g && state.source === 'generator') g.gen.next();
  },
  setSource,
  setVolume,
  setMuted,
  setRoomSounds,
  duck,
  setBreak,
  beat,
  level,
  sfx: {
    needsYou: () => {
      const r = roomReady();
      if (r && r.sfx.needsYou()) duck(-9, 3);
    },
    arrive: () => void roomReady()?.sfx.arrive(),
    leave: () => void roomReady()?.sfx.leave(),
    spawn: () => void roomReady()?.sfx.spawn(),
    success: () => void roomReady()?.sfx.success(),
    fail: () => void roomReady()?.sfx.fail(),
    keys: (count?: number) => void roomReady()?.sfx.keys(count),
    purr: () => void roomReady()?.sfx.purr(),
    // the focus timer's bell is the timer's own alarm, not a room sound: it rings either way
    bell: () => void ready()?.sfx.bell(),
  },
  ambience: {
    setRain(on) {
      want.rain = !!on;
      applyAmbience();
    },
    setCity(on) {
      want.city = !!on;
      applyAmbience();
    },
    setTyping(keysPerSecond) {
      want.typing = Number.isFinite(keysPerSecond) ? Math.max(0, keysPerSecond) : 0;
      applyAmbience();
    },
    setWeather(w) {
      want.weather = w === 'rain' || w === 'snow' || w === 'sunny' ? w : 'clear';
      applyAmbience();
    },
  },
};

// Vite dev: close the old context when this module is hot-replaced, so two engines never play at once.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (!g) return;
    g.gen.dispose();
    g.amb.dispose();
    void g.ctx.close();
    g = null;
  });
}
