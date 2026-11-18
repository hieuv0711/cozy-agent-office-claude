import { noise3, worley3 } from '../../tank/util';
import { canvasTexture, rand } from './desk-kit';

// Painted canvases for the Night desk items: clock faces, notebook pages,
// the globe's map, framed prints, the radio's dial and grille cloth.

const SERIF = 'Georgia, "Times New Roman", serif';

// ---------- clock faces ----------

const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

/** A cream clock dial: Roman numerals round the rim for the wall clock, upright Arabic for the alarm clock. */
export function clockFaceTexture(style: 'wall' | 'alarm') {
  return canvasTexture('clock-face:' + style, 512, 512, (g, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const R = w / 2;
    const grad = g.createRadialGradient(cx, cy, 20, cx, cy, R);
    grad.addColorStop(0, '#f8f1df');
    grad.addColorStop(0.8, '#efe5cc');
    grad.addColorStop(1, '#d8c7a0');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // age: faint mottling
    const r = rand(style === 'wall' ? 3 : 4);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(150,120,70,${0.015 + r() * 0.02})`;
      g.beginPath();
      g.arc(r() * w, r() * h, 6 + r() * 30, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#2b241d';
    g.fillStyle = '#2b241d';
    const ring = (rad: number, lw: number) => {
      g.lineWidth = lw;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.stroke();
    };
    if (style === 'wall') {
      ring(R * 0.93, 3);
      ring(R * 0.84, 1.5);
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const big = i % 5 === 0;
        g.lineWidth = big ? 5 : 2;
        g.beginPath();
        g.moveTo(cx + Math.sin(a) * R * (big ? 0.82 : 0.845), cy - Math.cos(a) * R * (big ? 0.82 : 0.845));
        g.lineTo(cx + Math.sin(a) * R * 0.925, cy - Math.cos(a) * R * 0.925);
        g.stroke();
      }
      g.font = `600 58px ${SERIF}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.save();
        g.translate(cx + Math.sin(a) * R * 0.66, cy - Math.cos(a) * R * 0.66);
        g.rotate(a);
        g.fillText(ROMAN[i], 0, 0);
        g.restore();
      }
      // a small sunburst rose at the centre
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx + Math.sin(a) * 22, cy - Math.cos(a) * 22);
        g.lineTo(cx + Math.sin(a) * (i % 2 ? 44 : 60), cy - Math.cos(a) * (i % 2 ? 44 : 60));
        g.stroke();
      }
    } else {
      ring(R * 0.94, 2);
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const big = i % 5 === 0;
        g.lineWidth = big ? 6 : 2.5;
        g.beginPath();
        g.moveTo(cx + Math.sin(a) * R * (big ? 0.8 : 0.86), cy - Math.cos(a) * R * (big ? 0.8 : 0.86));
        g.lineTo(cx + Math.sin(a) * R * 0.92, cy - Math.cos(a) * R * 0.92);
        g.stroke();
      }
      g.font = `bold 66px ${SERIF}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let i = 1; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.fillText(String(i), cx + Math.sin(a) * R * 0.64, cy - Math.cos(a) * R * 0.64 + 3);
      }
      // the alarm's little red index ring
      g.strokeStyle = '#a8322a';
      ring(R * 0.3, 2);
    }
  });
}

// ---------- notebook pages ----------

/** Cursive-looking scribble words along a baseline. */
function scribble(g: CanvasRenderingContext2D, r: () => number, x0: number, x1: number, y: number, size: number) {
  let x = x0;
  while (x < x1 - 20) {
    const len = 18 + r() * 60;
    const end = Math.min(x1, x + len);
    g.beginPath();
    g.moveTo(x, y);
    let px = x;
    while (px < end) {
      const step = 3.5 + r() * 3;
      const tall = r();
      const hgt = tall > 0.88 ? size * 2.1 : tall < 0.08 ? -size * 1.4 : size * (0.75 + r() * 0.35);
      g.bezierCurveTo(px + step * 0.2, y - hgt, px + step * 0.9, y - hgt, px + step, y - (tall < 0.08 ? 0 : 1));
      px += step;
    }
    g.stroke();
    x = end + 6 + r() * 8;
  }
}

/** One page of the open notebook: ruled, with a margin, handwriting and (on the right) a little fish doodle. */
export function pageTexture(seed: number, side: 'left' | 'right') {
  return canvasTexture(`page:${seed}:${side}`, 384, 544, (g, w, h) => {
    const r = rand(seed * 7 + (side === 'left' ? 1 : 2));
    g.fillStyle = '#f4eddc';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(160,130,90,${r() * 0.03})`;
      g.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6);
    }
    // darker toward the gutter, where the page curls into shade
    const gut = side === 'left' ? g.createLinearGradient(w, 0, w - 60, 0) : g.createLinearGradient(0, 0, 60, 0);
    gut.addColorStop(0, 'rgba(120,95,60,0.28)');
    gut.addColorStop(1, 'rgba(120,95,60,0)');
    g.fillStyle = gut;
    g.fillRect(0, 0, w, h);
    const top = 58;
    const step = 22;
    g.strokeStyle = 'rgba(90,130,200,0.38)';
    g.lineWidth = 1.2;
    for (let y = top; y < h - 20; y += step) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(205,80,80,0.45)';
    const mx = side === 'left' ? 44 : 30;
    g.beginPath();
    g.moveTo(mx, 0);
    g.lineTo(mx, h);
    g.stroke();
    g.strokeStyle = 'rgba(28,36,78,0.85)';
    g.lineWidth = 1.5;
    g.lineCap = 'round';
    const lines = Math.floor((h - top - 30) / step);
    const used = side === 'left' ? lines : Math.floor(lines * 0.45);
    for (let i = 0; i < used; i++) {
      const y = top + i * step - 3;
      const indent = i === 0 || r() < 0.12 ? 24 : 0;
      const end = i === used - 1 ? w * (0.3 + r() * 0.4) : w - 14 - r() * 40;
      scribble(g, r, mx + 8 + indent, end, y, 4.2);
    }
    if (side === 'right') {
      // a doodled fish with bubbles, and an underline under a heading
      const fx = w * 0.52;
      const fy = top + lines * step * 0.72;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(fx, fy, 62, 34, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(fx + 58, fy);
      g.lineTo(fx + 104, fy - 30);
      g.lineTo(fx + 98, fy + 30);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(fx - 34, fy - 8, 6, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(fx - 33, fy - 9, 2, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(fx - 70 - k * 9, fy - 40 - k * 22, 4 + k * 2.5, 0, Math.PI * 2);
        g.stroke();
      }
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(fx - 8 + k * 14, fy + 6, 7, Math.PI * 0.15, Math.PI * 0.85);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(mx + 8, top + used * step + 6);
      g.lineTo(mx + 120, top + used * step + 4);
      g.stroke();
    }
  });
}

