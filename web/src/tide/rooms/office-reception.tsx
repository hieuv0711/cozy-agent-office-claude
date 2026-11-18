import { useMemo } from 'react';
import * as THREE from 'three';
import { tubeThrough } from '../../tank/geo';
import { WAIT_LAMPS } from '../office/plan';
import { CEIL, RECEPTION, RECEPTION_R } from './office-dims';
import { bumpTex, C, Merger, mix, noise3, omat, once, paint, paintLathe, plank, rand, smoothLathe, smoothstep, tex, trs, V } from './office-kit';
import { boxProject } from './office-sdf';
import { potGeometry, propMats } from './office-props';

// The reception on the right: a counter rounded at its front corners, its
// front and sides clad in close vertical flutes painted deep green, a speckled
// terrazzo top with a soft rounded edge, a black plinth and a brass foot rail.
// On it, a service bell, the guest book open with a pen, a little pilea in a
// pot and a brass tray of blank cards. Over it hang the two yellow lamps the
// people's code lights when someone waits (WAIT_BULBS).

/** The two lamps' bulbs, one material each: dim until someone waits under that lamp (the people's code turns it up). */
export const WAIT_BULBS = [0, 1].map((i) => omat(`wait-bulb-${i}`, () => new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffc770', emissiveIntensity: 0.35, roughness: 0.3 })));

export function receptionMats() {
  return {
    paint: omat('r:paint', () => new THREE.MeshPhysicalMaterial({ color: '#244436', roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3, bumpMap: bumpTex('o-paint', { scale: 10, contrast: 0.5 }), bumpScale: 0.25, vertexColors: true })),
    terrazzo: omat('r:terrazzo', () => new THREE.MeshPhysicalMaterial({ map: terrazzoTex(), roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.25 })),
    plinth: omat('r:plinth', () => new THREE.MeshStandardMaterial({ color: '#161412', roughness: 0.6 })),
    brass: omat('r:brass', () => new THREE.MeshStandardMaterial({ color: '#c49c56', metalness: 0.92, roughness: 0.26, side: THREE.DoubleSide })),
    chrome: omat('r:chrome', () => new THREE.MeshStandardMaterial({ color: '#e2e4e8', metalness: 1, roughness: 0.14 })),
    enamel: omat('r:enamel', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide })),
    cord: omat('r:cord', () => new THREE.MeshStandardMaterial({ color: '#1d1a17', roughness: 0.75 })),
    page: omat('r:page', () => new THREE.MeshStandardMaterial({ map: guestPageTex(), roughness: 0.85, side: THREE.DoubleSide })),
  };
}
type RMats = ReturnType<typeof receptionMats>;

/** Warm white terrazzo: chips of terracotta, sage, charcoal, ochre and grey in a fine speckled ground. One tile = 1.6 units. Tiles. */
function terrazzoTex() {
  return tex('o-terrazzo', 1024, 1024, (g, w, h) => {
    const r = rand(73);
    g.fillStyle = '#e6ddcd';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(120,110,100,${0.12 + r() * 0.2})` : `rgba(255,255,250,${0.2 + r() * 0.2})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    const chips = ['#b8735a', '#a8644a', '#8aa08a', '#4a4846', '#c8a878', '#a8a29a', '#d8c0b0', '#6a7a6e'];
    for (let i = 0; i < 1100; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = 2 + Math.pow(r(), 2.6) * 15;
      const col = chips[Math.floor(r() * chips.length)];
      const sides = 4 + Math.floor(r() * 4);
      const pts: [number, number][] = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2 + r() * 0.6;
        const rr = s * (0.6 + r() * 0.5);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      for (const dx of [0, -w, w])
        for (const dy of [0, -h, h]) {
          if (x + dx < -40 || x + dx > w + 40 || y + dy < -40 || y + dy > h + 40) continue;
          g.fillStyle = col;
          g.beginPath();
          pts.forEach(([px, py], k) => (k ? g.lineTo(x + dx + px, y + dy + py) : g.moveTo(x + dx + px, y + dy + py)));
          g.closePath();
          g.fill();
          // a paler polished face on the chip
          g.fillStyle = 'rgba(255,255,255,0.12)';
          g.fill();
        }
    }
  });
}

