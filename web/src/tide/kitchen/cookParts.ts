import * as THREE from 'three';
import { mergeParts, tubeThrough } from '../../tank/geo';
import { cached, chain, cone, ellipsoid, meshSDF, mirrorX, type SDF, smin, sphere, ssub } from '../../tank/sdf';
import { mix, noise3, smoothstep } from '../../tank/util';

// The cook's sculpted parts. The kitchen is built at 1 unit = 1 m; a cook is
// about 1.35 m to the top of the toque: a chibi with a big round head.
// Skin, hair and cloth are painted in light neutral tones (white with shading,
// blush, folds) and tinted by their material's colour, so one sculpt serves
// every skin tone, hair colour and apron.

/**
 * Detail levels: 0 for close-ups, 1 for everything else (the usual views, where
 * a person is a hundred pixels tall). Level 1 samples the fields about twice as
 * coarsely and fills thin shells (hair, scarves) so they hold together.
 */
export type Lod = 0 | 1;
export const lodCell = (lod: Lod, near: number, far: number) => (lod ? far : near);

/** Where the parts join, in the cook's own frame (feet on y = 0, facing +z). */
export const RIG = {
  hipY: 0.3,
  hipX: 0.062,
  shoulderY: 0.6,
  shoulderX: 0.158,
  upperArm: 0.155,
  headY: 0.9,
  hatY: 0.115, // toque band above the head's centre
};

const tint = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const BLUSH = tint(1, 0.7, 0.68);
const EAR = tint(0.88, 0.74, 0.72);

// ---------- head ----------

const skull = ellipsoid(0, 0, 0, 0.235, 0.215, 0.21);
const cheeks = mirrorX(sphere(0.112, -0.078, 0.102, 0.09));
const jaw = ellipsoid(0, -0.098, 0.048, 0.16, 0.1, 0.152);
const ears = mirrorX(ellipsoid(0.228, -0.018, -0.008, 0.03, 0.052, 0.034));
const nose = ellipsoid(0, -0.042, 0.204, 0.024, 0.019, 0.019);

export const headSDF: SDF = (x, y, z) => {
  let d = smin(skull(x, y, z), cheeks(x, y, z), 0.07);
  d = smin(d, jaw(x, y, z), 0.06);
  d = smin(d, ears(x, y, z), 0.025);
  return smin(d, nose(x, y, z), 0.02);
};

/** The point on the face straight in front of (x, y), searching from inside the head. */
export function faceAt(x: number, y: number, lift = 0.002): THREE.Vector3 | null {
  let lo = 0.0;
  let hi = 0.32;
  if (headSDF(x, y, lo) > 0 || headSDF(x, y, hi) < 0) return null;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (headSDF(x, y, m) < 0) lo = m;
    else hi = m;
  }
  return new THREE.Vector3(x, y, hi + lift);
}

export function headGeometry(lod: Lod = 0) {
  return cached(`cook-head:${lod}`, () =>
    meshSDF(headSDF, {
      min: [-0.27, -0.24, -0.24],
      max: [0.27, 0.24, 0.26],
      cell: lodCell(lod, 0.0072, 0.0145),
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        out.setRGB(1, 1, 1);
        const bx = Math.abs(x) - 0.118;
        const by = y + 0.074;
        const bz = z - 0.15;
        mix(out, out, BLUSH, smoothstep(0.08, 0.02, Math.sqrt(bx * bx + by * by + bz * bz)) * 0.6);
        mix(out, out, EAR, smoothstep(0.205, 0.235, Math.abs(x)) * smoothstep(0.02, -0.04, z) * 0.5);
      },
    }),
  );
}

