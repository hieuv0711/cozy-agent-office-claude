import * as THREE from 'three';
import { mergeParts, tubeThrough } from '../../tank/geo';
import { cached, cone, ellipsoid, meshSDF, type SDF, smin, sphere, ssub } from '../../tank/sdf';
import { mix, noise3, smoothstep } from '../../tank/util';
import { type Lod, lodCell, torsoCore, torsoGeometry } from '../kitchen/cookParts';

// Clothes for the people of each theme, sculpted around the same chibi body as
// the cooks (kitchen/cookParts.ts; cook metres, feet on y = 0, facing +z).
// Like the cook's parts they are painted in light tones (pattern and shading)
// and tinted by their material, so one sculpt serves every colour.

export type TorsoKind = 'chef' | 'sweater' | 'plaid' | 'coat' | 'shirt' | 'rain';
export type LegKind = 'chef' | 'jeans' | 'work' | 'dark';

const around = (x: number, z: number) => Math.atan2(x, z);

/** The upper body in a given garment. */
export function torsoFor(kind: TorsoKind, lod: Lod = 0): THREE.BufferGeometry {
  if (kind === 'chef') return torsoGeometry(lod);
  return cached(`crew-torso2:${kind}:${lod}`, () => {
    const puff = kind === 'rain' ? 0.017 : kind === 'coat' ? 0.012 : kind === 'sweater' ? 0.005 : 0.002;
    const sdf: SDF = (x, y, z) => {
      let d = torsoCore(x, y, z) - puff;
      if (kind === 'rain') {
        // a rain jacket over the clothes: a zip down the front, flared at the hem, two pocket flaps
        if (z > 0.05) d -= 0.0035 * smoothstep(0.007, 0.002, Math.abs(x));
        d -= 0.012 * smoothstep(0.33, 0.24, y);
        if (z > 0.06) d -= 0.003 * smoothstep(0.006, 0.0, Math.abs(y - 0.37)) * smoothstep(0.03, 0.05, Math.abs(x)) * smoothstep(0.12, 0.1, Math.abs(x));
        return Math.max(d, 0.232 - y);
      }
      if (kind === 'sweater') {
        // a ribbed hem and a ribbed crew neck
        const a = around(x, z);
        d -= 0.0028 * Math.cos(a * 46) * smoothstep(0.305, 0.285, y);
        d -= 0.006 * smoothstep(0.31, 0.275, y);
      }
      if (kind === 'coat') {
        // the two fronts overlap a little down the middle, with big buttons
        if (z > 0.05) d -= 0.006 * smoothstep(0.02, 0.012, Math.hypot(x - 0.012, ((y - 0.38) % 0.085) - 0.0425 + 0.0001));
      }
      if (kind === 'plaid' || kind === 'shirt') {
        // a button placket
        if (z > 0.05) d -= 0.003 * smoothstep(0.016, 0.01, Math.abs(x));
      }
      return Math.max(d, 0.255 - y);
    };
    return meshSDF(sdf, {
      min: [-0.26, 0.22, -0.22],
      max: [0.26, 0.71, 0.22],
      cell: lodCell(lod, 0.0082, 0.016),
      paint: (x, y, z, _nx, _ny, nz, out) => {
        out.setRGB(1, 1, 1);
        const a = around(x, z);
        if (kind === 'sweater') {
          // a fine knit: vertical ribs, a darker band at the hem
          out.multiplyScalar(0.9 + 0.08 * Math.sin(a * 70 + noise3(x * 30, y * 30, z * 30)) + 0.04 * noise3(x * 9, y * 9, z * 9));
          if (y < 0.3) out.multiplyScalar(0.86);
        } else if (kind === 'plaid') {
          // a soft flannel check: darker stripes both ways, darkest where they cross
          const u = a * 0.17;
          const sx = smoothstep(0.3, 0.7, 0.5 + 0.5 * Math.sin(u * 95));
          const sy = smoothstep(0.3, 0.7, 0.5 + 0.5 * Math.sin(y * 95));
          const thin = smoothstep(0.92, 0.98, Math.abs(Math.sin(u * 190 + 1.3))) + smoothstep(0.92, 0.98, Math.abs(Math.sin(y * 190 + 1.3)));
          out.multiplyScalar(1 - 0.22 * sx - 0.22 * sy + 0.18 * Math.min(1, thin));
          if (nz > 0.6 && Math.abs(x) < 0.012) out.multiplyScalar(0.88);
        } else if (kind === 'rain') {
          // smooth and shiny (the material does the gloss): the zip, the flaps' shadows, a seam at the shoulders
          out.multiplyScalar(0.94 + 0.06 * noise3(x * 6, y * 6, z * 6));
          if (nz > 0.5 && Math.abs(x) < 0.005) out.multiplyScalar(0.55);
          if (nz > 0.4 && Math.abs(y - 0.362) < 0.005 && Math.abs(x) > 0.032 && Math.abs(x) < 0.118) out.multiplyScalar(0.7);
          if (Math.abs(y - 0.62) < 0.004) out.multiplyScalar(0.85);
          if (y < 0.25) out.multiplyScalar(0.9);
        } else if (kind === 'coat') {
          // wool, with a soft shadow line down the front and dark buttons
          out.multiplyScalar(0.88 + 0.12 * noise3(x * 40, y * 40, z * 40));
          if (nz > 0.5 && Math.abs(x - 0.012) < 0.006) out.multiplyScalar(0.7);
          if (nz > 0.5 && Math.hypot(x - 0.012, ((y - 0.38) % 0.085) - 0.0425) < 0.013 && y > 0.3 && y < 0.62) out.setRGB(0.25, 0.22, 0.2);
        } else {
          // a crisp shirt: folds, a placket with small buttons
          out.multiplyScalar(0.92 + 0.08 * noise3(x * 12, y * 18, z * 12));
          if (nz > 0.6 && Math.abs(x) < 0.004 && Math.abs(((y - 0.3) % 0.06) - 0.03) < 0.006) out.setRGB(0.6, 0.6, 0.62);
        }
      },
    });
  });
}