/** A guest book's page: cream paper, faint ruled lines, a few entries in loose looping pen (not writing). */
function guestPageTex() {
  return tex('o-guest-page', 512, 512, (g, w, h) => {
    const r = rand(8);
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#d8ccb0');
    grad.addColorStop(0.08, '#f1e8d4');
    grad.addColorStop(1, '#efe5cf');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,140,170,0.35)';
    g.lineWidth = 1.2;
    for (let y = 60; y < h - 20; y += 34) {
      g.beginPath();
      g.moveTo(30, y);
      g.lineTo(w - 24, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(190,80,70,0.35)';
    g.beginPath();
    g.moveTo(70, 20);
    g.lineTo(70, h - 10);
    g.stroke();
    // loose loops along some lines: the look of handwriting from a distance, without letters
    g.lineCap = 'round';
    for (let line = 0; line < 9; line++) {
      if (r() < 0.25) continue;
      const y = 60 + line * 34 - 6;
      g.strokeStyle = r() < 0.6 ? 'rgba(30,40,80,0.75)' : 'rgba(40,30,30,0.75)';
      g.lineWidth = 1.6;
      g.beginPath();
      let x = 84;
      const end = 140 + r() * (w - 200);
      g.moveTo(x, y);
      while (x < end) {
        const step = 6 + r() * 8;
        g.quadraticCurveTo(x + step * 0.5, y - 6 - r() * 10, x + step, y + (r() - 0.5) * 3);
        x += step;
        if (r() < 0.12) {
          x += 10;
          g.moveTo(x, y);
        }
      }
      g.stroke();
    }
  });
}

// ---------- the counter ----------

const X0 = RECEPTION.x0;
const X1 = RECEPTION.x1;
const ZB = RECEPTION.back;
const ZF = RECEPTION.front;
const TOP = RECEPTION.top;

/** The counter's outline in plan (x, z), the front corners rounded; inset (or outset, negative) by d. */
function outline(d: number) {
  const R = RECEPTION_R - d;
  const s = new THREE.Shape();
  // shape coordinates are (x, -z), so the extrusion can be turned up to stand on the floor
  // the corners share their centres whatever the inset; in shape space the front (larger z) is lower y
  const cy = -(ZF - RECEPTION_R);
  s.moveTo(X0 + d, -ZB);
  s.lineTo(X0 + d, cy);
  s.absarc(X0 + RECEPTION_R, cy, R, Math.PI, Math.PI * 1.5, false);
  s.lineTo(X1 - RECEPTION_R, cy - R);
  s.absarc(X1 - RECEPTION_R, cy, R, Math.PI * 1.5, Math.PI * 2, false);
  s.lineTo(X1 - d, -ZB);
  s.closePath();
  return s;
}

/** A point and outward normal along the counter's visible faces (left side, front-left corner, front, front-right corner, right side), by distance t. */
function frontPath() {
  const R = RECEPTION_R;
  const segs: { len: number; at: (s: number) => [number, number, number, number] }[] = [
    { len: ZF - R - ZB, at: (s) => [X0, ZB + s, -1, 0] },
    { len: (Math.PI / 2) * R, at: (s) => {
      const a = Math.PI + s / R;
      return [X0 + R + Math.cos(a) * R, ZF - R - Math.sin(a) * R, Math.cos(a), -Math.sin(a)];
    } },
    { len: X1 - X0 - 2 * R, at: (s) => [X0 + R + s, ZF, 0, 1] },
    { len: (Math.PI / 2) * R, at: (s) => {
      const a = Math.PI / 2 - s / R;
      return [X1 - R + Math.cos(a) * R, ZF - R + Math.sin(a) * R, Math.cos(a), Math.sin(a)];
    } },
    { len: ZF - R - ZB, at: (s) => [X1, ZF - R - s, 1, 0] },
  ];
  const total = segs.reduce((a, b) => a + b.len, 0);
  return {
    total,
    at(t: number) {
      let rest = t;
      for (const sg of segs) {
        if (rest <= sg.len) return sg.at(rest);
        rest -= sg.len;
      }
      return segs[segs.length - 1].at(segs[segs.length - 1].len);
    },
  };
}

function counterGeometries() {
  const up = (g: THREE.BufferGeometry, y: number) => g.rotateX(-Math.PI / 2).translate(0, y, 0);
  // the core, the plinth and the top
  const core = up(new THREE.ExtrudeGeometry(outline(0.035), { depth: TOP - 0.065 - 0.1, bevelEnabled: false, curveSegments: 16 }), 0.1);
  paint(core, (_x, y, _z, out) => out.setScalar(0.8 + 0.2 * smoothstep(0.1, 0.9, y)));
  const plinth = up(new THREE.ExtrudeGeometry(outline(0.09), { depth: 0.1, bevelEnabled: false, curveSegments: 16 }), 0);
  const top = up(new THREE.ExtrudeGeometry(outline(-0.05), { depth: 0.04, bevelEnabled: true, bevelSize: 0.022, bevelThickness: 0.022, bevelSegments: 4, curveSegments: 24 }), TOP - 0.062);
  boxProject(top, 1 / 1.6);
  // the flutes: half-round reeds standing round the visible faces
  const flutes = new Merger();
  const path = frontPath();
  const pitch = 0.07;
  const n = Math.floor(path.total / pitch);
  const fh = TOP - 0.065 - 0.13;
  const reed = new THREE.CylinderGeometry(0.031, 0.031, fh, 10, 1, true, -Math.PI / 2, Math.PI);
  const r = rand(4);
  for (let i = 0; i < n; i++) {
    const [x, z, nx, nz] = path.at((i + 0.5) * pitch);
    const tone = 0.92 + r() * 0.1;
    const g = reed.clone();
    paint(g, (_x, y, _z, out) => out.setScalar(tone * (0.85 + 0.15 * smoothstep(-fh / 2, fh / 2, y))));
    flutes.add(g, trs([x - nx * 0.035, 0.115 + fh / 2, z - nz * 0.035], [0, Math.atan2(nx, nz), 0]));
  }
  // a slim band under the top and a cove at the foot
  const band = new Merger();
  for (const [y, hh] of [
    [TOP - 0.075, 0.03],
    [0.115, 0.025],
  ] as [number, number][]) {
    band.add(up(new THREE.ExtrudeGeometry(outline(0.0), { depth: hh, bevelEnabled: false, curveSegments: 16 }), y - hh / 2));
  }
  // the brass foot rail along the front, on three brackets
  const brass = new Merger();
  const railPts: THREE.Vector3[] = [];
  const R = RECEPTION_R;
  const off = 0.2;
  railPts.push(V(X0 - off + 0.01, 0.24, ZB + 0.5));
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * (Math.PI / 2);
    railPts.push(V(X0 + R + Math.cos(a) * (R + off), 0.24, ZF - R - Math.sin(a) * (R + off)));
  }
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 - (i / 8) * (Math.PI / 2);
    railPts.push(V(X1 - R + Math.cos(a) * (R + off), 0.24, ZF - R + Math.sin(a) * (R + off)));
  }
  const curve = new THREE.CatmullRomCurve3(railPts, false, 'centripetal');
  brass.add(tubeThrough(curve.getSpacedPoints(60), () => 0.024, 80, 12).geometry);
  for (const x of [X0 + 0.3, (X0 + X1) / 2, X1 - 0.3]) brass.add(tubeThrough([V(x, 0.24, ZF + off), V(x, 0.2, ZF + 0.1), V(x, 0.18, ZF - 0.02)], () => 0.016, 8, 8).geometry);
  return { core, plinth, top, flutes: flutes.build(), band: band.build(), brass: brass.build() };
}

