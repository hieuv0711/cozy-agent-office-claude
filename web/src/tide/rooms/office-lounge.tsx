import { useMemo } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { meshSDF, type SDF } from '../../tank/sdf';
import { boxProject, capsuleZ, cushion, occlusion, rbox, smin } from './office-sdf';
import { SEATS } from '../office/plan';
import { FLOOR_LAMP, LOUNGE, RUG, SIDEBOARD } from './office-dims';
import { C, fbm3, leatherTex, Merger, mix, noise3, omat, once, paint, paintLathe, plank, rand, roundRect, slab, smoothLathe, smoothstep, tex, trs, V, woodTex } from './office-kit';
import { LAMP_SHADE } from './office-lights';
import { bookStack, propMats, smallPlant } from './office-props';

// The lounge in the back left corner, where idle people have coffee and doze:
// a deep green velvet sofa against the brick (sculpted soft, with plump seat
// and back cushions and rolled arms) with two throw pillows, a cognac leather
// club chair by the side window, a walnut coffee table on hairpin legs, a
// faded vintage rug, a tripod floor lamp with a linen drum shade, and a
// cane-fronted sideboard against the wall for the coffee things.

export function loungeMats() {
  return {
    velvet: omat('l:velvet', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, sheen: 1, sheenRoughness: 0.42, sheenColor: new THREE.Color('#7fd0a8') })),
    pillow: omat('l:pillow', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.85, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffd9a0') })),
    leather: omat('l:leather', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, roughnessMap: leatherTex(), bumpMap: leatherTex(), bumpScale: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45 })),
    walnut: omat('l:walnut', () => new THREE.MeshStandardMaterial({ map: woodTex('o-walnut', { w: 1024, h: 512, light: '#8a5a38', dark: '#2e180c', planks: 2, rings: 9, seed: 141, joints: false, seams: 0.3, figure: 0.9 }), roughness: 0.42, vertexColors: true })),
    steel: omat('l:steel', () => new THREE.MeshStandardMaterial({ color: '#1a1918', metalness: 0.6, roughness: 0.45 })),
    brass: omat('l:brass', () => new THREE.MeshStandardMaterial({ color: '#c09a54', metalness: 0.92, roughness: 0.28 })),
    rug: omat('l:rug', () => new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 0.95, vertexColors: true })),
    linen: omat('l:linen', () => new THREE.MeshStandardMaterial({ map: linenTex(), emissiveMap: linenTex(), emissive: new THREE.Color('#ffb46a'), emissiveIntensity: 1.1, roughness: 0.9, side: THREE.DoubleSide })),
    cane: omat('l:cane', () => new THREE.MeshStandardMaterial({ map: caneTex(), roughness: 0.75 })),
    bulb: omat('l:bulb', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffdcaa').multiplyScalar(2), toneMapped: false })),
    glass: omat('l:glass', () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, roughness: 0.08, clearcoat: 1, depthWrite: false })),
  };
}
type LMats = ReturnType<typeof loungeMats>;

// ---------- the sofa ----------

const SOFA = { w: LOUNGE.sofa.x1 - LOUNGE.sofa.x0, d: LOUNGE.sofa.depth, cx: (LOUNGE.sofa.x0 + LOUNGE.sofa.x1) / 2, cz: LOUNGE.sofa.z };