/** One leg from the hip pivot, in a given pair of trousers and shoes. */
export function legFor(kind: LegKind, lod: Lod = 0): THREE.BufferGeometry {
  return cached(`crew-leg2:${kind}:${lod}`, () => {
    const thigh = cone(0, 0, 0, 0, -0.235, 0.008, 0.056, 0.046);
    const boot = kind === 'work' || kind === 'dark';
    const shoe = ellipsoid(0, -0.27, 0.034, 0.053, boot ? 0.046 : 0.04, 0.094);
    const sole = ellipsoid(0, -0.296, 0.034, 0.055, 0.011, 0.096);
    const sdf: SDF = (x, y, z) => Math.max(smin(smin(thigh(x, y, z), shoe(x, y, z), 0.03), sole(x, y, z), 0.008), -(y + 0.305));
    const cloth = new THREE.Color(kind === 'chef' ? '#2e3140' : kind === 'jeans' ? '#3d5a86' : kind === 'work' ? '#6b5236' : '#34343c');
    const shoeC = new THREE.Color(kind === 'chef' ? '#3c2b24' : kind === 'jeans' ? '#ece7dc' : kind === 'work' ? '#3a2a20' : '#4a3426');
    const soleC = new THREE.Color(kind === 'jeans' ? '#c9c2b4' : '#211a16');
    return meshSDF(sdf, {
      min: [-0.09, -0.32, -0.09],
      max: [0.09, 0.08, 0.16],
      cell: lodCell(lod, 0.0072, 0.014),
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        const top = boot ? -0.21 : -0.228;
        mix(out, shoeC, cloth, smoothstep(top - 0.017, top, y));
        if (y < -0.288) out.copy(soleC);
        if (kind === 'jeans' && y > top) out.multiplyScalar(0.86 + 0.14 * Math.sin(y * 260 + x * 90) * 0.5 + 0.1 * noise3(x * 40, y * 40, z * 40));
        else out.multiplyScalar(0.88 + 0.12 * noise3(x * 25, y * 25, z * 25));
      },
    });
  });
}