// ---------- things on the counter ----------

function bellGeometry() {
  return once('office:bell', () => {
    const base = smoothLathe(
      [
        [0, 0],
        [0.1, 0],
        [0.106, 0.008],
        [0.1, 0.028],
        [0, 0.03],
      ],
      16,
      40,
    );
    const dome = smoothLathe(
      [
        [0, 0.03],
        [0.09, 0.03],
        [0.092, 0.04],
        [0.08, 0.08],
        [0.05, 0.105],
        [0.012, 0.112],
        [0.01, 0.15],
        [0.022, 0.152],
        [0.024, 0.162],
        [0, 0.165],
      ],
      40,
      40,
    );
    return { base: paint(base, (_x, _y, _z, out) => out.set('#1c1a19')), dome };
  });
}

/** An open guest book: a burgundy cloth case, two page blocks curving up from the spine, a ribbon, and a fountain pen beside it. */
function guestBookGeometries() {
  return once('office:guest-book', () => {
    const W = 0.34; // one page's width
    const D = 0.44;
    const cover = new Merger();
    for (const s of [-1, 1]) cover.add(plank(W + 0.02, 0.012, D + 0.02, 0.004, 1, 1), trs([s * (W / 2 + 0.006), 0.006, 0], [0, 0, s * 0.03]));
    cover.add(new THREE.CylinderGeometry(0.02, 0.02, D + 0.02, 10, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), trs([0, 0.012, 0]));
    const coverG = paint(cover.build(), (x, y, z, out) => out.set('#5a1c20').multiplyScalar(0.9 + 0.12 * noise3(x * 30, y * 30, z * 30)));
    // the pages: a stack's edge and a curved top sheet on each side
    const pages = new Merger();
    for (const s of [-1, 1]) {
      const block = plank(W - 0.01, 0.03, D - 0.01, 0.004, 1, 1);
      paint(block, (_x, y, _z, out) => out.set('#e6dcc4').multiplyScalar(0.85 + 0.1 * Math.sin(y * 1200)));
      pages.add(block, trs([s * (W / 2 + 0.002), 0.026, 0], [0, 0, s * 0.03]));
    }
    const pagesG = pages.build();
    const sheet = (s: number) => {
      const g = new THREE.PlaneGeometry(W - 0.01, D - 0.01, 12, 2).rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = (p.getX(i) + (W - 0.01) / 2) / (W - 0.01); // 0 at the spine side for s = 1
        const t = s > 0 ? u : 1 - u;
        p.setY(i, 0.045 + Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5) * 0.018 - t * 0.008);
        p.setX(i, p.getX(i) + s * (W / 2 + 0.002));
      }
      g.computeVertexNormals();
      return g;
    };
    const sheets = new Merger().add(sheet(-1)).add(sheet(1)).build();
    // a ribbon marker trailing out of the bottom, and the pen
    const ribbon = tubeThrough([V(0.01, 0.05, D / 2 - 0.02), V(0.03, 0.03, D / 2 + 0.04), V(0.05, 0.004, D / 2 + 0.09)], () => 0.006, 8, 4).geometry;
    paint(ribbon, (_x, _y, _z, out) => out.set('#c8a040'));
    const pen = new Merger();
    pen.add(paint(new THREE.CylinderGeometry(0.011, 0.012, 0.2, 14).rotateZ(Math.PI / 2), (x, _y, _z, out) => out.set(x > 0.07 ? '#c8a050' : '#141414')));
    pen.add(paint(new THREE.ConeGeometry(0.011, 0.04, 14).rotateZ(-Math.PI / 2), (_x, _y, _z, out) => out.set('#d8b060')), trs([0.12, 0, 0]));
    pen.add(paint(plank(0.07, 0.004, 0.006, 0.001, 1, 1), (_x, _y, _z, out) => out.set('#d8b060')), trs([-0.05, 0.012, 0]));
    return { cover: coverG, pages: pagesG, sheets, ribbon, pen: pen.build() };
  });
}