function sofaGeometries() {
  return once('office:sofa', () => {
    const hw = SOFA.w / 2;
    const hd = SOFA.d / 2;
    const arm = 0.27;
    const frameParts: SDF[] = [
      rbox(0, 0.27, 0, hw, 0.11, hd - 0.02, 0.05),
      rbox(-hw + arm / 2, 0.45, 0, arm / 2, 0.27, hd - 0.01, 0.09),
      rbox(hw - arm / 2, 0.45, 0, arm / 2, 0.27, hd - 0.01, 0.09),
      capsuleZ(-hw + arm / 2, 0.69, -hd + 0.12, hd - 0.1, 0.14),
      capsuleZ(hw - arm / 2, 0.69, -hd + 0.12, hd - 0.1, 0.14),
      rbox(0, 0.74, -hd + 0.12, hw - 0.02, 0.44, 0.12, 0.1),
    ];
    const inner = hw - arm;
    const cw = (inner * 2) / 3;
    const cushions: SDF[] = [];
    for (let i = -1; i <= 1; i++) {
      cushions.push(cushion(i * cw, 0.435, 0.07, cw / 2 - 0.008, 0.055, hd - 0.1, 0.05, 0.022));
      cushions.push(cushion(i * cw, 0.84, -hd + 0.33, cw / 2 - 0.01, 0.27, 0.095, 0.09, 0.05, 0.14));
    }
    const frame: SDF = (x, y, z) => {
      let d = frameParts[0](x, y, z);
      for (let i = 1; i < frameParts.length; i++) d = smin(d, frameParts[i](x, y, z), 0.05);
      return d;
    };
    const all: SDF = (x, y, z) => {
      let d = frame(x, y, z);
      for (const c of cushions) d = Math.min(d, c(x, y, z));
      return d;
    };
    const green = C('#2a5644');
    const g = meshSDF(all, {
      min: [-hw - 0.05, 0.12, -hd - 0.05],
      max: [hw + 0.05, 1.3, hd + 0.05],
      cell: 0.024,
      paint: (x, y, z, nx, ny, nz, out) => {
        const ao = occlusion(all, x, y, z, nx, ny, nz, 0.07);
        out.copy(green).multiplyScalar(0.42 + 0.58 * ao);
        out.multiplyScalar(0.92 + 0.12 * fbm3(x * 3, y * 3, z * 3));
        // the pile is crushed paler where people sit and lean
        if (ny > 0.6 && y > 0.45 && y < 0.55) mix(out, out, C('#4a7a62'), 0.18 * smoothstep(0.3, -0.2, z - 0.1) * (0.6 + 0.4 * noise3(x * 4, 2, z * 4)));
      },
    });
    // tapered walnut legs with brass caps
    const legs = new Merger();
    const caps = new Merger();
    for (const sx of [-1, 0, 1])
      for (const sz of [-1, 1]) {
        if (sx === 0 && sz === 1) continue;
        const leg = smoothLathe(
          [
            [0, 0.03],
            [0.032, 0.03],
            [0.045, 0.16],
            [0, 0.16],
          ],
          6,
          16,
        );
        const p: [number, number, number] = [sx * (hw - 0.12), 0, sz * (hd - 0.1)];
        legs.add(leg, trs(p));
        caps.add(new THREE.CylinderGeometry(0.031, 0.029, 0.03, 16), trs([p[0], 0.015, p[2]]));
      }
    return { body: g, legs: paint(legs.build(), (_x, y, _z, out) => out.setScalar(0.8 + y)), caps: caps.build() };
  });
}

/** A square throw pillow, plump in the middle and pinched at the corners. */
function pillowGeometry(colour: string, pattern: 'stripe' | 'plain') {
  return once(`office:pillow:${colour}:${pattern}`, () => {
    const h = 0.23;
    const f: SDF = (x, y, z) => {
      const ax = Math.min(1, Math.abs(x) / h);
      const ay = Math.min(1, Math.abs(y) / h);
      const t = 0.012 + 0.075 * (1 - ax * ax) * (1 - ay * ay);
      // a rounded square in plan, intersected with the swelling thickness
      const rc = 0.035;
      const qx = Math.abs(x) - h + rc;
      const qy = Math.abs(y) - h + rc;
      const flat = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc;
      return Math.max(flat, Math.abs(z) - t);
    };
    const base = C(colour);
    return meshSDF(f, {
      min: [-h - 0.03, -h - 0.03, -0.11],
      max: [h + 0.03, h + 0.03, 0.11],
      cell: 0.012,
      lipschitz: 2.2,
      paint: (x, y, _z, _nx, _ny, _nz, out) => {
        out.copy(base);
        if (pattern === 'stripe' && Math.abs(Math.sin(x * 26)) > 0.7) out.multiplyScalar(0.7);
        // a piped edge
        if (Math.max(Math.abs(x), Math.abs(y)) > h - 0.012) out.multiplyScalar(0.75);
        out.multiplyScalar(0.9 + 0.12 * noise3(x * 10, y * 10, 3));
      },
    });
  });
}