/** Smile (or an open "o" mouth) and eyebrows, laid on the face. Dark, so the skin tint barely changes them. */
export function mouthGeometry(open: boolean) {
  return cached(`cook-mouth:${open}`, () => {
    if (open) {
      const p = faceAt(0, -0.108, 0.0) ?? new THREE.Vector3(0, -0.108, 0.19);
      const g = new THREE.SphereGeometry(1, 20, 14).scale(0.026, 0.022, 0.012).translate(p.x, p.y, p.z);
      return paintAll(g, 0.24, 0.08, 0.1);
    }
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = -0.05 + (i / 12) * 0.1;
      const p = faceAt(x, -0.104 + 9 * x * x * x * x * 40 + 2.2 * x * x);
      if (p) pts.push(p);
    }
    return tubeThrough(pts, (t) => 0.0055 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.5), 40, 6, (_t, _a, o) => o.setRGB(0.3, 0.1, 0.11)).geometry;
  });
}

export function browGeometry() {
  return cached('cook-brows', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        const x = s * (0.05 + u * 0.068);
        const p = faceAt(x, 0.068 + Math.sin(u * Math.PI) * 0.012 - u * 0.006, 0.004);
        if (p) pts.push(p);
      }
      parts.push(tubeThrough(pts, (t) => 0.0085 * (1 - 0.35 * t), 18, 6).geometry);
    }
    return mergeParts(parts, ['position', 'normal']);
  });
}

