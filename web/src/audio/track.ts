/**
 * One lofi track: a seeded "score" (tempo, key, progression, sections, instrument choices) and the
 * player that turns it into notes one 16th at a time, ~120 ms ahead of the audio clock.
 * Every bar is planned from (seed, bar) alone, so a seed always replays the same music and the
 * player can resume from any bar.
 */
import { KALIMBA, bass, epiano, flute, hat, kick, mallet, snare, tom } from './instruments';
import { NOTE_NAMES, TONICS, bassRoot, chordPcs, isAvoid, pentatonic, pickProgression, trackName, voiceChord, type Chord } from './theory';
import { Rng, clamp, midiHz, mix, unplug } from './util';

type Drums = 0 | 1 | 2; // none, light (kick on 1, rim, soft hats), full kit
type Pattern = readonly (readonly [number, number])[]; // [16th step, velocity] or [start, length]

export interface Section {
  start: number;
  bars: number;
  kind: 'intro' | 'main' | 'break' | 'outro';
  drums: Drums;
  bass: boolean;
  melody: boolean;
}

export interface TrackSpec {
  seed: number;
  title: string;
  bpm: number;
  key: string;
  tonic: number;
  minor: boolean;
  swing: number;
  swing16: boolean;
  prog: Chord[];
  alt: Chord[] | null;
  voicings: number[][];
  altVoicings: number[][];
  roots: number[];
  altRoots: number[];
  keysStyle: 'hold' | 'push' | 'offbeat' | 'stabs';
  keysCutoff: number;
  tremRate: number;
  tremDepth: number;
  bright: number;
  strum: number;
  lead: 'flute' | 'ep' | 'kalimba';
  bassStyle: 'roots' | 'fifths' | 'walk';
  kick: Pattern;
  hats16: boolean;
  rim: boolean;
  snareLate: number;
  openHatEvery: number;
  sections: Section[];
  bars: number;
}

const KICKS: readonly Pattern[] = [
  [[0, 1], [10, 0.85]],
  [[0, 1], [7, 0.7], [10, 0.85]],
  [[0, 1], [6, 0.75], [10, 0.8]],
  [[0, 1], [3, 0.6], [8, 0.9]],
  [[0, 1], [2, 0.6], [10, 0.9]],
  [[0, 1], [9, 0.75], [11, 0.6]],
];

/** Two-bar melody rhythms: [16th step, length in 16ths]; the gaps are the point. */
const RHYTHMS: readonly Pattern[] = [
  [[2, 2], [4, 4], [10, 6], [18, 2], [20, 8]],
  [[0, 3], [3, 3], [6, 10], [22, 2], [24, 6]],
  [[4, 2], [6, 2], [8, 4], [14, 2], [16, 8]],
  [[0, 6], [8, 2], [10, 2], [12, 8], [26, 4]],
  [[6, 2], [8, 6], [18, 2], [20, 6]],
  [[0, 2], [2, 2], [4, 8], [16, 4], [22, 6]],
  [[2, 4], [8, 2], [10, 6], [24, 2], [26, 4]],
];
const STEPS: readonly (readonly [number, number])[] = [[-2, 1], [-1, 3], [0, 0.6], [1, 3], [2, 1.2], [3, 0.4], [-3, 0.4]];

/** Voices a cycle; the main cycle is voiced twice so its first chord is led from its own last one. */
function voiceAll(tonic: number, chords: Chord[], rich: boolean, prevV: number[] | null, prevR: number | null): [number[][], number[]] {
  let v = prevV;
  let b = prevR;
  let vs: number[][] = [];
  let bs: number[] = [];
  for (let pass = 0; pass < (prevV ? 1 : 2); pass++) {
    vs = [];
    bs = [];
    for (const c of chords) {
      v = voiceChord(tonic, c, v, rich);
      b = bassRoot(tonic, c, b);
      vs.push(v);
      bs.push(b);
    }
  }
  return [vs, bs];
}