// ---------- the armchair ----------

function armchairGeometries() {
  return once('office:armchair', () => {
    const parts: SDF[] = [
      rbox(0, 0.27, 0.02, 0.53, 0.12, 0.47, 0.08),
      rbox(-0.42, 0.47, 0.02, 0.11, 0.26, 0.47, 0.1),
      rbox(0.42, 0.47, 0.02, 0.11, 0.26, 0.47, 0.1),
      capsuleZ(-0.42, 0.7, -0.38, 0.44, 0.125),
      capsuleZ(0.42, 0.7, -0.38, 0.44, 0.125),
      rbox(0, 0.78, -0.37, 0.52, 0.42, 0.12, 0.12),
    ];
    const seat = cushion(0, 0.435, 0.07, 0.3, 0.06, 0.4, 0.05, 0.022);
    const all: SDF = (x, y, z) => {
      let d = parts[0](x, y, z);
      for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), i === 5 ? 0.16 : 0.07);
      return Math.min(d, seat(x, y, z));
    };
    const cognac = C('#8a4a26');
    const g = meshSDF(all, {
      min: [-0.6, 0.12, -0.56],
      max: [0.6, 1.26, 0.56],
      cell: 0.018,
      paint: (x, y, z, nx, ny, nz, out) => {
        const ao = occlusion(all, x, y, z, nx, ny, nz, 0.06);
        out.copy(cognac).multiplyScalar(0.45 + 0.55 * ao);
        // worn paler on the arm rolls and the seat's front, darker in the folds
        const wear = smoothstep(0.62, 0.8, y) * smoothstep(0.3, 0.5, Math.abs(x)) + (ny > 0.5 && y < 0.55 ? smoothstep(0.2, 0.45, z) : 0);
        mix(out, out, C('#b8743e'), Math.min(1, wear) * 0.4 * (0.6 + 0.4 * noise3(x * 6, y * 6, z * 6)));
        out.multiplyScalar(0.92 + 0.1 * fbm3(x * 5, y * 5, z * 5));
      },
    });
    boxProject(g, 1.6);
    const feet = new Merger();
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        feet.add(
          smoothLathe(
            [
              [0, 0],
              [0.04, 0],
              [0.05, 0.04],
              [0.042, 0.1],
              [0.05, 0.15],
              [0, 0.15],
            ],
            10,
            16,
          ),
          trs([sx * 0.44, 0, sz * 0.4 + 0.02]),
        );
      }
    return { body: g, feet: paint(feet.build(), (_x, _y, _z, out) => out.setScalar(0.7)) };
  });
}

// ---------- the coffee table ----------

function coffeeTableGeometries() {
  return once('office:coffee-table', () => {
    const { w, d, top } = LOUNGE.table;
    const t = 0.055;
    const g = slab(roundRect(w, d, 0.2), t, 0.018, 3, 12).rotateX(-Math.PI / 2);
    // UVs along the length for the grain
    const p = g.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = p.getX(i) / 1.6 + 0.2;
      uv[i * 2 + 1] = p.getZ(i) / 0.8 + 0.1;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.translate(0, top - t / 2, 0);
    paint(g, (x, y, z, out) => {
      out.setScalar(0.94 + 0.08 * noise3(x * 3, y, z * 3));
      // a few pale rings where mugs have stood
      for (const [rx, rz] of [
        [0.35, 0.12],
        [-0.42, -0.08],
      ] as [number, number][]) {
        const rr = Math.hypot(x - rx, z - rz);
        if (y > top - 0.005) out.multiplyScalar(1 + smoothstep(0.012, 0.0, Math.abs(rr - 0.06)) * 0.12);
      }
    });
    // hairpin legs: two rods from a plate under the top, meeting at the floor in a tight bend
    const legs = new Merger();
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - 0.16);
        const z = sz * (d / 2 - 0.12);
        const a = Math.atan2(sz, sx * 0.5);
        const pts: THREE.Vector3[] = [];
        for (const s of [-1, 1]) {
          const ox = Math.cos(a + Math.PI / 2) * 0.07 * s;
          const oz = Math.sin(a + Math.PI / 2) * 0.07 * s;
          if (s < 0) pts.push(V(x + ox, top - t, z + oz), V(x + ox * 0.3, 0.06, z + oz * 0.3));
          else pts.push(V(x + ox * 0.3, 0.06, z + oz * 0.3), V(x + ox, top - t, z + oz));
        }
        const bend = [pts[0], pts[1], V(x, 0.012, z), pts[2], pts[3]];
        legs.add(tubeThrough(bend, () => 0.009, 40, 8).geometry);
        legs.add(plank(0.16, 0.008, 0.16, 0.004, 1, 1), trs([x, top - t - 0.004, z], [0, -a, 0]));
      }
    return { top: g, legs: legs.build() };
  });
}