function paintAll(g: THREE.BufferGeometry, r: number, gg: number, b: number) {
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) {
    col[i] = r;
    col[i + 1] = gg;
    col[i + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------- hair ----------

export type HairStyle = 'short' | 'bob' | 'bun' | 'ponytail';

/** Hair; `tuft`: a little tuft standing up at the crown of short hair (only on a bare head). */
export function hairGeometry(style: HairStyle, lod: Lod = 0, tuft = false) {
  return cached(`cook-hair2:${style}:${lod}:${tuft}`, () => {
    // a close cap of hair with its volume on the crown (not an even helmet)
    const outer = ellipsoid(0, 0.026, -0.016, 0.247, 0.232, 0.228);
    const crown = ellipsoid(0, 0.1, -0.03, 0.2, 0.15, 0.2);
    const inner = ellipsoid(0, 0, 0, 0.234, 0.214, 0.21);
    // the hairline: high over the forehead, down to the nape behind
    const keep = (y: number, z: number) => y - (0.082 - 0.22 * smoothstep(0.1, -0.17, z));
    // one swept fringe from a side parting, and a softer lock on the other side
    const sweep = ellipsoid(-0.035, 0.097, 0.17, 0.15, 0.052, 0.05);
    const lock = ellipsoid(0.14, 0.078, 0.15, 0.06, 0.06, 0.05);
    const sides = style === 'bob' ? mirrorX(ellipsoid(0.2, -0.05, 0.02, 0.06, 0.13, 0.15)) : mirrorX(ellipsoid(0.212, 0.02, 0.0, 0.042, 0.07, 0.088));
    const bun = sphere(0, 0.06, -0.24, 0.085);
    const tail = chain(
      ([
        [0, 0.05, -0.215],
        [0, -0.05, -0.285],
        [0, -0.18, -0.295],
        [0, -0.29, -0.265],
      ] as [number, number, number][]),
      0.062,
      0.024,
      0.03,
    );
    // a little tuft standing up at the crown of short hair
    const tuftSdf = cone(0.03, 0.2, -0.06, 0.05, 0.27, -0.09, 0.03, 0.006);
    const sdf: SDF = (x, y, z) => {
      const shell = smin(outer(x, y, z), crown(x, y, z), 0.05);
      // far away the hair is a solid cap (the head hides its inside), so a coarse grid can't break it
      let d = lod ? Math.max(shell, -keep(y, z)) : Math.max(ssub(shell, inner(x, y, z), 0.01), -keep(y, z));
      d = smin(d, sweep(x, y, z), 0.04);
      d = smin(d, lock(x, y, z), 0.035);
      d = smin(d, sides(x, y, z), 0.04);
      if (style === 'short' && tuft) d = smin(d, tuftSdf(x, y, z), 0.02);
      if (style === 'bun') d = smin(d, bun(x, y, z), 0.04);
      if (style === 'ponytail') d = smin(d, tail(x, y, z), 0.04);
      return d;
    };
    return meshSDF(sdf, {
      min: [-0.29, -0.34, -0.36],
      max: [0.29, 0.3, 0.26],
      cell: lodCell(lod, 0.0078, 0.0155),
      paint: (x, y, z, nx, ny, nz, out) => {
        // soft clumps rather than fine ribs, darker at the roots and underneath,
        // and a glossy band round the crown (the "angel ring")
        const a = Math.atan2(x, z);
        const clump = 0.5 + 0.5 * Math.sin(a * 13 + y * 9 + 1.6 * noise3(x * 7, y * 7, z * 7));
        out.setRGB(1, 1, 1).multiplyScalar(0.9 + 0.1 * clump);
        out.multiplyScalar(0.78 + 0.22 * smoothstep(-0.25, 0.15, y));
        const ring = smoothstep(0.03, 0.0, Math.abs(y - 0.13 - 0.03 * nz)) * smoothstep(0.1, 0.5, ny) * smoothstep(-0.2, 0.3, nz + 0.2 * Math.abs(nx));
        out.multiplyScalar(1 + 0.32 * ring * (0.7 + 0.3 * clump));
      },
    });
  });
}

// ---------- hats ----------

export type HatKind = 'toque' | 'short' | 'bandana';

/** A chef's toque, origin at the bottom of its band, which sits around the top of the head (over the hair). */
export function toqueGeometry(tall: boolean, lod: Lod = 0) {
  return cached(`cook-toque:${tall}:${lod}`, () => {
    const H = tall ? 0.19 : 0.1;
    const R = 0.222;
    const band: SDF = (x, y, z) => {
      const r = Math.hypot(x, z * 1.04) - R;
      const h = Math.abs(y - 0.042) - 0.042;
      const qx = Math.max(r + 0.012, 0);
      const qy = Math.max(h + 0.012, 0);
      return Math.hypot(qx, qy) + Math.min(Math.max(r + 0.012, h + 0.012), 0) - 0.012;
    };
    const puff = ellipsoid(0, 0.084 + H * 0.52, 0, R + 0.03, H * 0.6 + 0.02, R + 0.022);
    const sdf: SDF = (x, y, z) => {
      const a = Math.atan2(z, x);
      // soft pleats gathered into the band, fading toward the crown
      const p = puff(x, y, z) - 0.011 * (0.5 + 0.5 * Math.cos(a * 9)) * smoothstep(0.09, 0.16, y) * (1 - smoothstep(0.1 + H * 0.7, 0.12 + H, y));
      return Math.max(smin(band(x, y, z), p, 0.04), -y);
    };
    return meshSDF(sdf, {
      min: [-0.27, -0.01, -0.27],
      max: [0.27, 0.14 + H * 1.25, 0.27],
      cell: lodCell(lod, 0.0088, 0.017),
      paint: (x, y, z, _nx, ny, _nz, out) => {
        const a = Math.atan2(z, x);
        const pleat = 0.5 + 0.5 * Math.cos(a * 9);
        out.setRGB(1, 1, 1).multiplyScalar(0.8 + 0.2 * pleat * smoothstep(0.09, 0.16, y));
        out.multiplyScalar(smoothstep(-0.3, 0.7, ny) * 0.12 + 0.88);
        // the band's seam
        if (y < 0.088 && y > 0.078) out.multiplyScalar(0.85);
      },
    });
  });
}

/** A knotted headscarf over the top of the head (origin at the head's centre). */
export function bandanaGeometry(lod: Lod = 0) {
  return cached(`cook-bandana:${lod}`, () => {
    const outer = ellipsoid(0, 0.022, -0.01, 0.262, 0.246, 0.242);
    const inner = ellipsoid(0, 0.006, -0.004, 0.246, 0.226, 0.224);
    const keep = (y: number, z: number) => y - (0.11 - 0.1 * smoothstep(0.1, -0.15, z));
    const knot = sphere(0, 0.03, -0.25, 0.045);
    const tails = [cone(0, 0.02, -0.26, 0.06, -0.12, -0.27, 0.03, 0.012), cone(0, 0.02, -0.26, -0.05, -0.1, -0.29, 0.028, 0.012)];
    const sdf: SDF = (x, y, z) => {
      let d = lod ? Math.max(outer(x, y, z), -keep(y, z)) : Math.max(ssub(outer(x, y, z), inner(x, y, z), 0.01), -keep(y, z));
      d = smin(d, knot(x, y, z), 0.02);
      for (const t of tails) d = smin(d, t(x, y, z), 0.015);
      return d;
    };
    return meshSDF(sdf, {
      min: [-0.29, -0.16, -0.33],
      max: [0.29, 0.28, 0.27],
      cell: lodCell(lod, 0.0082, 0.016),
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        // tonal gingham: stripes across both ways, darker where they cross
        const r = Math.hypot(x, y, z) || 1;
        const pol = Math.acos(Math.max(-1, Math.min(1, y / r)));
        const u = Math.atan2(x, z) * 0.25 * Math.max(0.35, Math.sin(pol));
        const v = pol * 0.25;
        const su = smoothstep(-0.4, 0.4, Math.sin((Math.PI * u) / 0.022));
        const sv = smoothstep(-0.4, 0.4, Math.sin((Math.PI * v) / 0.022));
        out.setRGB(1, 1, 1).multiplyScalar(1 - 0.24 * su - 0.24 * sv);
      },
    });
  });
}

// ---------- body ----------

// A slim body under the big head (it read as plump at 0.18 x 0.156).
const belly = ellipsoid(0, 0.44, 0, 0.148, 0.2, 0.128);
const chest = ellipsoid(0, 0.556, 0.004, 0.146, 0.124, 0.122);
const shoulders = mirrorX(sphere(0.128, 0.6, 0, 0.055));
export const torsoCore: SDF = (x, y, z) => smin(smin(belly(x, y, z), chest(x, y, z), 0.08), shoulders(x, y, z), 0.06);

const BUTTONS: [number, number][] = [
  [-0.047, 0.405],
  [0.047, 0.405],
  [-0.047, 0.485],
  [0.047, 0.485],
  [-0.047, 0.565],
  [0.047, 0.565],
];
function buttonDist(x: number, y: number) {
  let d = 9;
  for (const [bx, by] of BUTTONS) d = Math.min(d, Math.hypot(x - bx, y - by));
  return d;
}

/** The chef's jacket: double-breasted, a stand-up collar, raised buttons. */
export function torsoGeometry(lod: Lod = 0) {
  return cached(`cook-torso:${lod}`, () => {
    const sdf: SDF = (x, y, z) => {
      let d = torsoCore(x, y, z);
      if (z > 0.05) d -= 0.0055 * smoothstep(0.018, 0.012, buttonDist(x, y));
      return Math.max(d, 0.255 - y);
    };
    return meshSDF(sdf, {
      min: [-0.24, 0.24, -0.2],
      max: [0.24, 0.7, 0.2],
      cell: lodCell(lod, 0.0082, 0.016),
      paint: (x, y, z, _nx, _ny, nz, out) => {
        out.setRGB(1, 1, 1);
        // folds and the front panel's overlap line
        out.multiplyScalar(0.9 + 0.1 * noise3(x * 9, y * 14, z * 9));
        const seam = smoothstep(0.006, 0.0, Math.abs(x - 0.074 + (0.6 - y) * 0.05)) * smoothstep(0.0, 0.6, nz);
        out.multiplyScalar(1 - seam * 0.18);
        if (nz > 0.25 && buttonDist(x, y) < 0.016) out.setRGB(0.18, 0.18, 0.22);
      },
    });
  });
}

/** A waist apron and its tie, tinted by the session's colour. */
export function apronGeometry(lod: Lod = 0) {
  return cached(`cook-apron:${lod}`, () => {
    const skirt = cone(0, 0.42, 0, 0, 0.06, 0.012, 0.163, 0.18);
    const sdf: SDF = (x, y, z) => {
      const shell = Math.abs(skirt(x, y, z)) - (lod ? 0.011 : 0.0065);
      const front = Math.max(shell, -(z + 0.035), y - 0.395, 0.1 - y);
      // the waist tie, all the way round
      const tie = Math.max(Math.abs(Math.hypot(x * 1.0, z * 1.12) - 0.16) - 0.011, Math.abs(y - 0.4) - 0.015);
      return Math.min(front, tie);
    };
    return meshSDF(sdf, {
      min: [-0.25, 0.08, -0.25],
      max: [0.25, 0.43, 0.26],
      cell: lodCell(lod, 0.0068, 0.014),
      paint: (x, y, _z, _nx, _ny, _nz, out) => {
        out.setRGB(1, 1, 1).multiplyScalar(0.86 + 0.14 * noise3(x * 30, y * 6, 1.3));
        if (y > 0.383) out.multiplyScalar(0.82);
      },
    });
  });
}

/** The jacket's stand-up collar (drawn in the jacket's cloth or a cook's own colour). */
export function collarGeometry(lod: Lod = 0) {
  return cached(`cook-collar:${lod}`, () => {
    const sdf: SDF = (x, y, z) => {
      const r = Math.hypot(x, z * 1.08);
      const ring = Math.max(Math.abs(r - 0.084) - 0.015, Math.abs(y - 0.652) - 0.03);
      return ring - 0.006;
    };
    return meshSDF(sdf, {
      min: [-0.14, 0.6, -0.14],
      max: [0.14, 0.7, 0.14],
      cell: lodCell(lod, 0.005, 0.01),
      paint: (_x, y, _z, _nx, _ny, _nz, out) => out.setRGB(1, 1, 1).multiplyScalar(y > 0.672 ? 1 : 0.9),
    });
  });
}

/** One leg from the hip pivot: trousers and a clog. */
export function legGeometry() {
  return cached('cook-leg', () => {
    const thigh = cone(0, 0, 0, 0, -0.235, 0.008, 0.056, 0.046);
    const shoe = ellipsoid(0, -0.27, 0.034, 0.053, 0.04, 0.094);
    const sdf: SDF = (x, y, z) => Math.max(smin(thigh(x, y, z), shoe(x, y, z), 0.024), -(y + 0.3));
    const cloth = new THREE.Color('#2e3140');
    const clog = new THREE.Color('#3c2b24');
    return meshSDF(sdf, {
      min: [-0.09, -0.31, -0.09],
      max: [0.09, 0.08, 0.16],
      cell: 0.0072,
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        mix(out, clog, cloth, smoothstep(-0.245, -0.228, y));
        out.multiplyScalar(0.88 + 0.12 * noise3(x * 25, y * 25, z * 25));
      },
    });
  });
}