/** A canvas bib apron: chest pocket, neck strap, waist ties (the toymaker's; tinted by the session's colour). */
export function bibApronGeometry(lod: Lod = 0) {
  return cached(`crew-bib-apron2:${lod}`, () => {
    const skirt = cone(0, 0.42, 0, 0, 0.1, 0.012, 0.165, 0.181);
    const bib: SDF = (x, y, z) => {
      const shell = Math.abs(torsoCore(x, y, z) - 0.014) - (lod ? 0.011 : 0.0065);
      // the bib's outline: narrow at the top, out to the sides at the waist
      const half = 0.084 + Math.max(0, 0.6 - y) * 0.5;
      const edge = Math.max(Math.abs(x) - half, y - 0.62, 0.36 - y);
      return Math.max(shell, edge, -(z - 0.02));
    };
    const pocket: SDF = (x, y, z) => Math.max(Math.abs(torsoCore(x, y, z) - 0.022) - (lod ? 0.009 : 0.005), Math.abs(x) - 0.052, Math.abs(y - 0.5) - 0.04, -(z - 0.05));
    const lower: SDF = (x, y, z) => Math.max(Math.abs(skirt(x, y, z)) - (lod ? 0.011 : 0.0065), -(z + 0.04), y - 0.4, 0.12 - y);
    const strap = (s: number) => cone(s * 0.076, 0.62, 0.112, s * 0.064, 0.69, -0.02, 0.011, 0.011);
    const sdf: SDF = (x, y, z) => {
      let d = Math.min(bib(x, y, z), lower(x, y, z));
      d = Math.min(d, pocket(x, y, z));
      d = Math.min(d, strap(1)(x, y, z), strap(-1)(x, y, z));
      return d;
    };
    return meshSDF(sdf, {
      min: [-0.26, 0.1, -0.1],
      max: [0.26, 0.72, 0.27],
      cell: lodCell(lod, 0.0062, 0.0125),
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        // canvas weave and a stitched pocket
        out.setRGB(1, 1, 1).multiplyScalar(0.86 + 0.08 * Math.sin(x * 400) * Math.sin(y * 400) + 0.08 * noise3(x * 20, y * 20, z * 20));
        if (Math.abs(y - 0.5) < 0.042 && Math.abs(x) < 0.054 && z > 0.1) out.multiplyScalar(0.9);
        if (Math.abs(Math.abs(y - 0.5) - 0.038) < 0.003 && Math.abs(x) < 0.054) out.multiplyScalar(0.75);
      },
    });
  });
}

/** Shirt collar points peeking out of a sweater's neck. */
export function shirtCollarGeometry() {
  return cached('crew-shirt-collar2', () => {
    const point = (s: number): SDF => {
      const a = ellipsoid(s * 0.04, 0.664, 0.087, 0.036, 0.023, 0.01);
      return (x, y, z) => {
        // a flat wedge, cut to a point toward the chest
        const d = a(x, y, z);
        return Math.max(d, (y - 0.664) * 0.7 - (s * (x - s * 0.06)) * 0.9 - 0.02);
      };
    };
    const band: SDF = (x, y, z) => Math.max(Math.abs(Math.hypot(x, z * 1.06) - 0.083) - 0.008, Math.abs(y - 0.675) - 0.018);
    const sdf: SDF = (x, y, z) => Math.min(band(x, y, z), point(1)(x, y, z), point(-1)(x, y, z));
    return meshSDF(sdf, { min: [-0.13, 0.62, -0.12], max: [0.13, 0.71, 0.14], cell: 0.004, paint: (_x, _y, _z, _nx, _ny, _nz, out) => out.setRGB(0.97, 0.96, 0.93) });
  });
}