/** A pilea: round coin leaves on long curving stalks from a central stem, in a glazed pot. */
function pileaGeometry() {
  return once('office:pilea', () => {
    const r = rand(12);
    const { pot, soil } = potGeometry(0.1, 0.13, '#e8dfcc', 3);
    const leaves = new Merger();
    const stalks = new Merger();
    const disc = new THREE.CircleGeometry(0.045, 18);
    {
      const p = disc.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        p.setZ(i, -(x * x + y * y) * 4);
      }
      disc.computeVertexNormals();
    }
    const stemTop = V(0.0, 0.34, 0);
    stalks.add(tubeThrough([V(0, 0.11, 0), V(0.01, 0.22, 0), stemTop], () => 0.008, 8, 6).geometry);
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996 + r() * 0.3;
      const along = 0.3 + (i / 16) * 0.7;
      const from = V(0, 0.11 + along * 0.23, 0);
      const len = 0.1 + r() * 0.08 + (1 - along) * 0.06;
      const droop = 0.04 + (1 - along) * 0.05;
      const tip = V(Math.cos(a) * len, from.y + 0.06 - droop, Math.sin(a) * len);
      stalks.add(tubeThrough([from, from.clone().lerp(tip, 0.5).add(V(0, 0.04, 0)), tip], () => 0.0035, 8, 4).geometry);
      const g = disc.clone();
      const col = C(r() < 0.5 ? '#4a7a32' : '#3f6e2c');
      paint(g, (x, y, _z, out) => {
        out.copy(col);
        mix(out, out, C('#7aa04a'), smoothstep(0.012, 0.0, Math.hypot(x, y)) * 0.5);
        out.multiplyScalar(0.9 + 0.15 * smoothstep(0.045, 0.02, Math.hypot(x, y)));
      });
      // the leaf faces up and outward, attached at its centre (peltate)
      const tiltOut = 0.5 + r() * 0.5;
      leaves.add(g, trs([tip.x, tip.y + 0.004, tip.z], [-Math.PI / 2 + tiltOut, -a + Math.PI / 2, 0], 1 + r() * 0.35, 'YXZ'));
    }
    return { pot, soil, leaves: leaves.build(), stalks: paint(stalks.build(), (_x, _y, _z, out) => out.set('#5a7a3a')) };
  });
}

