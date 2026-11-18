import { canvasTexture, css, rand, rgb } from './desk-kit';

// Canvas textures for the Night desk room: the wallpaper, the moonlit view
// through the window and the rug.

/** The wallpaper's ground and motif colours. */
export const PAPER = { ground: '#18222c', motif: '#2b3a43', gold: '#7a6540' };

function leaf(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, wid: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.25, -wid, len * 0.7, -wid * 0.9, len, 0);
  g.bezierCurveTo(len * 0.7, wid * 0.9, len * 0.25, wid, 0, 0);
  g.fill();
  g.restore();
}

/** One botanical sprig: an S-curved stem with alternate leaves and a few berries. */
function sprig(g: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, col: string, berry: string) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineCap = 'round';
  g.lineWidth = 3.2;
  const stem = (t: number) => {
    // a cubic through (0, 70) .. (2, -70)
    const u = 1 - t;
    const x0 = 0;
    const x1 = 18;
    const x2 = -16;
    const x3 = 4;
    const y0 = 70;
    const y1 = 25;
    const y2 = -25;
    const y3 = -70;
    return [u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3];
  };
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const [sx, sy] = stem(i / 24);
    if (i === 0) g.moveTo(sx, sy);
    else g.lineTo(sx, sy);
  }
  g.stroke();
  for (let i = 0; i < 7; i++) {
    const t = 0.1 + i * 0.12;
    const [sx, sy] = stem(t);
    const side = i % 2 ? 1 : -1;
    const len = 34 - i * 2.6;
    leaf(g, sx, sy, -Math.PI / 2 + side * (1.05 - t * 0.5), len, len * 0.36);
  }
  // berries on short stalks near the top
  g.fillStyle = berry;
  const [bx, by] = stem(0.97);
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i - 1) * 0.7;
    g.beginPath();
    g.arc(bx + Math.cos(a) * 9, by + Math.sin(a) * 9, 4.2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/**
 * Deep blue-slate wallpaper with a quiet half-drop pattern of botanical sprigs
 * and tiny gold dots. One tile is drawn for about 3 x 3 units of wall.
 */
export function wallpaperTexture() {
  return canvasTexture(
    'desk-wallpaper',
    512,
    512,
    (g, w, h) => {
      const r = rand(21);
      g.fillStyle = PAPER.ground;
      g.fillRect(0, 0, w, h);
      // paper mottling
      for (let i = 0; i < 900; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 6 + r() * 26;
        g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.03)';
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
      // faint vertical ground stripes, like a printed ground
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = 'rgba(255,255,255,0.012)';
        g.fillRect(x, 0, 7, h);
      }
      const motif = PAPER.motif;
      const berry = PAPER.gold;
      // half-drop repeat, drawn with wrap-around copies so the tile is seamless
      const spots: [number, number, number, number][] = [
        [128, 128, 1.0, -0.15],
        [384, 384, 1.0, 0.2],
        [384, 112, 0.55, 2.4],
        [128, 368, 0.55, -2.6],
      ];
      for (const [x, y, s, rot] of spots)
        for (const ox of [-w, 0, w])
          for (const oy of [-h, 0, h]) sprig(g, x + ox, y + oy, s * 1.25, rot, motif, berry);
      // scattered gold pin dots
      g.fillStyle = css(rgb(PAPER.gold), 0.75);
      const dots: [number, number][] = [
        [256, 40], [0, 296], [256, 296], [40, 0], [470, 220], [210, 470], [300, 200], [60, 210],
      ];
      for (const [x, y] of dots)
        for (const ox of [-w, 0, w])
          for (const oy of [-h, 0, h]) {
            g.beginPath();
            g.arc(x + ox, y + oy, 3, 0, Math.PI * 2);
            g.fill();
          }
    },
    { repeat: true },
  );
}

type Twig = { x: number; y: number; cx: number; cy: number; x1: number; y1: number; wid: number };
type Leaf = { x: number; y: number; rx: number; ry: number; a: number };