/** Upper arm (sleeve) from the shoulder pivot, hanging along -y. */
export function upperArmGeometry(lod: Lod = 0) {
  return cached(`cook-upper-arm:${lod}`, () => {
    const arm = cone(0, 0.0, 0, 0, -RIG.upperArm, 0, 0.047, 0.041);
    return meshSDF(arm, {
      min: [-0.07, -0.22, -0.07],
      max: [0.07, 0.07, 0.07],
      cell: lodCell(lod, 0.0068, 0.013),
      paint: (x, y, z, _nx, _ny, _nz, out) => out.setRGB(1, 1, 1).multiplyScalar(0.9 + 0.1 * noise3(x * 30, y * 30, z * 30)),
    });
  });
}

/** Forearm sleeve down to the wrist, with a cuff, from the elbow pivot. */
export function sleeveGeometry(lod: Lod = 0) {
  return cached(`cook-sleeve2:${lod}`, () => {
    const sleeve = cone(0, 0, 0, 0, -0.104, 0, 0.042, 0.039);
    const cuff = (x: number, y: number, z: number) => Math.hypot(Math.hypot(x, z) - 0.038, y + 0.104) - 0.011;
    const sdf: SDF = (x, y, z) => smin(sleeve(x, y, z), cuff(x, y, z), 0.008);
    return meshSDF(sdf, {
      min: [-0.065, -0.125, -0.065],
      max: [0.065, 0.05, 0.065],
      cell: lodCell(lod, 0.0052, 0.0095),
      paint: (_x, y, _z, _nx, _ny, _nz, out) => out.setRGB(1, 1, 1).multiplyScalar(y < -0.094 ? 0.88 : 1),
    });
  });
}