/** A chunky knitted scarf, wound once round the neck with one end hanging down the front. */
export function scarfGeometry(lod: Lod = 0) {
  return cached(`crew-scarf2:${lod}`, () => {
    const ring: SDF = (x, y, z) => {
      const q = Math.hypot(x, z * 1.05) - 0.092;
      return Math.hypot(q, (y - 0.665) * 1.4) - 0.033;
    };
    const tail = cone(0.06, 0.65, 0.088, 0.078, 0.47, 0.136, 0.029, 0.025);
    const sdf: SDF = (x, y, z) => smin(ring(x, y, z), Math.max(tail(x, y, z), Math.abs(z - 0.112 - (0.65 - y) * 0.27) - 0.013), 0.02);
    return meshSDF(sdf, {
      min: [-0.15, 0.44, -0.15],
      max: [0.15, 0.72, 0.2],
      cell: lodCell(lod, 0.0055, 0.011),
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        // knit ribs and a stripe at the end
        out.setRGB(1, 1, 1).multiplyScalar(0.86 + 0.1 * Math.sin(around(x, z) * 60 + y * 200));
        if (y < 0.53 && y > 0.5) out.setRGB(0.95, 0.93, 0.88);
      },
    });
  });
}

/** A flat cap (tweed), origin at the head's centre. */
export function flatCapGeometry(lod: Lod = 0) {
  return cached(`crew-flatcap:${lod}`, () => {
    const crown = ellipsoid(0, 0.148, -0.012, 0.268, 0.118, 0.262);
    const brim = ellipsoid(0, 0.122, 0.205, 0.17, 0.016, 0.105);
    const button = sphere(0, 0.262, 0.01, 0.018);
    const sdf: SDF = (x, y, z) => {
      const c = Math.max(crown(x, y, z), 0.105 - y + Math.max(0, z) * 0.12);
      return smin(smin(c, brim(x, y, z), 0.02), button(x, y, z), 0.01);
    };
    return meshSDF(sdf, {
      min: [-0.3, 0.08, -0.3],
      max: [0.3, 0.29, 0.33],
      cell: lodCell(lod, 0.0078, 0.015),
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        const tweed = 0.5 + 0.5 * Math.sin(x * 300 + y * 120) * Math.sin(z * 300 - y * 140);
        out.setRGB(1, 1, 1).multiplyScalar(0.8 + 0.15 * tweed + 0.08 * noise3(x * 50, y * 50, z * 50));
      },
    });
  });
}

/** A knitted beanie with a folded cuff and a pompom, origin at the head's centre. */
export function beanieGeometry(lod: Lod = 0) {
  return cached(`crew-beanie:${lod}`, () => {
    const outer = ellipsoid(0, 0.03, -0.012, 0.262, 0.262, 0.252);
    const inner = ellipsoid(0, 0.014, -0.006, 0.244, 0.238, 0.232);
    const keep = (y: number, z: number) => y - (0.095 - 0.08 * smoothstep(0.1, -0.15, z));
    const cuff: SDF = (x, y, z) => {
      const r = Math.hypot(x, z * 1.03) - 0.262;
      const h = Math.abs(y - (0.13 - 0.08 * smoothstep(0.1, -0.15, z))) - 0.035;
      return Math.max(r - 0.012, h);
    };
    const pom = sphere(0, 0.31, -0.01, 0.055);
    const sdf: SDF = (x, y, z) => {
      let d = lod ? Math.max(outer(x, y, z), -keep(y, z)) : Math.max(ssub(outer(x, y, z), inner(x, y, z), 0.01), -keep(y, z));
      d = Math.min(d, Math.max(cuff(x, y, z), -keep(y, z) - 0.002));
      return smin(d, pom(x, y, z) - 0.006 * noise3(x * 120, y * 120, z * 120), 0.015);
    };
    return meshSDF(sdf, {
      min: [-0.3, -0.05, -0.3],
      max: [0.3, 0.38, 0.28],
      cell: lodCell(lod, 0.0078, 0.015),
      lipschitz: 2,
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        out.setRGB(1, 1, 1).multiplyScalar(0.84 + 0.12 * Math.sin(around(x, z) * 52));
        if (y > 0.26) out.setRGB(0.98, 0.96, 0.92);
      },
    });
  });
}