function branch(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, a: number, len: number, wid: number, depth: number, rec?: { twigs: Twig[]; leaves: Leaf[] }) {
  const x1 = x + Math.cos(a) * len;
  const y1 = y + Math.sin(a) * len;
  g.lineWidth = wid;
  g.beginPath();
  g.moveTo(x, y);
  const cx = (x + x1) / 2 + (r() - 0.5) * len * 0.3;
  const cy = (y + y1) / 2 + (r() - 0.5) * len * 0.3;
  g.quadraticCurveTo(cx, cy, x1, y1);
  g.stroke();
  rec?.twigs.push({ x, y, cx, cy, x1, y1, wid });
  if (depth <= 0) {
    // a few leaves at the twig ends
    for (let i = 0; i < 3; i++) {
      const leaf = { x: x1 + (r() - 0.5) * 16, y: y1 + (r() - 0.5) * 16, rx: 7 + r() * 5, ry: 3 + r() * 2, a: r() * Math.PI };
      g.beginPath();
      g.ellipse(leaf.x, leaf.y, leaf.rx, leaf.ry, leaf.a, 0, Math.PI * 2);
      g.fill();
      rec?.leaves.push(leaf);
    }
    return;
  }
  const n = 2 + (r() < 0.4 ? 1 : 0);
  for (let i = 0; i < n; i++) branch(g, r, x1, y1, a + (r() - 0.5) * 1.3, len * (0.62 + r() * 0.2), wid * 0.66, depth - 1, rec);
}

/** The view out of the window in each weather: clear (the moon and stars), wet (rain and storm) and snowy. */
export type NightView = 'clear' | 'wet' | 'snow';