/**
 * Forearm and a hand, from the elbow pivot (thumb toward +x for the right
 * hand). A mitten, not a ball: a flat palm a little narrower than it is long,
 * the fingers' end rounded off, a thumb standing clear of it, and a slim wrist
 * (the sleeve covers the forearm; a toymaker's rolled sleeves show it).
 */
export function handGeometry(right: boolean, lod: Lod = 0) {
  return cached(`cook-hand2:${right}:${lod}`, () => {
    const s = right ? 1 : -1;
    const fore = cone(0, -0.03, 0, 0, -0.128, 0.002, 0.034, 0.027);
    const palm = ellipsoid(0, -0.162, 0.006, 0.037, 0.04, 0.022);
    const fingers = ellipsoid(0, -0.192, 0.01, 0.033, 0.03, 0.019);
    const thumb = cone(s * 0.024, -0.148, 0.014, s * 0.04, -0.176, 0.03, 0.0135, 0.011);
    const sdf: SDF = (x, y, z) => smin(smin(smin(fore(x, y, z), palm(x, y, z), 0.02), fingers(x, y, z), 0.016), thumb(x, y, z), 0.008);
    return meshSDF(sdf, {
      min: [-0.065, -0.235, -0.045],
      max: [0.065, -0.01, 0.06],
      cell: lodCell(lod, 0.0042, 0.0078),
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        out.setRGB(1, 1, 1);
        // a faint crease where the thumb meets the palm, a little warmth at the knuckles
        const crease = smoothstep(0.012, 0.0, Math.abs(s * x - 0.02 - (y + 0.155) * 0.3)) * smoothstep(-0.13, -0.15, y) * smoothstep(0.0, 0.02, z);
        out.multiplyScalar(1 - 0.1 * crease);
        if (y < -0.2) out.multiplyScalar(0.97);
      },
    });
  });
}