/** Stacked page edges: fine lines on cream, for the fore-edges of books and notebooks. */
export function pageEdgeTexture() {
  return canvasTexture(
    'page-edges',
    64,
    256,
    (g, w, h) => {
      const r = rand(31);
      g.fillStyle = '#ece3cc';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        g.fillStyle = `rgba(120,100,70,${0.08 + r() * 0.16})`;
        g.fillRect(0, y, w, 1);
      }
    },
    { repeat: true },
  );
}

// ---------- the globe ----------

/**
 * An old-fashioned globe map (equirectangular): sea-green oceans shading
 * darker off the coasts, pastel countries with ink borders, a graticule and a
 * compass rose. The continents are invented.
 */
export function globeTexture() {
  return canvasTexture('globe-map', 1024, 512, (g, w, h) => {
    const img = g.createImageData(w, h);
    const d = img.data;
    const tints = [
      [222, 196, 150],
      [214, 168, 150],
      [190, 196, 146],
      [228, 210, 160],
      [200, 170, 196],
      [236, 186, 128],
    ];
    const height = (x: number, y: number, z: number) => noise3(x * 1.4, y * 1.4, z * 1.4) * 0.65 + noise3(x * 3.1 + 5, y * 3.1, z * 3.1) * 0.3 + noise3(x * 7, y * 7, z * 7 + 9) * 0.12;
    for (let j = 0; j < h; j++) {
      const lat = (0.5 - j / h) * Math.PI;
      const cl = Math.cos(lat);
      const sl = Math.sin(lat);
      for (let i = 0; i < w; i++) {
        const lon = (i / w) * Math.PI * 2;
        const x = cl * Math.cos(lon);
        const y = sl;
        const z = cl * Math.sin(lon);
        const e = height(x, y, z) + 0.06 - Math.abs(sl) * 0.12;
        const o = (j * w + i) * 4;
        let c: number[];
        if (e > 0.08) {
          // countries: cells of a coarse worley pattern, each its own tint
          const f = worley3(x * 3.2 + 10, y * 3.2, z * 3.2);
          const id = Math.floor((noise3(Math.round(x * 3.2 * 2) * 0.7, Math.round(y * 3.2 * 2) * 0.7, Math.round(z * 3.2 * 2) * 0.7) + 1) * 3) % tints.length;
          c = tints[Math.max(0, id)].slice();
          const border = f > 0.62 && f < 0.66 ? 0.8 : 1;
          const coast = e < 0.11 ? 0.72 : 1;
          const k = border * coast;
          c = [c[0] * k, c[1] * k, c[2] * k];
        } else {
          const deep = Math.min(1, (0.08 - e) * 3.2);
          c = [168 - deep * 50, 196 - deep * 46, 182 - deep * 30];
          // ripple lines off the coast, like an engraved sea
          if (e > -0.02 && Math.sin(e * 260) > 0.92) c = [c[0] * 0.86, c[1] * 0.86, c[2] * 0.88];
        }
        d[o] = c[0];
        d[o + 1] = c[1];
        d[o + 2] = c[2];
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // graticule
    g.strokeStyle = 'rgba(70,60,40,0.35)';
    g.lineWidth = 1;
    for (let k = 1; k < 12; k++) {
      g.beginPath();
      g.moveTo(0, (k / 12) * h);
      g.lineTo(w, (k / 12) * h);
      g.stroke();
    }
    for (let k = 0; k < 24; k++) {
      g.beginPath();
      g.moveTo((k / 24) * w, 0);
      g.lineTo((k / 24) * w, h);
      g.stroke();
    }
    g.strokeStyle = 'rgba(150,50,40,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
    // a compass rose in an ocean
    const cx = w * 0.62;
    const cy = h * 0.62;
    g.fillStyle = 'rgba(90,60,40,0.7)';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const len = k % 2 ? 16 : 30;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.lineTo(cx + Math.cos(a + 0.35) * 6, cy + Math.sin(a + 0.35) * 6);
      g.lineTo(cx + Math.cos(a - 0.35) * 6, cy + Math.sin(a - 0.35) * 6);
      g.fill();
    }
    // varnish: the whole map yellowed a little
    g.fillStyle = 'rgba(200,160,80,0.12)';
    g.fillRect(0, 0, w, h);
  });
}

// ---------- prints for the picture frame ----------

export const PRINTS = ['sea', 'koi', 'fern', 'peaks', 'jelly'] as const;
export type Print = (typeof PRINTS)[number];

/** A painted print, 400 x 520 (portrait). */
export function printTexture(kind: Print) {
  return canvasTexture('print:' + kind, 400, 520, (g, w, h) => {
    const r = rand(kind.length * 13 + kind.charCodeAt(0));
    if (kind === 'sea') {
      // a lighthouse on a rock under a full moon, its beam across the sea
      const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
      sky.addColorStop(0, '#0d1838');
      sky.addColorStop(1, '#2b3f73');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(255,250,230,${0.3 + r() * 0.6})`;
        g.fillRect(r() * w, r() * h * 0.5, 1.5, 1.5);
      }
      const halo = g.createRadialGradient(w * 0.7, h * 0.2, 10, w * 0.7, h * 0.2, 120);
      halo.addColorStop(0, 'rgba(255,245,210,0.5)');
      halo.addColorStop(1, 'rgba(255,245,210,0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fbf3da';
      g.beginPath();
      g.arc(w * 0.7, h * 0.2, 30, 0, Math.PI * 2);
      g.fill();
      const sea = g.createLinearGradient(0, h * 0.62, 0, h);
      sea.addColorStop(0, '#1e3260');
      sea.addColorStop(1, '#0b1430');
      g.fillStyle = sea;
      g.fillRect(0, h * 0.62, w, h * 0.38);
      // moon path glints
      for (let i = 0; i < 70; i++) {
        const y = h * 0.63 + Math.pow(r(), 1.3) * h * 0.36;
        const spread = 10 + (y - h * 0.62) * 0.5;
        g.fillStyle = `rgba(255,240,200,${0.25 + r() * 0.5})`;
        g.fillRect(w * 0.7 + (r() - 0.5) * spread, y, 6 + r() * 16, 2);
      }
      // the rock and lighthouse
      g.fillStyle = '#0a0e1c';
      g.beginPath();
      g.moveTo(0, h * 0.7);
      g.quadraticCurveTo(w * 0.15, h * 0.58, w * 0.36, h * 0.66);
      g.lineTo(w * 0.42, h * 0.72);
      g.lineTo(0, h * 0.76);
      g.fill();
      g.fillStyle = '#e8e1d0';
      g.beginPath();
      g.moveTo(w * 0.16, h * 0.62);
      g.lineTo(w * 0.24, h * 0.62);
      g.lineTo(w * 0.225, h * 0.4);
      g.lineTo(w * 0.175, h * 0.4);
      g.fill();
      g.fillStyle = '#b8322c';
      g.fillRect(w * 0.18, h * 0.47, w * 0.04, h * 0.03);
      g.fillRect(w * 0.187, h * 0.55, w * 0.042, h * 0.03);
      g.fillStyle = '#ffd98a';
      g.fillRect(w * 0.18, h * 0.365, w * 0.04, h * 0.035);
      g.fillStyle = '#1a1a22';
      g.beginPath();
      g.moveTo(w * 0.17, h * 0.365);
      g.lineTo(w * 0.2, h * 0.335);
      g.lineTo(w * 0.23, h * 0.365);
      g.fill();
      const beam = g.createLinearGradient(w * 0.2, 0, w, 0);
      beam.addColorStop(0, 'rgba(255,225,150,0.45)');
      beam.addColorStop(1, 'rgba(255,225,150,0)');
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(w * 0.22, h * 0.38);
      g.lineTo(w, h * 0.3);
      g.lineTo(w, h * 0.42);
      g.fill();
    } else if (kind === 'koi') {
      // two koi circling on rice paper, with lily pads
      g.fillStyle = '#efe6d2';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(120,150,160,${0.03 + r() * 0.04})`;
        g.beginPath();
        g.ellipse(r() * w, r() * h, 30 + r() * 60, 8 + r() * 14, 0, 0, Math.PI * 2);
        g.fill();
      }
      const pad = (x: number, y: number, rad: number) => {
        g.fillStyle = 'rgba(70,110,70,0.75)';
        g.beginPath();
        g.moveTo(x, y);
        g.arc(x, y, rad, 0.3, Math.PI * 2 - 0.1);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(40,70,40,0.6)';
        g.lineWidth = 1;
        for (let k = 0; k < 7; k++) {
          const a = 0.3 + (k / 7) * (Math.PI * 2 - 0.4);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * rad * 0.9, y + Math.sin(a) * rad * 0.9);
          g.stroke();
        }
      };
      pad(w * 0.22, h * 0.2, 42);
      pad(w * 0.8, h * 0.82, 36);
      pad(w * 0.12, h * 0.86, 24);
      const koi = (x: number, y: number, a: number, spots: string) => {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.fillStyle = '#fbf7ee';
        g.beginPath();
        g.moveTo(-70, 0);
        g.bezierCurveTo(-60, -26, 30, -28, 62, 0);
        g.bezierCurveTo(30, 26, -60, 24, -70, 0);
        g.fill();
        // tail and fins
        g.beginPath();
        g.moveTo(-64, 0);
        g.quadraticCurveTo(-100, -26, -112, -18);
        g.quadraticCurveTo(-92, 0, -112, 20);
        g.quadraticCurveTo(-100, 26, -64, 0);
        g.fill();
        g.fillStyle = spots;
        for (const [sx, sy, rx, ry] of [[22, -6, 24, 12], [-18, 6, 18, 10], [-44, -4, 12, 8]] as [number, number, number, number][]) {
          g.beginPath();
          g.ellipse(sx, sy, rx, ry, 0.2, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#1b1b1b';
        g.beginPath();
        g.arc(46, -8, 2.6, 0, Math.PI * 2);
        g.fill();
        g.restore();
      };
      koi(w * 0.55, h * 0.4, 0.6, '#e2572b');
      koi(w * 0.4, h * 0.65, -2.4, '#d9482a');
      g.fillStyle = '#b8322c';
      g.fillRect(w - 46, h - 70, 20, 26);
    } else if (kind === 'fern') {
      // a botanical study of a fern frond, on aged paper with a caption rule
      const paper = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.8);
      paper.addColorStop(0, '#f1e7cf');
      paper.addColorStop(1, '#dccaa0');
      g.fillStyle = paper;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#3f5a2e';
      g.fillStyle = '#4f6f37';
      g.lineWidth = 3;
      const sx = w * 0.5;
      g.beginPath();
      g.moveTo(sx, h * 0.86);
      g.quadraticCurveTo(sx + 30, h * 0.5, sx - 10, h * 0.1);
      g.stroke();
      for (let i = 0; i < 18; i++) {
        const t = i / 18;
        const y = h * 0.84 - t * h * 0.72;
        const x = sx + Math.sin(t * 2.4) * 18 - t * 8;
        const len = 120 * Math.sin(Math.PI * (0.15 + t * 0.85)) * (1 - t * 0.5);
        for (const s of [-1, 1]) {
          g.save();
          g.translate(x, y);
          g.rotate(s * (1.2 - t * 0.4) - Math.PI / 2 + Math.PI / 2);
          for (let k = 0; k < 8; k++) {
            const px = s * (k / 8) * len;
            g.beginPath();
            g.ellipse(px, -4, len / 14, 5 - k * 0.4, s * 0.5, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
        }
      }
      g.fillStyle = '#5a4630';
      g.fillRect(w * 0.3, h * 0.92, w * 0.4, 1.5);
      g.font = `italic 18px ${SERIF}`;
      g.textAlign = 'center';
      g.fillText('Polypodium', w / 2, h * 0.9);
    } else if (kind === 'peaks') {
      // layered mountains at dusk, a low sun, flat print colours
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#2b2d5c');
      sky.addColorStop(0.5, '#a65a6a');
      sky.addColorStop(0.75, '#f0a868');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffe2a8';
      g.beginPath();
      g.arc(w * 0.6, h * 0.55, 44, 0, Math.PI * 2);
      g.fill();
      const layers = ['#6e4a6e', '#553a5e', '#3e2c4e', '#2a1f3a', '#1a1428'];
      layers.forEach((c, k) => {
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(0, h);
        const base = h * (0.5 + k * 0.1);
        for (let x = 0; x <= w; x += 8) g.lineTo(x, base - Math.abs(Math.sin(x / (60 + k * 13) + k * 2)) * (70 - k * 9) - r() * 4);
        g.lineTo(w, h);
        g.fill();
      });
      // a few birds
      g.strokeStyle = '#2a1f3a';
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const bx = w * 0.25 + i * 26 + r() * 10;
        const by = h * 0.25 + r() * 30;
        g.beginPath();
        g.moveTo(bx - 8, by - 3);
        g.quadraticCurveTo(bx - 3, by - 7, bx, by);
        g.quadraticCurveTo(bx + 3, by - 7, bx + 8, by - 3);
        g.stroke();
      }
    } else {
      // a jellyfish plate in the style of an old natural-history print
      g.fillStyle = '#e9dfc6';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#6a3a4a';
      g.fillStyle = 'rgba(190,110,140,0.55)';
      g.lineWidth = 2;
      const cx = w / 2;
      const cy = h * 0.32;
      g.beginPath();
      g.moveTo(cx - 110, cy + 30);
      g.bezierCurveTo(cx - 110, cy - 120, cx + 110, cy - 120, cx + 110, cy + 30);
      for (let k = 0; k <= 16; k++) {
        const x = cx + 110 - (k / 16) * 220;
        g.quadraticCurveTo(x + 7, cy + 44, x, cy + 30);
      }
      g.fill();
      g.stroke();
      for (let k = 0; k < 9; k++) {
        const a = -1 + (k / 8) * 2;
        g.beginPath();
        g.moveTo(cx + a * 90, cy - 10);
        g.quadraticCurveTo(cx + a * 30, cy - 70, cx, cy - 80);
        g.stroke();
      }
      g.strokeStyle = 'rgba(120,60,80,0.8)';
      for (let k = 0; k < 14; k++) {
        const x = cx - 95 + k * 14.5;
        g.lineWidth = k % 3 === 0 ? 3 : 1.2;
        g.beginPath();
        g.moveTo(x, cy + 34);
        for (let y = 0; y < 260; y += 10) g.lineTo(x + Math.sin(y / 30 + k) * (8 + y * 0.06), cy + 34 + y);
        g.stroke();
      }
      g.fillStyle = '#5a3a40';
      g.font = `italic 17px ${SERIF}`;
      g.textAlign = 'center';
      g.fillText('Discomedusae', cx, h * 0.94);
      g.fillRect(w * 0.32, h * 0.955, w * 0.36, 1.2);
    }
    // a soft paper vignette over every print
    const v = g.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(60,40,20,0.22)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  });
}

// ---------- the radio ----------

/** The radio's glowing tuning dial: an amber scale with stations and a red needle. */
export function dialTexture() {
  return canvasTexture('radio-dial', 512, 160, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#f6cf8a');
    bg.addColorStop(1, '#d99a4a');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w / 2, h, 10, w / 2, h, w * 0.6);
    glow.addColorStop(0, 'rgba(255,250,220,0.6)');
    glow.addColorStop(1, 'rgba(255,250,220,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#4a2a12';
    g.fillStyle = '#4a2a12';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(30, h * 0.62);
    g.lineTo(w - 30, h * 0.62);
    g.stroke();
    for (let i = 0; i <= 40; i++) {
      const x = 30 + (i / 40) * (w - 60);
      g.lineWidth = i % 5 ? 1.5 : 3;
      g.beginPath();
      g.moveTo(x, h * 0.62);
      g.lineTo(x, h * (i % 5 ? 0.54 : 0.47));
      g.stroke();
    }
    g.font = `bold 22px ${SERIF}`;
    g.textAlign = 'center';
    const nums = ['55', '60', '70', '80', '100', '120', '140', '160'];
    nums.forEach((n, i) => g.fillText(n, 30 + (i / (nums.length - 1)) * (w - 60), h * 0.36));
    g.font = `italic 16px ${SERIF}`;
    g.fillText('kc', w - 22, h * 0.86);
    g.strokeStyle = '#b3241c';
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(w * 0.58, h * 0.1);
    g.lineTo(w * 0.58, h * 0.92);
    g.stroke();
  });
}

/** Woven grille cloth: gold-brown threads with a faint diamond figure. */
export function grilleTexture() {
  return canvasTexture(
    'radio-grille',
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#7a5a32';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4)
        for (let x = 0; x < w; x += 4) {
          const over = ((x + y) / 4) % 2 === 0;
          const diamond = (Math.abs(((x + y) % 64) - 32) + Math.abs(((x - y + 256) % 64) - 32)) < 20;
          g.fillStyle = over ? (diamond ? 'rgba(240,205,140,0.5)' : 'rgba(210,170,110,0.35)') : 'rgba(40,25,10,0.35)';
          g.fillRect(x, y, 4, 4);
        }
    },
    { repeat: true },
  );
}