/** Headphones over the hair: a band ear to ear and two padded cups (origin at the head's centre). */
export function headphonesGeometry() {
  return cached('crew-headphones', () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI * (i / 16);
      pts.push(new THREE.Vector3(Math.cos(a) * 0.262, Math.sin(a) * 0.262 + 0.01, -0.01));
    }
    const band = tubeThrough(pts, () => 0.012, 40, 8).geometry;
    const cups = [-1, 1].map((s) => new THREE.CylinderGeometry(0.062, 0.066, 0.05, 24).rotateZ(Math.PI / 2).translate(s * 0.262, 0.0, -0.005));
    const pads = [-1, 1].map((s) => new THREE.TorusGeometry(0.05, 0.016, 8, 24).rotateY(Math.PI / 2).translate(s * 0.24, 0.0, -0.005));
    return mergeParts([band, ...cups, ...pads], ['position', 'normal']);
  });
}

/** Rolled-up shirt sleeves: a cuff band on the forearm (the toymaker's). */
export function rolledCuffGeometry() {
  return cached('crew-rolled-cuff2', () => {
    const sdf: SDF = (x, y, z) => Math.hypot(Math.hypot(x, z) - 0.039, (y + 0.035) * 0.8) - 0.0145;
    return meshSDF(sdf, { min: [-0.09, -0.07, -0.09], max: [0.09, 0.0, 0.09], cell: 0.004, paint: (_x, _y, _z, _nx, _ny, _nz, out) => out.setRGB(0.92, 0.92, 0.92) });
  });
}


/** A rain jacket's hood, down: bunched behind the neck, with a collar band in front (in the jacket's colour). */
export function hoodGeometry(lod: Lod = 0) {
  return cached(`crew-hood:${lod}`, () => {
    const lump = ellipsoid(0, 0.682, -0.098, 0.112, 0.058, 0.06);
    const band: SDF = (x, y, z) => Math.max(Math.abs(Math.hypot(x, z * 1.04) - 0.09) - 0.017, Math.abs(y - 0.66) - 0.026);
    const sdf: SDF = (x, y, z) => smin(lump(x, y, z), band(x, y, z), 0.03);
    return meshSDF(sdf, {
      min: [-0.16, 0.6, -0.19],
      max: [0.16, 0.76, 0.13],
      cell: lodCell(lod, 0.005, 0.0095),
      paint: (x, y, z, _nx, _ny, _nz, out) => {
        out.setRGB(1, 1, 1).multiplyScalar(0.92 + 0.08 * noise3(x * 20, y * 20, z * 20));
        // the hood's opening, folded under
        if (z < -0.06 && y > 0.7) out.multiplyScalar(0.72);
      },
    });
  });
}

/** A straw sun hat for a sunny day: a round crown and a wide brim (origin at the head's centre). */
export function sunHatGeometry() {
  return cached('crew-sunhat', () => {
    const profile: [number, number][] = [
      [0, 0.305],
      [0.09, 0.3],
      [0.165, 0.278],
      [0.212, 0.232],
      [0.232, 0.17],
      [0.24, 0.11],
      [0.29, 0.094],
      [0.36, 0.082],
      [0.415, 0.064],
      [0.432, 0.05],
    ];
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      48,
    );
    // woven straw: rings of lighter and darker rows
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const k = 0.9 + 0.1 * Math.sin((r + pos.getY(i)) * 160);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
}

/** The ribbon round a sun hat's crown. */
export function sunHatBandGeometry() {
  return cached('crew-sunhat-band', () =>
    new THREE.LatheGeometry(
      [
        [0.243, 0.106],
        [0.246, 0.128],
        [0.238, 0.152],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      48,
    ),
  );
}

/** Dark lenses for a pair of sunglasses (the frames are the glasses' own), at the eyes. */
export function sunglassLensGeometry(faceAt: (x: number, y: number, out: number) => THREE.Vector3 | null) {
  return cached('crew-sunglass-lens', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const c = faceAt(s * 0.085, 0.0, 0.03) ?? new THREE.Vector3(s * 0.085, 0, 0.21);
      parts.push(new THREE.SphereGeometry(0.054, 18, 10).scale(1, 0.84, 0.32).translate(c.x, c.y, c.z + 0.003));
    }
    return mergeParts(parts, ['position', 'normal']);
  });
}