export function makeTrack(seed: number): TrackSpec {
  const r = new Rng(seed);
  const bpm = r.int(70, 86);
  const tonic = r.pick(TONICS);
  const minor = r.chance(0.55);
  const { prog, alt } = pickProgression(r, minor);
  const rich = r.chance(0.5);
  const [voicings, roots] = voiceAll(tonic, prog, rich, null, null);
  const [altVoicings, altRoots] = alt ? voiceAll(tonic, alt, rich, voicings[voicings.length - 1], roots[roots.length - 1]) : [voicings, roots];

  // Structure: 4-bar intro, 8-bar sections (melody comes and goes), maybe a 4-bar break, 4-bar outro.
  const barSec = 240 / bpm;
  const n = clamp(Math.round((r.range(135, 170) / barSec - 12) / 8), 3, 6);
  const sections: Section[] = [];
  let bar = 0;
  const add = (kind: Section['kind'], bars: number, drums: Drums, bassOn: boolean, melody: boolean) => {
    sections.push({ start: bar, bars, kind, drums, bass: bassOn, melody });
    bar += bars;
  };
  add('intro', 4, r.chance(0.65) ? 0 : 1, r.chance(0.35), false);
  const breakAfter = r.chance(0.6) ? Math.floor(n / 2) : -1;
  for (let i = 0; i < n; i++) {
    add('main', 8, 2, true, i === 0 ? r.chance(0.3) : i % 2 === 1 || r.chance(0.5));
    if (i === breakAfter) add('break', 4, r.chance(0.5) ? 0 : 1, r.chance(0.5), r.chance(0.6));
  }
  add('outro', 4, r.chance(0.6) ? 0 : 1, false, false);

  return {
    seed,
    title: trackName(r),
    bpm,
    key: `${NOTE_NAMES[tonic]} ${minor ? 'minor' : 'major'}`,
    tonic,
    minor,
    swing: r.range(0.56, 0.62),
    swing16: r.chance(0.6),
    prog,
    alt,
    voicings,
    altVoicings,
    roots,
    altRoots,
    keysStyle: r.weighted([['hold', 3], ['offbeat', 3], ['push', 3], ['stabs', 1]] as const),
    keysCutoff: r.range(2500, 4000),
    tremRate: r.range(4, 5),
    tremDepth: r.range(0.15, 0.35),
    bright: r.range(0.8, 1.15),
    strum: r.range(0.006, 0.024),
    lead: r.weighted([['flute', 3], ['ep', 2], ['kalimba', 3]] as const),
    bassStyle: r.weighted([['roots', 2], ['fifths', 3], ['walk', 2]] as const),
    kick: r.pick(KICKS),
    hats16: r.chance(0.5),
    rim: r.chance(0.4),
    snareLate: r.range(0.004, 0.014), // a lazy, behind-the-beat backbeat
    openHatEvery: r.pick([2, 4, 4, 8]),
    sections,
    bars: bar,
  };
}

export function sectionAt(s: TrackSpec, bar: number): Section {
  for (const sec of s.sections) if (bar < sec.start + sec.bars) return sec;
  return s.sections[s.sections.length - 1];
}

interface Seg {
  chord: Chord;
  voicing: number[];
  root: number;
  pcs: number[];
  start: number; // absolute beats
  end: number;
}

/** The chord sounding at an absolute beat (borrowed-chord variant on every other 4-bar cycle). */
function segAt(s: TrackSpec, beat: number): Seg {
  const cyc = Math.floor(beat / 16);
  const useAlt = s.alt !== null && cyc % 2 === 1;
  const list = useAlt && s.alt ? s.alt : s.prog;
  const vs = useAlt ? s.altVoicings : s.voicings;
  const rs = useAlt ? s.altRoots : s.roots;
  let b = cyc * 16;
  let i = 0;
  while (i < list.length - 1 && beat >= b + list[i].beats) b += list[i++].beats;
  return { chord: list[i], voicing: vs[i], root: rs[i], pcs: chordPcs(s.tonic, list[i]), start: b, end: b + list[i].beats };
}

type Kind = 'keys' | 'bass' | 'lead' | 'kick' | 'snare' | 'rim' | 'ghost' | 'hat' | 'ohat' | 'tom';
interface Ev {
  k: Kind;
  s: number; // 16th step in the bar
  v: number;
  n?: number;
  notes?: number[];
  len?: number; // in 16ths
  d?: number; // extra offset in seconds (flams)
  hi?: boolean;
}