/** A French press on a small wooden tray with a sugar bowl: coffee for whoever comes by. */
function coffeeTrayGeometries() {
  return once('office:coffee-tray', () => {
    const tray = new Merger();
    tray.add(plank(0.5, 0.018, 0.3, 0.006, [1 / 0.6, 1 / 0.6], 1), trs([0, 0.009, 0]));
    for (const s of [-1, 1]) tray.add(plank(0.5, 0.04, 0.016, 0.006, 1, 1), trs([0, 0.03, s * 0.142]));
    for (const s of [-1, 1]) tray.add(plank(0.016, 0.04, 0.3, 0.006, 1, 1), trs([s * 0.242, 0.03, 0]));
    // the press: a glass jug of dark coffee in a steel frame, plunger up
    const n = 20;
    const coffee = smoothLathe(
      [
        [0, 0.03],
        [0.06, 0.03],
        [0.062, 0.2],
        [0, 0.2],
      ],
      n,
      28,
    );
    paintLathe(coffee, n, (_x, y, _z, _a, out) => out.set(y > 0.19 ? '#6a4026' : '#1a0c06'));
    const jug = new THREE.CylinderGeometry(0.067, 0.067, 0.26, 28, 1, true).translate(0, 0.16, 0);
    const steel = new Merger();
    steel.add(new THREE.CylinderGeometry(0.072, 0.072, 0.03, 28), trs([0, 0.03, 0]));
    steel.add(new THREE.CylinderGeometry(0.072, 0.07, 0.025, 28), trs([0, 0.3, 0]));
    steel.add(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8), trs([0, 0.36, 0]));
    steel.add(new THREE.SphereGeometry(0.018, 12, 8), trs([0, 0.42, 0]));
    steel.add(tubeThrough([V(0.07, 0.25, 0), V(0.12, 0.24, 0), V(0.125, 0.12, 0), V(0.07, 0.08, 0)], () => 0.01, 12, 6).geometry);
    // a sugar bowl with a lid
    const bowl = smoothLathe(
      [
        [0, 0],
        [0.04, 0],
        [0.06, 0.03],
        [0.062, 0.07],
        [0.055, 0.075],
        [0.06, 0.09],
        [0.03, 0.1],
        [0.012, 0.115],
        [0, 0.12],
      ],
      20,
      24,
    );
    paintLathe(bowl, 20, (_x, _y, _z, _a, out) => out.set('#e8dfcc'));
    return { tray: tray.build(), coffee, jug, steel: steel.build(), bowl };
  });
}

// ---------- the rug ----------

