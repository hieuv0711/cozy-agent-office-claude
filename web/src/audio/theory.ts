/**
 * Harmony for the lofi generator: keys, jazzy progressions, rootless voicings with voice
 * leading, pentatonic melody helpers and cozy track names. Pure functions, no audio nodes.
 */
import type { Rng } from './util';

export const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Preferred tonics: Eb, F, G, Ab, Bb, C, D (warm on a Rhodes, comfortable for bass). */
export const TONICS = [3, 5, 7, 8, 10, 0, 2] as const;

export type Quality = 'maj9' | '69' | 'm9' | 'm11' | 'm7' | 'm6' | '9' | '13' | '7b9' | '9sus' | 'm7b5';

/** A chord in a progression: root in semitones above the key's tonic, quality, length in beats. */
export interface Chord {
  root: number;
  q: Quality;
  beats: number;
}

/**
 * Rootless voicing colours, in semitones above the chord root. The bass plays the root, so the
 * keys take the 3rd/7th guide tones plus 9ths, 11ths and 13ths: the soft jazz-trio sound of lofi.
 */
const COLORS: Record<Quality, readonly number[]> = {
  maj9: [4, 7, 11, 14],
  '69': [4, 7, 9, 14],
  m9: [3, 7, 10, 14],
  m11: [3, 10, 14, 17],
  m7: [3, 7, 10, 17], // m7(11): skips the 9th, which is out of key on iii and v
  m6: [3, 7, 9, 14],
  '9': [4, 7, 10, 14],
  '13': [4, 10, 14, 21],
  '7b9': [4, 10, 13, 20],
  '9sus': [5, 10, 14, 19],
  m7b5: [3, 6, 10, 17],
};

type Row = readonly [number, Quality, number];

// Each progression is 16 beats (a 4-bar cycle).
const MAJOR: readonly (readonly Row[])[] = [
  [[2, 'm9', 4], [7, '13', 4], [0, 'maj9', 4], [9, 'm9', 4]], // ii–V–I–vi
  [[0, 'maj9', 4], [9, 'm9', 4], [2, 'm9', 4], [7, '13', 4]], // I–vi–ii–V
  [[4, 'm7', 4], [9, 'm9', 4], [2, 'm9', 4], [7, '9sus', 2], [7, '13', 2]], // iii–vi–ii–V
  [[5, 'maj9', 4], [4, 'm7', 4], [2, 'm9', 4], [0, 'maj9', 4]], // IV–iii–ii–I
  [[5, 'maj9', 4], [4, '7b9', 4], [9, 'm9', 4], [7, 'm7', 2], [0, '9', 2]], // IV–III7–vi–v–I7
  [[0, '69', 4], [9, 'm9', 4], [5, 'maj9', 4], [7, '9sus', 4]], // I–vi–IV–Vsus
  [[0, 'maj9', 8], [5, 'maj9', 8]], // I–IV vamp
];

const MINOR: readonly (readonly Row[])[] = [
  [[0, 'm9', 4], [5, 'm9', 4], [10, '13', 4], [3, 'maj9', 4]], // i–iv–VII–III
  [[0, 'm9', 4], [8, 'maj9', 4], [5, 'm9', 4], [7, '7b9', 4]], // i–VI–iv–V
  [[2, 'm7b5', 4], [7, '7b9', 4], [0, 'm9', 8]], // ii°–V–i
  [[0, 'm9', 8], [5, '13', 8]], // dorian i–IV vamp
  [[8, 'maj9', 4], [7, 'm7', 4], [0, 'm9', 8]], // VI–v–i
  [[0, 'm11', 4], [10, '9', 4], [8, 'maj9', 4], [7, '7b9', 4]], // i–VII–VI–V
  [[5, 'm9', 4], [7, 'm7', 4], [0, 'm11', 4], [0, 'm9', 4]], // iv–v–i
];

/** One borrowed (modal-interchange or substitute) chord, used on every other 4-bar cycle. */
function borrow(rows: Chord[], minor: boolean, rng: Rng): Chord[] | null {
  const opts: Chord[][] = [];
  const sub = (i: number, root: number, q: Quality) => rows.map((c, j) => (j === i ? { root, q, beats: c.beats } : c));
  rows.forEach((c, i) => {
    const last = i === rows.length - 1;
    if (!minor) {
      if (c.root === 5 && c.q !== '7b9') opts.push(sub(i, 5, 'm6')); // iv from the parallel minor
      if (c.root === 9) opts.push(sub(i, 8, 'maj9')); // bVI in place of vi
      if (c.root === 7 && last) opts.push(sub(i, 10, '9'), sub(i, 1, '9')); // backdoor bVII9 / tritone sub
    } else {
      if (c.root === 7 && c.q === 'm7') opts.push(sub(i, 7, '7b9')); // harmonic-minor V
      if (c.root === 5 && c.q === 'm9') opts.push(sub(i, 5, '13')); // dorian IV
      if (c.root === 7 && last) opts.push(sub(i, 1, 'maj9')); // Neapolitan bII
    }
  });
  return opts.length ? rng.pick(opts) : null;
}

export function pickProgression(rng: Rng, minor: boolean): { prog: Chord[]; alt: Chord[] | null } {
  const rows = rng.pick(minor ? MINOR : MAJOR);
  const prog = rows.map(([root, q, beats]) => ({ root, q, beats }));
  return { prog, alt: rng.chance(0.55) ? borrow(prog, minor, rng) : null };
}

/** Pitch classes of the chord including its root (for melody checks). */
export function chordPcs(tonic: number, c: Chord): number[] {
  return [0, ...COLORS[c.q]].map((i) => (tonic + c.root + i) % 12);
}

const pcOf = (n: number): number => ((n % 12) + 12) % 12;