function planBar(s: TrackSpec, bar: number, first: boolean): Ev[] {
  const sec = sectionAt(s, bar);
  const r = new Rng(mix(s.seed, bar, 0xba5));
  const ev: Ev[] = [];
  const b0 = bar * 4;
  const lastBar = bar === s.bars - 1;
  const nextSec = lastBar ? null : sectionAt(s, bar + 1);
  const segs: { seg: Seg; s: number; len: number; cont: boolean }[] = [];
  for (let beat = b0; beat < b0 + 4; ) {
    const seg = segAt(s, beat);
    const end = Math.min(seg.end, b0 + 4);
    segs.push({ seg, s: (beat - b0) * 4, len: (end - beat) * 4, cont: seg.start < beat });
    beat = end;
  }
  const next = segAt(s, b0 + 4);
  const nextIsNew = next.start === b0 + 4;

  // Keys: held, re-attacked on the off-beat, or "pushed" (anticipated on the and-of-4).
  for (const g of segs) {
    const v = r.range(0.55, 0.72) * (g.cont ? 0.85 : 1);
    const end = g.s + g.len;
    const pushNext = s.keysStyle === 'push' && nextIsNew && !lastBar && end === 16;
    const until = pushNext ? 14 : end;
    const add = (st: number, len: number, vv: number) => ev.push({ k: 'keys', s: st, notes: g.seg.voicing, len, v: vv });
    if (s.keysStyle === 'push' && g.s === 0 && !g.cont && !first) {
      // already attacked at the end of the previous bar
    } else if (s.keysStyle === 'offbeat' && g.len >= 16) {
      add(g.s, 6.4, v);
      add(g.s + 6, until - g.s - 6.3, v * 0.72);
    } else if (s.keysStyle === 'stabs' && g.len >= 16) {
      add(g.s, 3, v);
      add(g.s + 6, 2.5, v * 0.8);
      add(g.s + 11, until - g.s - 11.3, v * 0.85);
    } else {
      add(g.s, until - g.s - 0.3, v);
    }
    if (pushNext) {
      const nextEnd = (Math.min(next.end, b0 + 8) - (b0 + 4)) * 4;
      const pushesAgain = next.end === b0 + 8 && bar + 1 < s.bars - 1;
      ev.push({ k: 'keys', s: 14, notes: next.voicing, len: 2 + nextEnd - (pushesAgain ? 2 : 0) - 0.3, v: r.range(0.55, 0.7) });
    }
  }

  // Bass: roots and fifths, with chromatic approach notes into the next chord.
  if (sec.bass) {
    for (const g of segs) {
      const R = g.seg.root;
      const F = R + 7 <= 47 ? R + 7 : R - 5;
      const O = R + 12 <= 55 ? R + 12 : R;
      const endBeat = b0 + (g.s + g.len) / 4;
      const after = segAt(s, endBeat);
      const changes = after.start === endBeat && !(lastBar && g.s + g.len === 16);
      const approach = changes ? (after.root > R ? after.root - 1 : after.root + 1) : F;
      const q = g.seg.chord.q;
      const third = R + (q.startsWith('m') && !q.startsWith('maj') ? 3 : 4);
      const seventh = R + (q === 'maj9' || q === '69' || q === 'm6' ? 9 : 10); // 6th on major-ish chords, b7 otherwise
      const v = r.range(0.8, 0.95);
      const add = (st: number, n: number, len: number, vv = v) => ev.push({ k: 'bass', s: g.s + st, n, len, v: vv });
      if (g.len < 16) {
        add(0, R, Math.min(g.len, 6) - 0.4);
        if (g.len >= 8 && changes && r.chance(0.6)) add(g.len - 2, approach, 1.8, v * 0.75);
        continue;
      }
      if (s.bassStyle === 'roots') {
        add(0, R, 7);
        add(10, R, 3.5, v * 0.75);
        if (r.chance(0.35)) add(14, O, 1.8, v * 0.6);
      } else if (s.bassStyle === 'fifths') {
        add(0, R, 6);
        add(8, F, 4.5, v * 0.82);
        if (changes) add(14, approach, 1.8, v * 0.7);
      } else {
        const up = r.chance(0.5);
        add(0, R, 3.5);
        add(6, up ? O : third, 1.6, v * 0.7);
        add(8, F, 3.5, v * 0.85);
        add(12, up ? third : seventh, 1.6, v * 0.7);
        add(14, approach, 1.8, v * 0.75);
      }
    }
  }

  // Drums: soft kick, lazy snare on 2 and 4, swung hats with ghosts, a small fill every 8 bars.
  if (sec.drums === 2) {
    const fill = nextSec !== null && ((bar - sec.start) % 8 === 7 || bar === sec.start + sec.bars - 1);
    const kind = fill ? r.pick(['roll', 'drop', 'flam', 'toms', 'open'] as const) : null;
    const cut = kind === 'drop' ? 12 : 16; // "drop": kick and snare rest on beat 4, a breath
    const sn: Kind = s.rim ? 'rim' : 'snare';
    for (const [st, v] of s.kick) if (st < cut) ev.push({ k: 'kick', s: st, v: v * r.range(0.9, 1.04) });
    if (!fill && r.chance(0.22)) ev.push({ k: 'kick', s: 15, v: 0.45 });
    ev.push({ k: sn, s: 4, v: r.range(0.85, 1) });
    if (cut > 12) ev.push({ k: sn, s: 12, v: r.range(0.85, 1) });
    if (r.chance(0.3)) ev.push({ k: 'ghost', s: r.pick([7, 9, 15]), v: r.range(0.2, 0.3) });
    const open = kind === 'open' || bar % s.openHatEvery === s.openHatEvery - 1;
    for (let st = 0; st < 16; st++) {
      if (!s.hats16 && st % 2) continue;
      if (open && st >= 14) {
        if (st === 14) ev.push({ k: 'ohat', s: 14, v: 0.42 });
        continue;
      }
      if (st % 4 !== 0 && r.chance(0.1)) continue; // the odd skipped hat
      const base = s.hats16 ? [0.5, 0.2, 0.36, 0.24][st % 4] : st % 4 === 0 ? 0.5 : 0.36;
      ev.push({ k: 'hat', s: st, v: base * r.range(0.85, 1.1) });
    }
    if (kind === 'roll') ev.push({ k: 'ghost', s: 13, v: 0.22 }, { k: 'ghost', s: 14, v: 0.3 }, { k: 'ghost', s: 15, v: 0.42 });
    if (kind === 'flam') ev.push({ k: 'ghost', s: 12, v: 0.35, d: -0.022 });
    if (kind === 'toms') ev.push({ k: 'tom', s: 13, v: 0.8, hi: true }, { k: 'tom', s: 15, v: 0.9, hi: false });
    if (kind === 'open') ev.push({ k: 'kick', s: 15, v: 0.5 });
  } else if (sec.drums === 1) {
    ev.push({ k: 'kick', s: 0, v: 0.7 }, { k: 'rim', s: 4, v: 0.55 }, { k: 'rim', s: 12, v: 0.55 });
    for (let st = 0; st < 16; st += 2) ev.push({ k: 'hat', s: st, v: (st % 4 === 0 ? 0.32 : 0.24) * r.range(0.85, 1.1) });
  }

  if (sec.melody) ev.push(...leadBar(s, sec, bar));
  return ev;
}