/** A faded vintage rug: a border of bands and running motifs, a field of small diamonds round a stepped medallion; worn pale in patches. */
function rugTex() {
  return tex(
    'o-rug',
    2048,
    1376,
    (g, w, h) => {
      const r = rand(17);
      const field = '#8a3a2a';
      g.fillStyle = field;
      g.fillRect(0, 0, w, h);
      const ink = '#2a2440';
      const cream = '#e2d2b0';
      const ochre = '#c8903e';
      const teal = '#3a6a6a';
      // the border: three bands with a running zigzag in the wide one
      const b0 = 30;
      const b1 = 120;
      g.fillStyle = ink;
      g.fillRect(0, 0, w, b1 + b0);
      g.fillRect(0, h - b1 - b0, w, b1 + b0);
      g.fillRect(0, 0, b1 + b0, h);
      g.fillRect(w - b1 - b0, 0, b1 + b0, h);
      g.fillStyle = cream;
      for (const inset of [b0 * 0.5, b1 + b0 * 0.6]) {
        g.strokeStyle = cream;
        g.lineWidth = 10;
        g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
      }
      g.strokeStyle = ochre;
      g.lineWidth = 9;
      const zig = (x0: number, y0: number, x1: number, y1: number, amp: number) => {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const n = Math.floor(len / 46);
        const ux = (x1 - x0) / len;
        const uy = (y1 - y0) / len;
        g.beginPath();
        for (let i = 0; i <= n; i++) {
          const t = (i / n) * len;
          const o = i % 2 ? amp : -amp;
          const px = x0 + ux * t - uy * o;
          const py = y0 + uy * t + ux * o;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      };
      const m = b0 + b1 / 2;
      zig(m, m, w - m, m, 26);
      zig(m, h - m, w - m, h - m, 26);
      zig(m, m, m, h - m, 26);
      zig(w - m, m, w - m, h - m, 26);
      // the field: a lattice of small diamonds
      const fx0 = b1 + b0 + 30;
      const fy0 = b1 + b0 + 30;
      for (let y = fy0; y < h - fy0; y += 70)
        for (let x = fx0 + ((y / 70) % 2) * 35; x < w - fx0; x += 70) {
          g.fillStyle = r() < 0.5 ? 'rgba(42,36,64,0.55)' : 'rgba(200,144,62,0.45)';
          g.beginPath();
          g.moveTo(x, y - 14);
          g.lineTo(x + 10, y);
          g.lineTo(x, y + 14);
          g.lineTo(x - 10, y);
          g.closePath();
          g.fill();
        }
      // the stepped medallion in the middle, with a smaller one either side
      const medal = (cx: number, cy: number, s: number) => {
        const steps = [
          [1.0, ink],
          [0.82, cream],
          [0.7, teal],
          [0.52, ochre],
          [0.36, ink],
          [0.2, cream],
        ] as [number, string][];
        for (const [k, col] of steps) {
          g.fillStyle = col;
          g.beginPath();
          const R = s * k;
          // a stepped (hooked) diamond
          const st = R / 4;
          g.moveTo(cx, cy - R);
          for (let i = 0; i < 4; i++) {
            g.lineTo(cx + st * (i + 1), cy - R + st * i);
            g.lineTo(cx + st * (i + 1), cy - R + st * (i + 1));
          }
          for (let i = 0; i < 4; i++) {
            g.lineTo(cx + R - st * i, cy + st * (i + 1));
            g.lineTo(cx + R - st * (i + 1), cy + st * (i + 1));
          }
          for (let i = 0; i < 4; i++) {
            g.lineTo(cx - st * (i + 1), cy + R - st * i);
            g.lineTo(cx - st * (i + 1), cy + R - st * (i + 1));
          }
          for (let i = 0; i < 4; i++) {
            g.lineTo(cx - R + st * i, cy - st * (i + 1));
            g.lineTo(cx - R + st * (i + 1), cy - st * (i + 1));
          }
          g.closePath();
          g.fill();
        }
      };
      medal(w / 2, h / 2, h * 0.27);
      medal(w * 0.22, h / 2, h * 0.14);
      medal(w * 0.78, h / 2, h * 0.14);
      // the weave: fine rows, abrash (bands of slightly different dye), knots
      for (let y = 0; y < h; y += 3) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,240,220' : '0,0,0'},${0.03 + r() * 0.04})`;
        g.fillRect(0, y, w, 1.5);
      }
      for (let i = 0; i < 9; i++) {
        const x = r() * w;
        g.fillStyle = `rgba(${r() < 0.5 ? '255,220,190' : '40,10,10'},0.05)`;
        g.fillRect(x, 0, 40 + r() * 120, h);
      }
      for (let i = 0; i < 40000; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,240,220' : '20,10,10'},${0.05 + r() * 0.08})`;
        g.fillRect(r() * w, r() * h, 2, 2);
      }
      // worn pale where feet go
      for (let i = 0; i < 14; i++) {
        const x = w * (0.2 + r() * 0.6);
        const y = h * (0.15 + r() * 0.7);
        const rr = 80 + r() * 200;
        const grad = g.createRadialGradient(x, y, 0, x, y, rr);
        grad.addColorStop(0, 'rgba(230,200,170,0.16)');
        grad.addColorStop(1, 'rgba(230,200,170,0)');
        g.fillStyle = grad;
        g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
    },
    { repeat: false },
  );
}

function rugGeometry() {
  return once('office:rug', () => {
    const m = new Merger();
    const g = new THREE.PlaneGeometry(RUG.w, RUG.d, 40, 28).rotateX(-Math.PI / 2);
    // it lies almost flat: a soft ripple, and the edges curl down to the floor
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const edge = Math.min(RUG.w / 2 - Math.abs(x), RUG.d / 2 - Math.abs(z));
      p.setY(i, 0.014 * smoothstep(0, 0.05, edge) + 0.008 * Math.max(0, noise3(x * 0.8, 1, z * 0.8)));
    }
    g.computeVertexNormals();
    paint(g, (x, _y, z, out) => out.setScalar(0.9 + 0.12 * noise3(x * 1.2, 4, z * 1.2)));
    m.add(g);
    // tassels at the two short ends
    const r = rand(6);
    const fringe = new Merger();
    for (const s of [-1, 1])
      for (let z = -RUG.d / 2 + 0.03; z < RUG.d / 2; z += 0.035) {
        const len = 0.1 + r() * 0.04;
        const a = (r() - 0.5) * 0.5;
        fringe.add(tubeThrough([V(s * RUG.w / 2, 0.008, z), V(s * (RUG.w / 2 + len * 0.6), 0.004, z + a * 0.03), V(s * (RUG.w / 2 + len), 0.003, z + a * 0.06)], () => 0.005, 3, 3).geometry);
      }
    return { rug: m.build(), fringe: paint(fringe.build(), (_x, _y, _z, out) => out.set('#d8c8a6').multiplyScalar(0.85 + r() * 0.2)) };
  });
}