/** A shallow brass tray of blank cards. */
function cardTrayGeometry() {
  return once('office:card-tray', () => {
    const tray = smoothLathe(
      [
        [0, 0],
        [0.1, 0],
        [0.12, 0.012],
        [0.125, 0.022],
        [0.118, 0.022],
        [0.105, 0.01],
        [0, 0.008],
      ],
      16,
      4,
    );
    tray.rotateY(Math.PI / 4).scale(1.2, 1, 0.8);
    const cards = new Merger();
    for (let i = 0; i < 6; i++) cards.add(plank(0.15, 0.003, 0.09, 0.001, 1, 1), trs([0.004 * i, 0.012 + i * 0.003, 0.002 * i], [0, 0.05 * i, 0]));
    return { tray, cards: paint(cards.build(), (_x, _y, _z, out) => out.set('#f2ece0')) };
  });
}

// ---------- the waiting lamps ----------

function waitLampGeometries() {
  return once('office:wait-lamp', () => {
    const n = 50;
    const profile: [number, number][] = [
      [0.0, 0.2],
      [0.06, 0.2],
      [0.075, 0.18],
      [0.11, 0.1],
      [0.22, 0.0],
      [0.32, -0.1],
      [0.36, -0.16],
      [0.37, -0.18],
      [0.355, -0.186],
      [0.31, -0.11],
      [0.2, -0.01],
      [0.1, 0.075],
      [0.06, 0.15],
      [0.0, 0.16],
    ];
    const shade = smoothLathe(profile, n, 48);
    const yellow = C('#d9a62c');
    paintLathe(shade, n, (x, y, z, along, out) => {
      if (along < 0.53) {
        out.copy(yellow).multiplyScalar(0.92 + 0.1 * noise3(x * 20, y * 20, z * 20));
        mix(out, out, C('#2a241c'), smoothstep(0.6, 0.78, noise3(x * 30, y * 30, z * 30)) * smoothstep(-0.13, -0.18, y));
      } else out.set('#f4eee0');
    });
    const cap = smoothLathe(
      [
        [0, 0.33],
        [0.03, 0.33],
        [0.045, 0.29],
        [0.05, 0.22],
        [0.08, 0.19],
        [0.085, 0.17],
        [0, 0.17],
      ],
      20,
      28,
    );
    const bulb = smoothLathe(
      [
        [0, -0.22],
        [0.05, -0.21],
        [0.08, -0.17],
        [0.085, -0.11],
        [0.06, -0.05],
        [0.035, -0.01],
        [0, 0.0],
      ],
      24,
      28,
    );
    return { shade, cap, bulb };
  });
}