/**
 * Melody: one 2-bar motif per section (rhythm + contour), stated, varied, restated and answered
 * with a long resolving note. Pentatonic, snapped to chord tones on strong beats and never
 * holding an "avoid" note against the chord.
 */
function leadBar(s: TrackSpec, sec: Section, bar: number): Ev[] {
  const m = new Rng(mix(s.seed, sec.start, 0x1ead));
  const rhythm = m.pick(RHYTHMS);
  const contour = [0];
  for (let i = 1; i < rhythm.length; i++) contour.push(clamp(contour[i - 1] + m.weighted(STEPS), -4, 4));
  const pcs = pentatonic(s.tonic, s.minor);
  const scale: number[] = [];
  for (let n = 60; n <= 86; n++) if (pcs.includes(n % 12)) scale.push(n);
  let anchor = 0;
  for (let i = 0; i < scale.length; i++) if (Math.abs(scale[i] - 71) < Math.abs(scale[anchor] - 71)) anchor = i;
  anchor = clamp(anchor + m.int(-2, 2), 4, scale.length - 5);

  const rel = bar - sec.start;
  const phrase = Math.floor(rel / 2);
  const half = rel % 2;
  const phraseBar = bar - half;
  const ending = phrase === sec.bars / 2 - 1;
  const varied = phrase % 2 === 1 && !ending;
  const p = new Rng(mix(s.seed, sec.start, phrase, 0x7));

  const place = (idx: number, step: number, strong: boolean): number => {
    const chord = segAt(s, phraseBar * 4 + Math.floor(step / 4)).pcs;
    const ok = (k: number) => k >= 0 && k < scale.length && (strong ? chord.includes(scale[k] % 12) : !isAvoid(scale[k] % 12, chord));
    let i = clamp(idx, 0, scale.length - 1);
    if (!ok(i)) for (const d of [1, -1, 2, -2]) if (ok(i + d)) return i + d;
    if (!ok(i) && isAvoid(scale[i] % 12, chord)) i = clamp(i + 1, 0, scale.length - 1);
    return i;
  };

  const notes: Ev[] = [];
  let lastIdx = anchor;
  rhythm.forEach(([st, len], i) => {
    if (ending && st >= 16) return;
    if (i > 0 && p.chance(0.12)) return; // leave a little more air now and then
    const idx = place(anchor + contour[i] + (varied && i >= rhythm.length - 2 ? 1 : 0), st, st % 8 === 0 || len >= 6);
    lastIdx = idx;
    notes.push({ k: 'lead', s: st, n: scale[idx], len: len - 0.4, v: (i === 0 ? 0.78 : 0.66) * p.range(0.88, 1.08) });
  });
  if (ending) {
    const st = 16 + (p.chance(0.5) ? 0 : 2);
    notes.push({ k: 'lead', s: st, n: scale[place(lastIdx - 1, st, true)], len: 10, v: 0.7 });
  }
  return notes.filter((e) => e.s >= half * 16 && e.s < half * 16 + 16).map((e) => ({ ...e, s: e.s - half * 16 }));
}