// ---------- the floor lamp ----------

function linenTex() {
  return tex('o-linen', 256, 256, (g, w, h) => {
    const r = rand(23);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#e8cfa0');
    grad.addColorStop(0.5, '#fff0d4');
    grad.addColorStop(1, '#e8cfa0');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '160,120,70'},${0.05 + r() * 0.08})`;
      g.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 2) {
      g.fillStyle = `rgba(160,120,70,${0.03 + r() * 0.05})`;
      g.fillRect(x, 0, 1, h);
    }
  });
}

export function floorLampGeometries() {
  return once('office:floor-lamp', () => {
    const top = LAMP_SHADE[1];
    const wood = new Merger();
    const brass = new Merger();
    // three splayed walnut legs from a brass collar
    const hub = 1.15;
    // turned so no foot reaches the sofa's end or the spot where people stop before sitting
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 2.88;
      const foot = V(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
      const leg = tubeThrough([foot, V(Math.cos(a) * 0.04, hub, Math.sin(a) * 0.04)], (t) => 0.022 - t * 0.006, 4, 10).geometry;
      wood.add(leg);
      brass.add(new THREE.CylinderGeometry(0.024, 0.022, 0.03, 12), trs([foot.x * 0.99, 0.015, foot.z * 0.99]));
    }
    brass.add(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 16), trs([0, hub, 0]));
    brass.add(new THREE.CylinderGeometry(0.014, 0.014, top - hub - 0.2, 12), trs([0, (hub + top - 0.2) / 2, 0]));
    // the harp holding the shade, a socket, a finial
    brass.add(tubeThrough([V(-0.16, top + 0.12, 0), V(-0.12, top - 0.12, 0), V(0, top - 0.2, 0), V(0.12, top - 0.12, 0), V(0.16, top + 0.12, 0)], () => 0.006, 20, 6).geometry);
    brass.add(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 14), trs([0, top - 0.15, 0]));
    brass.add(new THREE.SphereGeometry(0.03, 12, 8), trs([0, top + 0.17, 0]));
    // the drum shade: linen, open top and bottom
    const shade = new THREE.CylinderGeometry(0.3, 0.33, 0.44, 48, 1, true).translate(0, top, 0);
    const bulb = new THREE.SphereGeometry(0.06, 16, 10).scale(1, 1.3, 1).translate(0, top - 0.05, 0);
    return { wood: wood.build(), brass: brass.build(), shade, bulb };
  });
}

// ---------- the sideboard ----------

/** Woven cane: the octagonal open weave of a chair seat, tan strands over a dark interior. */
function caneTex() {
  return tex('o-cane', 512, 512, (g, w, h) => {
    g.fillStyle = '#1a120c';
    g.fillRect(0, 0, w, h);
    const s = 32;
    g.lineCap = 'round';
    const strand = (x0: number, y0: number, x1: number, y1: number) => {
      g.strokeStyle = '#7a5a30';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = '#d8b878';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    };
    for (let i = -1; i <= w / s + 1; i++) {
      strand(i * s, 0, i * s, h);
      strand(0, i * s, w, i * s);
    }
    for (let i = -w / s; i <= w / s * 2; i++) {
      strand(i * s, 0, i * s + h, h);
      strand(i * s, h, i * s + h, 0);
    }
  });
}

function sideboardGeometries() {
  return once('office:sideboard', () => {
    const { x0, x1, z0, z1, top } = SIDEBOARD;
    const w = x1 - x0;
    const d = z1 - z0;
    const legH = 0.2;
    const bodyH = top - legH;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const wood = new Merger();
    wood.add(plank(w, 0.045, d, 0.015, [1 / 1.2, 1 / 0.6], 2), trs([cx, top - 0.0225, cz]));
    wood.add(plank(w - 0.02, bodyH - 0.05, d - 0.02, 0.012, [1 / 1.2, 1 / 1.2], 1), trs([cx, legH + (bodyH - 0.05) / 2, cz - 0.005]));
    // door frames round the cane panels
    const doorW = (w - 0.06) / 2;
    const frames = new Merger();
    for (const s of [-1, 1]) {
      const dx = cx + (s * (doorW + 0.01)) / 2;
      const fy = legH + 0.04 + (bodyH - 0.14) / 2;
      for (const sy of [-1, 1]) frames.add(plank(doorW, 0.06, 0.03, 0.008, [1 / 1.2, 1 / 1.2], 1), trs([dx, fy + sy * ((bodyH - 0.14) / 2 - 0.03), z1 + 0.01]));
      for (const sx of [-1, 1]) frames.add(plank(0.06, bodyH - 0.14, 0.03, 0.008, [1 / 1.2, 1 / 1.2], 1, [0, 0], true), trs([dx + sx * (doorW / 2 - 0.03), fy, z1 + 0.01]));
    }
    wood.add(frames.build());
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const leg = smoothLathe(
          [
            [0, 0],
            [0.022, 0],
            [0.034, legH],
            [0, legH],
          ],
          4,
          14,
        );
        wood.add(leg, trs([cx + sx * (w / 2 - 0.08), 0, cz + sz * (d / 2 - 0.08)], [sz * 0.08, 0, -sx * 0.08]));
      }
    const panels = new Merger();
    const brass = new Merger();
    for (const s of [-1, 1]) {
      const dx = cx + (s * (doorW + 0.01)) / 2;
      const fy = legH + 0.04 + (bodyH - 0.14) / 2;
      const pg = new THREE.PlaneGeometry(doorW - 0.1, bodyH - 0.24);
      panels.add(pg, trs([dx, fy, z1 + 0.012]));
      brass.add(new THREE.SphereGeometry(0.022, 12, 8), trs([cx + s * 0.06, fy, z1 + 0.04]));
    }
    return { wood: paint(wood.build(), (x, y, z, out) => out.setScalar(0.9 + 0.12 * noise3(x * 3, y * 3, z * 3))), panels: panels.build(), brass: brass.build() };
  });
}

// ---------- assembled ----------

export function Lounge() {
  const m = loungeMats();
  const p = propMats();
  const sofa = sofaGeometries();
  const pillows = useMemo(() => [pillowGeometry('#c8922e', 'plain'), pillowGeometry('#a8502e', 'stripe')], []);
  const chair = armchairGeometries();
  const table = coffeeTableGeometries();
  const tray = coffeeTrayGeometries();
  const rug = rugGeometry();
  const lamp = floorLampGeometries();
  const side = sideboardGeometries();
  const plant = smallPlant(4);
  const books = useMemo(() => once('office:lounge-books', () => bookStack(3, 51, 0.85)), []);
  const t = LOUNGE.table;
  const armYaw = SEATS[1].yaw;
  return (
    <group>
      <mesh geometry={rug.rug} material={m.rug} position={[RUG.x, 0, RUG.z]} receiveShadow userData={{ surface: 'floor' }} />
      <mesh geometry={rug.fringe} material={p.vc} position={[RUG.x, 0, RUG.z]} receiveShadow />
      <group position={[SOFA.cx, 0, SOFA.cz]}>
        <mesh geometry={sofa.body} material={m.velvet} castShadow receiveShadow />
        <mesh geometry={sofa.legs} material={m.walnut} castShadow />
        <mesh geometry={sofa.caps} material={m.brass} />
        {/* the pillows lean into the corners */}
        <mesh geometry={pillows[0]} material={m.pillow} position={[-SOFA.w / 2 + 0.47, 0.72, -0.18]} rotation={[-0.32, 0.5, 0.12]} castShadow receiveShadow />
        <mesh geometry={pillows[1]} material={m.pillow} position={[SOFA.w / 2 - 0.47, 0.72, -0.18]} rotation={[-0.3, -0.45, -0.18]} castShadow receiveShadow />
      </group>
      <group position={[LOUNGE.armchair.x, 0, LOUNGE.armchair.z]} rotation={[0, armYaw, 0]}>
        <mesh geometry={chair.body} material={m.leather} castShadow receiveShadow />
        <mesh geometry={chair.feet} material={m.walnut} castShadow />
      </group>
      <group position={[t.x, 0, t.z]}>
        <mesh geometry={table.top} material={m.walnut} castShadow receiveShadow userData={{ surface: 'top' }} />
        <mesh geometry={table.legs} material={m.steel} castShadow />
        <group position={[-0.42, t.top, 0.04]} rotation={[0, 0.25, 0]}>
          <mesh geometry={tray.tray} material={m.walnut} castShadow receiveShadow />
          <mesh geometry={tray.coffee} material={p.glaze} position={[-0.1, 0.018, 0]} />
          <mesh geometry={tray.jug} material={m.glass} position={[-0.1, 0.018, 0]} renderOrder={2} />
          <mesh geometry={tray.steel} material={p.metal} position={[-0.1, 0.018, 0]} castShadow />
          <mesh geometry={tray.bowl} material={p.glaze} position={[0.12, 0.018, 0.02]} castShadow />
        </group>
        <group position={[0.42, t.top, -0.13]} rotation={[0, -0.4, 0]}>
          <mesh geometry={books} material={p.vc} castShadow receiveShadow />
        </group>
        <group position={[0.6, t.top, 0.2]}>
          <mesh geometry={plant.pot} material={plant.glazed ? p.glaze : p.vc} castShadow />
          <mesh geometry={plant.soil} material={p.vc} />
          <mesh geometry={plant.plant} material={p.leaf} castShadow />
        </group>
      </group>
      <group position={FLOOR_LAMP}>
        <mesh geometry={lamp.wood} material={m.walnut} castShadow />
        <mesh geometry={lamp.brass} material={m.brass} castShadow />
        <mesh geometry={lamp.shade} material={m.linen} />
        <mesh geometry={lamp.bulb} material={m.bulb} />
      </group>
      <mesh geometry={side.wood} material={m.walnut} castShadow receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={side.panels} material={m.cane} receiveShadow />
      <mesh geometry={side.brass} material={m.brass} />
    </group>
  );
}

export type { LMats };