function voicingCost(v: readonly number[], prev: readonly number[] | null): number {
  const lo = v[0];
  const hi = v[v.length - 1];
  if (lo < 50 || hi > 77) return Infinity; // keep it between D3 and F5
  let c = Math.abs((lo + hi) / 2 - 61) * 0.45; // gravitate to the middle of the keyboard
  for (let i = 1; i < v.length; i++) {
    const iv = v[i] - v[i - 1];
    if (iv === 1) c += i === 1 ? 8 : v[i - 1] < 60 ? 5 : 2; // minor 2nds: muddy low down, spicy up top
    if (iv < 3 && v[i - 1] < 55) c += 3; // close intervals low down get muddy
  }
  if (prev && prev.length) {
    // Voice leading: every note should have a near neighbour in the previous chord (and vice versa).
    let m = 0;
    for (const n of v) m += Math.min(...prev.map((p) => Math.abs(p - n)));
    for (const p of prev) m += Math.min(...v.map((n) => Math.abs(p - n)));
    c += m * 0.5;
  }
  return c;
}

/** Picks the inversion (close or drop-2) of a rootless voicing with the smallest movement from `prev`. */
export function voiceChord(tonic: number, c: Chord, prev: readonly number[] | null, rich: boolean): number[] {
  const pcs = COLORS[c.q].map((i) => (tonic + c.root + i) % 12);
  let best: number[] = [];
  let bestCost = Infinity;
  for (let r = 0; r < pcs.length; r++) {
    for (let base = 50; base <= 65; base++) {
      if (pcOf(base) !== pcs[r]) continue;
      const close = [base];
      for (let j = 1; j < pcs.length; j++) {
        const last = close[j - 1];
        const up = pcOf(pcs[(r + j) % pcs.length] - last);
        close.push(last + (up === 0 ? 12 : up));
      }
      const drop2 = [close[close.length - 2] - 12, ...close.slice(0, -2), close[close.length - 1]].sort((a, b) => a - b);
      for (const cand of [close, drop2]) {
        const cost = voicingCost(cand, prev);
        if (cost < bestCost) {
          bestCost = cost;
          best = cand;
        }
      }
    }
  }
  if (rich && best.length) {
    // A "left hand" root under the voicing for a fuller, warmer chord, kept at least a 4th below
    // it (a 3rd that low turns to mud).
    const rootPc = (tonic + c.root) % 12;
    let n = best[0] - 5;
    while (pcOf(n) !== rootPc) n--;
    if (n >= 43) best = [n, ...best];
  }
  return best;
}

/** Bass root in E1..Bb2, as close as possible to the previous bass root. */
export function bassRoot(tonic: number, c: Chord, prev: number | null): number {
  const pc = (tonic + c.root) % 12;
  const target = prev ?? 39;
  let best = 0;
  for (let n = 33; n <= 46; n++) if (pcOf(n) === pc && (best === 0 || Math.abs(n - target) < Math.abs(best - target))) best = n;
  return best;
}

/** Pentatonic pitch classes of the key (major or minor pentatonic). */
export function pentatonic(tonic: number, minor: boolean): number[] {
  return (minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]).map((i) => (tonic + i) % 12);
}

/** A note a semitone above a chord tone clashes when held (the classic "avoid note"). */
export function isAvoid(pc: number, chord: readonly number[]): boolean {
  return chord.some((c) => pcOf(pc - c) === 1);
}

const ADJ = ['rainy', 'sleepy', 'paper', 'faded', 'quiet', 'warm', 'dusty', 'soft', 'foggy', 'slow', 'amber', 'blue', 'lazy', 'cozy', 'hazy', 'velvet', 'golden', 'lilac', 'drowsy', 'misty', 'mellow'];
const THING = ['window', 'lanterns', 'polaroids', 'notebooks', 'streetlights', 'radiator', 'kettle', 'cassettes', 'houseplants', 'umbrellas', 'postcards', 'city lights', 'desk lamp', 'headphones', 'cardigans', 'moonlight', 'rooftops', 'bicycles', 'laundry', 'snowfall', 'neon signs', 'vinyl', 'origami', 'fireflies', 'raindrops', 'sketchbooks'];
const TIME = ['2am', '3am', '4:17am', 'sunday morning', 'after the rain', 'midnight', 'before dawn', 'in november', 'on a tuesday', 'last summer', 'after school', 'at dusk'];
const DOING = ['tea on', 'reading on', 'napping on', 'daydreams on', 'coffee at', 'homework at', 'sunset from', 'stargazing from', 'raindrops on', 'cats on'];
const PLACE = ['the balcony', 'the rooftop', 'the windowsill', 'the library', 'the corner café', 'the old station', 'the attic', 'the night market', 'the porch', 'the harbor', 'the laundromat', 'the last train'];
const RIDE = ['bus', 'train', 'tram', 'ferry', 'bike ride', 'walk'];

/** Cozy lowercase titles like "rainy window, 2am", "tea on the balcony", "late bus home". */
export function trackName(rng: Rng): string {
  switch (rng.int(0, 4)) {
    case 0:
      return `${rng.pick(ADJ)} ${rng.pick(THING)}, ${rng.pick(TIME)}`;
    case 1:
      return `${rng.pick(DOING)} ${rng.pick(PLACE)}`;
    case 2:
      return `${rng.pick(ADJ)} ${rng.pick(THING)}`;
    case 3:
      return `${rng.pick(['late', 'last', 'slow', 'sleepy', 'quiet'])} ${rng.pick(RIDE)} home`;
    default: {
      const a = rng.pick(THING);
      let b = rng.pick(THING);
      if (b === a) b = 'tea';
      return `${a} & ${b}`;
    }
  }
}