/** Low cloud over the whole sky for rain and snow (its own random stream, so the rest of the view keeps its layout). */
function overcast(g: CanvasRenderingContext2D, w: number, h: number, view: NightView) {
  const r = rand(77);
  const [dark, light] = view === 'snow' ? [[96, 92, 118], [150, 143, 168]] : [[30, 36, 52], [62, 70, 92]];
  for (let i = 0; i < 34; i++) {
    const x = r() * w;
    const y = h * (0.02 + Math.pow(r(), 1.3) * 0.7);
    const rx = 110 + r() * 200;
    const ry = 34 + r() * 60;
    const k = r();
    const c = dark.map((d, j) => Math.round(d + (light[j] - d) * k));
    const b = g.createRadialGradient(x, y - ry * 0.3, 0, x, y, rx);
    b.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.13 + k * 0.1})`);
    b.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    g.translate(-x, -y);
    g.fillStyle = b;
    g.fillRect(x - rx, y - rx, rx * 2, rx * 2);
    g.restore();
  }
}

/**
 * The view out of the window at night: a deep sky with stars, a haloed moon,
 * thin moonlit clouds, a line of rooftops with a few lit windows, and a tree's
 * branches reaching in from the side. Drawn for a 6 x 9 unit plane.
 *
 * `wet` hides the stars and moon behind low cloud, with mist over the roofs and
 * wet slates catching a little light; `snow` lays snow on the hills, the roofs
 * and the branches under a pale overcast sky lit by the town. All three use the
 * same random layout, so they crossfade over the same rooftops.
 */
export function nightTexture(view: NightView = 'clear') {
  return canvasTexture(view === 'clear' ? 'desk-night' : `desk-night-${view}`, 600, 900, (g, w, h) => {
    const r = rand(5);
    const clear = view === 'clear';
    const snow = view === 'snow';
    const sky = g.createLinearGradient(0, 0, 0, h);
    if (clear) {
      sky.addColorStop(0, '#060a1a');
      sky.addColorStop(0.45, '#0d1735');
      sky.addColorStop(0.78, '#1d2a55');
      sky.addColorStop(1, '#3a3558');
    } else if (snow) {
      sky.addColorStop(0, '#191b2e');
      sky.addColorStop(0.45, '#26283f');
      sky.addColorStop(0.78, '#3b3852');
      sky.addColorStop(1, '#5a526c');
    } else {
      sky.addColorStop(0, '#07090f');
      sky.addColorStop(0.45, '#0d121e');
      sky.addColorStop(0.78, '#182031');
      sky.addColorStop(1, '#272a3b');
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    if (!clear) overcast(g, w, h, view);
    // stars, denser and brighter higher up (the same random numbers in every view)
    for (let i = 0; i < 420; i++) {
      const x = r() * w;
      const y = Math.pow(r(), 1.5) * h * 0.8;
      const b = r();
      if (!clear) continue;
      const rad = b > 0.97 ? 1.8 : b > 0.85 ? 1.2 : 0.7;
      g.fillStyle = `rgba(${b > 0.6 ? '255,248,230' : '200,215,255'},${0.35 + b * 0.6})`;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
      if (b > 0.985) {
        const glow = g.createRadialGradient(x, y, 0, x, y, 9);
        glow.addColorStop(0, 'rgba(220,230,255,0.5)');
        glow.addColorStop(1, 'rgba(220,230,255,0)');
        g.fillStyle = glow;
        g.fillRect(x - 9, y - 9, 18, 18);
      }
    }
    // the moon and its halo (behind the cloud, only a glow shows)
    const mx = w * 0.38;
    const my = h * 0.2;
    if (clear) {
      const halo = g.createRadialGradient(mx, my, 10, mx, my, 210);
      halo.addColorStop(0, 'rgba(190,210,255,0.42)');
      halo.addColorStop(0.3, 'rgba(150,175,240,0.14)');
      halo.addColorStop(1, 'rgba(120,150,230,0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);
      const disc = g.createRadialGradient(mx - 8, my - 8, 4, mx, my, 38);
      disc.addColorStop(0, '#fffdf4');
      disc.addColorStop(0.8, '#efe8d4');
      disc.addColorStop(1, '#d8d0bd');
      g.fillStyle = disc;
      g.beginPath();
      g.arc(mx, my, 36, 0, Math.PI * 2);
      g.fill();
      // maria: soft grey patches on the disc
      g.save();
      g.beginPath();
      g.arc(mx, my, 36, 0, Math.PI * 2);
      g.clip();
      for (const [dx, dy, rad] of [[-10, -6, 12], [8, 4, 9], [-2, 14, 8], [14, -12, 6], [-16, 10, 5]] as [number, number, number][]) {
        g.fillStyle = 'rgba(150,145,140,0.22)';
        g.beginPath();
        g.arc(mx + dx, my + dy, rad, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    } else {
      const glow = g.createRadialGradient(mx, my, 0, mx, my, snow ? 300 : 240);
      glow.addColorStop(0, snow ? 'rgba(200,196,215,0.2)' : 'rgba(120,138,175,0.16)');
      glow.addColorStop(0.4, snow ? 'rgba(170,165,190,0.08)' : 'rgba(90,105,140,0.06)');
      glow.addColorStop(1, 'rgba(90,105,140,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);
    }
    // thin clouds lit from above by the moon (ragged scud in the rain, pale wisps in the snow)
    for (let i = 0; i < 7; i++) {
      const cy = h * (0.12 + r() * 0.42);
      const cx = r() * w;
      const len = 120 + r() * 200;
      for (let k = 0; k < 14; k++) {
        const x = cx + (k / 14 - 0.5) * len + (r() - 0.5) * 20;
        const y = cy + (r() - 0.5) * 10;
        const rx = 30 + r() * 40;
        const ry = 5 + r() * 7;
        const near = Math.max(0, 1 - Math.hypot(x - mx, y - my) / 320);
        if (clear) g.fillStyle = `rgba(${150 + near * 80},${165 + near * 70},${210 + near * 40},${0.04 + near * 0.08})`;
        else if (snow) g.fillStyle = `rgba(${170 + near * 30},${165 + near * 30},${190 + near * 25},${0.05 + near * 0.05})`;
        else g.fillStyle = `rgba(${52 + near * 30},${60 + near * 30},${82 + near * 30},${0.12 + near * 0.06})`;
        g.beginPath();
        g.ellipse(x, y, clear ? rx : rx * 1.5, clear ? ry : ry * 1.8, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // far hills (snow-covered in the snow, half lost in the mist in the rain)
    const base = h * 0.8;
    const hill = (x: number) => base - 30 - Math.sin(x / 90) * 18 - Math.sin(x / 37 + 1) * 6;
    if (snow) {
      const hg = g.createLinearGradient(0, base - 60, 0, h);
      hg.addColorStop(0, '#6d7290');
      hg.addColorStop(0.35, '#4a4e68');
      hg.addColorStop(1, '#2c2f44');
      g.fillStyle = hg;
    } else g.fillStyle = clear ? '#121a33' : '#161c2a';
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) g.lineTo(x, hill(x));
    g.lineTo(w, h);
    g.fill();
    if (snow) {
      // hedgerows and copses across the snowy fields
      const rr = rand(31);
      g.fillStyle = 'rgba(28,30,46,0.7)';
      for (let i = 0; i < 46; i++) {
        const x = rr() * w;
        const y = hill(x) + 6 + rr() * 30;
        g.beginPath();
        g.ellipse(x, y, 6 + rr() * 14, 2 + rr() * 4, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (!clear) {
      // mist lying over the hills
      const mist = g.createLinearGradient(0, base - 70, 0, h);
      mist.addColorStop(0, snow ? 'rgba(150,146,172,0)' : 'rgba(70,80,104,0)');
      mist.addColorStop(0.4, snow ? 'rgba(150,146,172,0.22)' : 'rgba(70,80,104,0.3)');
      mist.addColorStop(1, snow ? 'rgba(150,146,172,0.1)' : 'rgba(70,80,104,0.12)');
      g.fillStyle = mist;
      g.fillRect(0, base - 70, w, h - base + 70);
    }
    // rooftops with chimneys, and a few lit windows
    g.fillStyle = clear ? '#080b18' : snow ? '#0d0f1c' : '#06080f';
    let x = -20;
    const lit: [number, number][] = [];
    const roofs: { x: number; bw: number; top: number; ridge: number; pitched: boolean; chx: number }[] = [];
    while (x < w + 20) {
      const bw = 60 + r() * 70;
      const bh = 40 + r() * 70;
      const top = base + 20 - bh;
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x, top);
      const pitched = r() < 0.6;
      const ridge = pitched ? top - 22 - r() * 16 : top;
      if (pitched) {
        g.lineTo(x + bw / 2, ridge);
        g.lineTo(x + bw, top);
      } else g.lineTo(x + bw, top);
      g.lineTo(x + bw, h);
      g.fill();
      const hasChimney = r() < 0.7;
      const chx = hasChimney ? x + bw * (0.2 + r() * 0.5) : NaN;
      if (hasChimney) g.fillRect(chx, top - 30, 8, 26);
      roofs.push({ x, bw, top, ridge, pitched, chx });
      for (let k = 0; k < 3; k++) if (r() < 0.35) lit.push([x + 10 + r() * (bw - 26), top + 14 + r() * (bh - 30)]);
      x += bw + 4 + r() * 10;
    }
    if (snow) {
      // snow on the roofs and the chimney tops
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const f of roofs) {
        g.strokeStyle = '#8e96b2';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(f.x + 1, f.top + 2);
        if (f.pitched) g.lineTo(f.x + f.bw / 2, f.ridge + 2);
        g.lineTo(f.x + f.bw - 1, f.top + 2);
        g.stroke();
        g.strokeStyle = '#b4bbd0';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(f.x + 1, f.top);
        if (f.pitched) g.lineTo(f.x + f.bw / 2, f.ridge);
        g.lineTo(f.x + f.bw - 1, f.top);
        g.stroke();
        if (Number.isFinite(f.chx)) {
          g.fillStyle = '#a6aec6';
          g.beginPath();
          g.ellipse(f.chx + 4, f.top - 30, 6, 3, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (!clear) {
      // wet slates catching a little of the sky
      g.strokeStyle = 'rgba(110,126,160,0.32)';
      g.lineWidth = 1.5;
      for (const f of roofs) {
        g.beginPath();
        g.moveTo(f.x + 2, f.top + 1);
        if (f.pitched) g.lineTo(f.x + f.bw / 2, f.ridge + 1);
        g.lineTo(f.x + f.bw - 2, f.top + 1);
        g.stroke();
      }
    }
    for (const [lx, ly] of lit) {
      const gr = clear ? 18 : 30;
      const glow = g.createRadialGradient(lx + 5, ly + 6, 0, lx + 5, ly + 6, gr);
      glow.addColorStop(0, `rgba(255,190,110,${clear ? 0.35 : 0.3})`);
      glow.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = glow;
      g.fillRect(lx + 5 - gr, ly + 6 - gr, gr * 2, gr * 2);
      g.fillStyle = '#ffc57a';
      g.fillRect(lx, ly, 9, 11);
      g.fillStyle = 'rgba(80,40,10,0.5)';
      g.fillRect(lx + 4, ly, 1, 11);
    }
    if (!clear) {
      // a little haze in front of the roofs
      const haze = g.createLinearGradient(0, base - 120, 0, h);
      haze.addColorStop(0, snow ? 'rgba(160,156,182,0)' : 'rgba(60,70,92,0)');
      haze.addColorStop(1, snow ? 'rgba(160,156,182,0.12)' : 'rgba(60,70,92,0.16)');
      g.fillStyle = haze;
      g.fillRect(0, base - 120, w, h - base + 120);
    }
    // a tree reaching in from the right (snow along its boughs, or the rain's sheen)
    g.strokeStyle = '#04060d';
    g.fillStyle = '#04060d';
    g.lineCap = 'round';
    const rec = { twigs: [] as Twig[], leaves: [] as Leaf[] };
    branch(g, r, w + 20, h * 0.42, Math.PI + 0.35, 190, 16, 5, rec);
    branch(g, r, w + 10, h * 0.16, Math.PI - 0.15, 150, 11, 4, rec);
    if (!clear) {
      g.strokeStyle = snow ? '#9aa2bc' : 'rgba(100,116,150,0.35)';
      g.fillStyle = snow ? '#a3abc4' : 'rgba(100,116,150,0.3)';
      for (const t of rec.twigs) {
        if (t.wid < 1.4) continue;
        const up = t.wid * 0.32;
        g.lineWidth = Math.max(1, t.wid * (snow ? 0.42 : 0.22));
        g.beginPath();
        g.moveTo(t.x, t.y - up);
        g.quadraticCurveTo(t.cx, t.cy - up, t.x1, t.y1 - up);
        g.stroke();
      }
      if (snow)
        for (const l of rec.leaves) {
          g.beginPath();
          g.ellipse(l.x, l.y - l.ry * 0.6, l.rx * 0.8, l.ry * 0.55, l.a, Math.PI, Math.PI * 2);
          g.fill();
        }
    }
  });
}

function rosette(g: CanvasRenderingContext2D, x: number, y: number, rad: number, petals: number, col: string, eye: string) {
  g.fillStyle = col;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * rad * 0.55, y + Math.sin(a) * rad * 0.55, rad * 0.48, rad * 0.22, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = eye;
  g.beginPath();
  g.arc(x, y, rad * 0.28, 0, Math.PI * 2);
  g.fill();
}

/** A worn wool rug: madder-red field, navy medallion and corners, rosette border. */
export function rugTexture() {
  return canvasTexture('desk-rug', 1024, 768, (g, w, h) => {
    const r = rand(9);
    const red = '#7a2524';
    const navy = '#1d2742';
    const cream = '#d9c9a4';
    const ochre = '#b98a3e';
    const b0 = 22;
    const b1 = 92;
    g.fillStyle = navy;
    g.fillRect(0, 0, w, h);
    // the field, everything in it clipped to it
    g.save();
    g.beginPath();
    g.rect(b1, b1, w - b1 * 2, h - b1 * 2);
    g.clip();
    g.fillStyle = red;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,10,12,0.35)';
    g.lineWidth = 2;
    for (let k = -h; k < w + h; k += 44) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + h, h);
      g.stroke();
      g.beginPath();
      g.moveTo(k + h, 0);
      g.lineTo(k, h);
      g.stroke();
    }
    for (const [qx, qy] of [[b1, b1], [w - b1, b1], [b1, h - b1], [w - b1, h - b1]] as [number, number][]) {
      g.fillStyle = cream;
      g.beginPath();
      g.arc(qx, qy, 126, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = navy;
      g.beginPath();
      g.arc(qx, qy, 120, 0, Math.PI * 2);
      g.fill();
      rosette(g, qx + (qx < w / 2 ? 52 : -52), qy + (qy < h / 2 ? 52 : -52), 22, 8, red, ochre);
    }
    const cx = w / 2;
    const cy = h / 2;
    const med = (s: number, col: string) => {
      g.fillStyle = col;
      g.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const lobes = 1 + 0.07 * Math.cos(a * 8);
        const px = cx + Math.sign(Math.cos(a)) * 230 * s * lobes * Math.abs(Math.cos(a)) ** 0.7;
        const py = cy + Math.sign(Math.sin(a)) * 160 * s * lobes * Math.abs(Math.sin(a)) ** 0.7;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.fill();
    };
    med(1.04, cream);
    med(1, navy);
    med(0.62, ochre);
    med(0.56, red);
    rosette(g, cx, cy, 46, 10, navy, cream);
    for (const [dx, dy] of [[-150, 0], [150, 0], [0, -100], [0, 100]] as [number, number][]) rosette(g, cx + dx, cy + dy, 20, 8, cream, red);
    g.restore();
    // the border band of rosettes and its guard stripes
    for (let x = b0 + 35; x < w - b0 - 20; x += 70) {
      rosette(g, x, (b0 + b1) / 2 - 4, 22, 8, red, ochre);
      rosette(g, x, h - (b0 + b1) / 2 + 4, 22, 8, red, ochre);
    }
    for (let y = b1 + 30; y < h - b1 - 10; y += 70) {
      rosette(g, (b0 + b1) / 2 - 4, y, 22, 8, red, ochre);
      rosette(g, w - (b0 + b1) / 2 + 4, y, 22, 8, red, ochre);
    }
    g.strokeStyle = cream;
    g.lineWidth = 6;
    g.strokeRect(b0 - 6, b0 - 6, w - (b0 - 6) * 2, h - (b0 - 6) * 2);
    g.strokeStyle = ochre;
    g.lineWidth = 8;
    g.strokeRect(b1 - 6, b1 - 6, w - (b1 - 6) * 2, h - (b1 - 6) * 2);
    // pile and wear: speckle, and a worn patch where the chair goes
    for (let i = 0; i < 26000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,240,220,0.05)' : 'rgba(0,0,0,0.07)';
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    const wear = g.createRadialGradient(w * 0.5, h * 0.25, 10, w * 0.5, h * 0.25, 260);
    wear.addColorStop(0, 'rgba(225,200,170,0.16)');
    wear.addColorStop(1, 'rgba(225,200,170,0)');
    g.fillStyle = wear;
    g.fillRect(0, 0, w, h);
  });
}