export interface TrackOuts {
  dry: AudioNode; // music bus input
  wet: AudioNode; // reverb send
  wow: AudioNode; // tape wow/flutter control signal, in seconds of delay
}

const hum = (a: number): number => (Math.random() + Math.random() - 1) * a;

export class TrackPlayer {
  readonly spec: TrackSpec;
  done = false;
  endTime = 0;
  private bar: number;
  private step = 0;
  private barTime: number;
  private plan: Ev[][] = [];
  private readonly spb: number;
  private readonly s16: number;
  private readonly firstBar: number;
  private readonly startTime: number;
  private readonly nodes: AudioNode[] = [];
  private readonly lfos: OscillatorNode[] = [];
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly tape: DelayNode;
  private readonly keysIn: GainNode;
  private readonly keysLP: BiquadFilterNode;
  private readonly keysDuck: GainNode;
  private readonly bassIn: GainNode;
  private readonly bassDuck: GainNode;
  private readonly leadIn: GainNode;
  private readonly drums: GainNode;
  private readonly hats: GainNode;
  private readonly snareSend: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    spec: TrackSpec,
    private readonly outs: TrackOuts,
    private readonly onKick: (time: number, velocity: number) => void,
    startBar: number,
    startTime: number,
  ) {
    this.spec = spec;
    this.spb = 60 / spec.bpm;
    this.s16 = this.spb / 4;
    this.bar = this.firstBar = clamp(startBar, 0, spec.bars - 1);
    this.barTime = this.startTime = startTime;
    const c = ctx;
    const gain = (v: number): GainNode => {
      const g = c.createGain();
      g.gain.value = v;
      this.nodes.push(g);
      return g;
    };
    const biquad = (type: BiquadFilterType, f: number, q: number): BiquadFilterNode => {
      const b = c.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      this.nodes.push(b);
      return b;
    };
    const lfo = (f: number): OscillatorNode => {
      const o = c.createOscillator();
      o.frequency.value = f;
      o.start(startTime);
      this.lfos.push(o);
      return o;
    };
    const panner = (p: number): StereoPannerNode => {
      const n = c.createStereoPanner();
      n.pan.value = p;
      this.nodes.push(n);
      return n;
    };

    this.dry = gain(0);
    this.wet = gain(0);
    this.dry.connect(outs.dry);
    this.wet.connect(outs.wet);
    for (const g of [this.dry, this.wet]) {
      g.gain.setValueAtTime(0, startTime);
      g.gain.setTargetAtTime(1, startTime, 0.25);
    }
    // Tape: pitched parts pass a ~6 ms delay whose length the generator's wow/flutter LFO wobbles.
    // A changing delay bends pitch (by -d(delay)/dt), exactly how uneven tape speed sounds.
    this.tape = c.createDelay(0.05);
    this.tape.delayTime.value = 0.006;
    this.nodes.push(this.tape);
    outs.wow.connect(this.tape.delayTime);
    this.tape.connect(this.dry);

    // Keys: EP voices -> low-pass -> kick duck -> tremolo -> auto-pan -> chorus -> tape, plus reverb send.
    this.keysIn = gain(1.1);
    this.keysLP = biquad('lowpass', spec.keysCutoff, 0.6);
    this.keysDuck = gain(1);
    const trem = gain(1 - spec.tremDepth * 0.4);
    const pan = panner(0);
    const tremLfo = lfo(spec.tremRate);
    tremLfo.connect(gain(spec.tremDepth * 0.4)).connect(trem.gain);
    tremLfo.connect(gain(spec.tremDepth)).connect(pan.pan); // suitcase-style stereo vibrato
    const chorus = c.createDelay(0.03);
    chorus.delayTime.value = 0.011;
    this.nodes.push(chorus);
    lfo(0.37).connect(gain(0.0022)).connect(chorus.delayTime);
    const keysOut = gain(1);
    this.keysIn.connect(this.keysLP).connect(this.keysDuck).connect(trem).connect(pan);
    pan.connect(keysOut);
    pan.connect(chorus).connect(gain(0.32)).connect(keysOut);
    keysOut.connect(this.tape);
    keysOut.connect(gain(0.5)).connect(this.wet);

    // Bass: low-passed around 500 Hz, ducked under the kick.
    this.bassIn = gain(1);
    this.bassDuck = gain(1);
    this.bassIn.connect(biquad('lowpass', 520, 0.7)).connect(this.bassDuck).connect(this.tape);

    // Lead: mellow low-pass, a little left, generous reverb.
    this.leadIn = gain(1.25);
    const leadPan = panner(-0.18);
    this.leadIn.connect(biquad('lowpass', 2800, 0.5)).connect(leadPan).connect(this.tape);
    leadPan.connect(gain(0.6)).connect(this.wet);

    // Drums stay off the tape wobble so the groove keeps its pocket; kick/snare dulled to ~5 kHz.
    this.drums = gain(1);
    this.drums.connect(biquad('lowpass', 5200, 0.4)).connect(this.dry);
    this.hats = gain(1);
    const hatPan = panner(0.22);
    this.hats.connect(hatPan).connect(this.dry);
    hatPan.connect(gain(0.1)).connect(this.wet);
    this.snareSend = gain(0.3);
    this.snareSend.connect(this.wet);
  }

  /** The bar sounding at `time` (used to resume from where we paused). */
  barAt(time: number): number {
    const b = this.firstBar + Math.floor((time - this.startTime) / (this.spb * 4));
    return clamp(b, this.firstBar, this.spec.bars - 1);
  }

  /** Schedules every 16th whose grid time falls before `horizon`. */
  schedule(horizon: number): void {
    const now = this.ctx.currentTime;
    while (!this.done) {
      if (this.barTime + this.step * this.s16 >= horizon) break;
      if (this.step === 0) this.beginBar();
      if (this.done) break;
      for (const e of this.plan[this.step]) this.play(e, now);
      if (++this.step === 16) {
        this.step = 0;
        this.bar++;
        this.barTime += this.spb * 4;
      }
    }
  }

  fade(target: number, at: number, tau: number): void {
    for (const g of [this.dry, this.wet]) {
      g.gain.cancelScheduledValues(at);
      g.gain.setTargetAtTime(target, at, tau);
    }
  }

  dispose(): void {
    for (const o of this.lfos) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    unplug(this.outs.wow, this.tape.delayTime);
    for (const n of [...this.lfos, ...this.nodes]) unplug(n);
  }

  private beginBar(): void {
    const s = this.spec;
    if (this.bar >= s.bars) {
      this.done = true;
      this.endTime = this.barTime;
      return;
    }
    const plan: Ev[][] = Array.from({ length: 16 }, () => []);
    for (const e of planBar(s, this.bar, this.bar === this.firstBar)) plan[clamp(Math.floor(e.s), 0, 15)].push(e);
    this.plan = plan;
    const sec = sectionAt(s, this.bar);
    if (this.bar === sec.start || this.bar === this.firstBar) this.sectionStart(sec);
  }

  private sectionStart(sec: Section): void {
    const t = this.barTime;
    const f = this.keysLP.frequency;
    const cut = this.spec.keysCutoff;
    const left = (sec.start + sec.bars - this.bar) * this.spb * 4; // seconds left in the section
    if (sec.kind === 'intro') {
      // The keys' filter slowly opens over the intro, like a radio warming up.
      f.setValueAtTime(650 + (cut - 650) * ((this.bar - sec.start) / sec.bars), t);
      f.setTargetAtTime(cut, t, left / 3);
    } else if (sec.kind === 'break') {
      f.setTargetAtTime(cut * 0.55, t, 0.8);
    } else if (sec.kind === 'outro') {
      f.setTargetAtTime(900, t, left / 2.5);
      for (const g of [this.dry, this.wet]) g.gain.setTargetAtTime(0.3, t, left / 2);
    } else {
      f.setTargetAtTime(cut, t, 0.8);
    }
  }

  /** Swung position of a 16th step: the off-8th (or off-16th) lands late by the swing ratio. */
  private timeOf(step: number): number {
    const spb = this.spb;
    const sw = this.spec.swing;
    const beat = Math.floor(step / 4);
    const pos = step - beat * 4;
    let off: number;
    if (this.spec.swing16) off = pos === 0 ? 0 : pos === 1 ? (sw * spb) / 2 : pos === 2 ? spb / 2 : spb / 2 + (sw * spb) / 2;
    else off = pos === 0 ? 0 : pos === 1 ? (sw * spb) / 2 : pos === 2 ? sw * spb : sw * spb + ((1 - sw) * spb) / 2;
    return this.barTime + beat * spb + off;
  }

  private play(e: Ev, now: number): void {
    const s = this.spec;
    const c = this.ctx;
    let t = this.timeOf(e.s) + (e.d ?? 0);
    if (e.k === 'kick') t += hum(0.004);
    else if (e.k === 'snare' || e.k === 'rim') t += s.snareLate + hum(0.006);
    else if (e.k === 'lead') t += hum(0.012);
    else t += hum(0.008);
    if (t < now + 0.002) return; // the timer ran late: skip rather than pile notes up
    const len = (e.len ?? 1) * this.s16;
    switch (e.k) {
      case 'keys':
        (e.notes ?? []).forEach((n, i) => {
          const off = i * s.strum * (0.7 + Math.random() * 0.6); // a soft roll from the bottom up
          epiano(c, this.keysIn, t + off, n, len - off, e.v * (0.9 + Math.random() * 0.2), s.bright);
        });
        break;
      case 'bass':
        bass(c, this.bassIn, t, e.n ?? 36, len, e.v);
        break;
      case 'lead':
        if (s.lead === 'flute') flute(c, this.leadIn, t, e.n ?? 72, len, e.v);
        else if (s.lead === 'ep') epiano(c, this.leadIn, t, e.n ?? 72, len, e.v, 0.55);
        else mallet(c, this.leadIn, t, midiHz(e.n ?? 72), e.v * 0.75, KALIMBA, { click: 0.15 });
        break;
      case 'kick':
        kick(c, this.drums, t, e.v);
        this.duck(t, e.v);
        this.onKick(t, e.v);
        break;
      case 'snare':
      case 'rim':
      case 'ghost':
        snare(c, this.drums, this.snareSend, t, e.v, e.k === 'rim' || (e.k === 'ghost' && s.rim));
        break;
      case 'hat':
      case 'ohat':
        hat(c, this.hats, t, e.v, e.k === 'ohat');
        break;
      case 'tom':
        tom(c, this.drums, t, e.v, e.hi === true);
        break;
    }
  }

  /** Sidechain-style pump: the bass (and a touch of the keys) dips under each kick. */
  private duck(t: number, v: number): void {
    const b = this.bassDuck.gain;
    const k = this.keysDuck.gain;
    b.setTargetAtTime(1 - 0.5 * v, t, 0.004);
    b.setTargetAtTime(1, t + 0.05, 0.09);
    k.setTargetAtTime(1 - 0.12 * v, t, 0.006);
    k.setTargetAtTime(1, t + 0.05, 0.12);
  }
}