function WaitLamp({ p, i, m }: { p: [number, number, number]; i: number; m: RMats }) {
  const g = waitLampGeometries();
  const cord = useMemo(() => once(`office:wait-cord:${i}`, () => {
    const c = new Merger();
    c.add(tubeThrough([V(0, 0.32, 0), V(0, (CEIL - p[1]) * 0.55, 0.004), V(0, CEIL - p[1], 0)], () => 0.012, 10, 6).geometry);
    c.add(smoothLathe([[0, 0], [0.09, 0], [0.095, -0.02], [0.08, -0.05], [0, -0.055]], 10, 24), trs([0, CEIL - p[1], 0]));
    return c.build();
  }), [p, i]);
  return (
    <group position={p}>
      <mesh geometry={g.shade} material={m.enamel} castShadow />
      <mesh geometry={g.cap} material={m.brass} castShadow />
      <mesh geometry={g.bulb} material={WAIT_BULBS[i]} />
      <mesh geometry={cord} material={m.cord} />
    </group>
  );
}

// ---------- assembled ----------

export function Reception() {
  const m = receptionMats();
  const p = propMats();
  const g = useMemo(() => once('office:reception', counterGeometries), []);
  const bell = bellGeometry();
  const book = guestBookGeometries();
  const pilea = pileaGeometry();
  const tray = cardTrayGeometry();
  return (
    <group>
      <mesh geometry={g.plinth} material={m.plinth} receiveShadow />
      <mesh geometry={g.core} material={m.paint} castShadow receiveShadow />
      <mesh geometry={g.flutes} material={m.paint} castShadow receiveShadow />
      <mesh geometry={g.band} material={m.paint} receiveShadow />
      <mesh geometry={g.top} material={m.terrazzo} castShadow receiveShadow userData={{ surface: 'top' }} />
      <mesh geometry={g.brass} material={m.brass} castShadow />
      {/* the bell between the two waiting places, the guest book at the left end turned to the visitor */}
      <group position={[9.75, TOP, 0.02]}>
        <mesh geometry={bell.base} material={p.vc} castShadow />
        <mesh geometry={bell.dome} material={m.chrome} castShadow />
      </group>
      <group position={[8.3, TOP, -0.02]} rotation={[0, 0.18, 0]}>
        <mesh geometry={book.cover} material={p.vc} castShadow receiveShadow />
        <mesh geometry={book.pages} material={p.paper} receiveShadow />
        <mesh geometry={book.sheets} material={m.page} receiveShadow />
        <mesh geometry={book.ribbon} material={p.vc} />
        <mesh geometry={book.pen} material={p.metal} position={[0.27, 0.012, 0.12]} rotation={[0, 0.5, 0]} castShadow />
      </group>
      <group position={[11.42, TOP, -0.35]}>
        <mesh geometry={pilea.pot} material={p.glaze} castShadow receiveShadow />
        <mesh geometry={pilea.soil} material={p.vc} />
        <mesh geometry={pilea.stalks} material={p.vc} castShadow />
        <mesh geometry={pilea.leaves} material={p.leaf} castShadow />
      </group>
      <group position={[10.85, TOP, 0.12]} rotation={[0, -0.3, 0]}>
        <mesh geometry={tray.tray} material={m.brass} castShadow />
        <mesh geometry={tray.cards} material={p.paper} />
      </group>
      {WAIT_LAMPS.map((lp, i) => (
        <WaitLamp key={i} p={lp} i={i} m={m} />
      ))}
    </group>
  );
}