/** Round glasses, sitting on the nose. */
export function glassesGeometry() {
  return cached('cook-glasses', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const c = faceAt(s * 0.085, 0.0, 0.03) ?? new THREE.Vector3(s * 0.085, 0, 0.21);
      parts.push(new THREE.TorusGeometry(0.052, 0.006, 8, 40).translate(c.x, c.y, c.z));
      const ear = new THREE.Vector3(s * 0.222, 0.0, 0.06);
      parts.push(tubeThrough([new THREE.Vector3(s * 0.137, 0.0, c.z - 0.005), new THREE.Vector3(s * 0.2, 0.004, 0.12), ear], () => 0.0045, 16, 5).geometry);
    }
    const l = faceAt(-0.033, 0.012, 0.035) ?? new THREE.Vector3(-0.033, 0.012, 0.23);
    const r = faceAt(0.033, 0.012, 0.035) ?? new THREE.Vector3(0.033, 0.012, 0.23);
    parts.push(tubeThrough([l, new THREE.Vector3(0, 0.02, l.z + 0.005), r], () => 0.0045, 10, 5).geometry);
    return mergeParts(parts, ['position', 'normal']);
  });
}

/** A neat moustache under the nose. */
export function moustacheGeometry() {
  return cached('cook-moustache', () => {
    const p = faceAt(0, -0.07, -0.004) ?? new THREE.Vector3(0, -0.07, 0.2);
    const lobes = mirrorX(ellipsoid(0.03, p.y - 0.002, p.z, 0.034, 0.014, 0.016));
    const tip = mirrorX(ellipsoid(0.062, p.y + 0.006, p.z - 0.01, 0.014, 0.009, 0.01));
    const sdf: SDF = (x, y, z) => smin(lobes(x, y, z), tip(x, y, z), 0.012);
    return meshSDF(sdf, { min: [-0.1, p.y - 0.04, p.z - 0.05], max: [0.1, p.y + 0.04, p.z + 0.04], cell: 0.0035, paint: (_x, _y, _z, _nx, _ny, _nz, out) => out.setRGB(1, 1, 1) });
  });
}
