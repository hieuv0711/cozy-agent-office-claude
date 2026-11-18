import * as THREE from 'three';
import { blade, tubeThrough } from '../../tank/geo';
import { C, Merger, mix, noise3, omat, once, paint, paintLathe, rand, smoothLathe, smoothstep, tex, trs, V, variant } from './office-kit';
import { propMats } from './office-props';

// The office's potted plants for the catalog: a monstera with big split and
// holed leaves on a moss pole, a snake plant of banded sword leaves, and a
// golden pothos whose vines spill over the rim and trail across the surface
// it stands on. Leaves are cut out of painted textures (alpha-tested, so the
// splits and holes are crisp and cast proper shadows) on bent grids; pots are
// turned profiles, glazed or bare clay. They stand on y = 0, facing +z.

function leafMats() {
  return {
    monstera: omat('pl:monstera', () => new THREE.MeshStandardMaterial({ map: monsteraTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.42, vertexColors: true })),
    snake: omat('pl:snake', () => new THREE.MeshStandardMaterial({ map: snakeTex(), side: THREE.DoubleSide, roughness: 0.5, vertexColors: true })),
    moss: omat('pl:moss', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })),
  };
}

// ---------- monstera ----------

/**
 * A monstera leaf: a broad heart, the petiole meeting it in the notch at
 * (0.5, 0.14) in texture space, narrow curved splits running in from the
 * margin along the veins, a row of oval holes beside the midrib, pale veins.
 */
function monsteraTex() {
  return tex(
    'o-monstera-leaf',
    512,
    512,
    (g, w, h) => {
      const r = rand(5);
      g.clearRect(0, 0, w, h);
      const cx = w / 2;
      const notchY = h * 0.86;
      const leaf = () => {
        g.beginPath();
        g.moveTo(cx, notchY);
        g.bezierCurveTo(cx - w * 0.16, h * 0.99, cx - w * 0.49, h * 0.94, cx - w * 0.485, h * 0.6);
        g.bezierCurveTo(cx - w * 0.475, h * 0.28, cx - w * 0.26, h * 0.05, cx, h * 0.015);
        g.bezierCurveTo(cx + w * 0.26, h * 0.05, cx + w * 0.475, h * 0.28, cx + w * 0.485, h * 0.6);
        g.bezierCurveTo(cx + w * 0.49, h * 0.94, cx + w * 0.16, h * 0.99, cx, notchY);
        g.closePath();
      };
      const grad = g.createRadialGradient(cx, h * 0.5, 20, cx, h * 0.5, w * 0.55);
      grad.addColorStop(0, '#2e6a32');
      grad.addColorStop(1, '#1c4a22');
      g.fillStyle = grad;
      leaf();
      g.fill();
      // where a lateral vein leaves the midrib (t along it from the notch to the tip) and where it meets the margin
      const veins = 6;
      const veinAt = (k: number, side: number) => {
        const t = 0.1 + (k / veins) * 0.78;
        const y0 = notchY - t * (notchY - h * 0.03);
        const y1 = y0 - h * (0.1 + 0.06 * (1 - t));
        const x1 = cx + side * w * 0.47 * Math.sin(Math.PI * Math.min(0.98, 0.25 + t * 0.75)) ** 0.5;
        return { y0, x1, y1 };
      };
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(160,200,120,0.55)';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(cx, notchY);
      g.quadraticCurveTo(cx + 4, h * 0.45, cx, h * 0.03);
      g.stroke();
      for (const side of [-1, 1])
        for (let k = 0; k <= veins; k++) {
          const v = veinAt(k, side);
          g.strokeStyle = 'rgba(150,190,110,0.4)';
          g.lineWidth = 2.6;
          g.beginPath();
          g.moveTo(cx, v.y0);
          g.quadraticCurveTo(cx + (v.x1 - cx) * 0.45, v.y0 - h * 0.035, v.x1, v.y1);
          g.stroke();
        }
      // a waxy sheen, mottled
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '80,130,70' : '8,28,10'},${0.04 + r() * 0.05})`;
        g.beginPath();
        g.arc(r() * w, r() * h, 6 + r() * 20, 0, Math.PI * 2);
        g.fill();
      }
      // cut the splits (between the veins, from the margin inward) and the holes
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      for (const side of [-1, 1])
        for (let k = 0; k < veins; k++) {
          const a = veinAt(k, side);
          const b = veinAt(k + 1, side);
          // the split runs along the middle between two veins
          const my0 = (a.y0 + b.y0) / 2;
          const mx1 = (a.x1 + b.x1) / 2;
          const my1 = (a.y1 + b.y1) / 2;
          const reach = 0.42 + r() * 0.2;
          const sx = mx1 + (cx - mx1) * reach;
          const sy = my1 + (my0 - my1) * reach;
          const wd = w * (0.012 + r() * 0.006);
          g.beginPath();
          g.moveTo(sx, sy);
          g.quadraticCurveTo((sx + mx1) / 2, (sy + my1) / 2 - wd * 0.6, mx1 + side * w * 0.03, my1 - wd * 1.2);
          g.lineTo(mx1 + side * w * 0.03, my1 + wd * 1.2);
          g.quadraticCurveTo((sx + mx1) / 2, (sy + my1) / 2 + wd * 0.6, sx, sy);
          g.closePath();
          g.fill();
          if (k > 0 && r() < 0.8) {
            const hx = cx + (mx1 - cx) * 0.24;
            const hy = my0 + (my1 - my0) * 0.24;
            g.beginPath();
            g.ellipse(hx, hy, w * 0.026, h * 0.011, Math.atan2(my1 - my0, mx1 - cx), 0, Math.PI * 2);
            g.fill();
          }
        }
      g.globalCompositeOperation = 'source-over';
    },
    { repeat: false },
  );
}

/** A leaf blade on a bent grid: the petiole meets it at the origin (texture v = 0.14), the tip along +y (length L, width W), cupped and arching back. */
function bentLeaf(L: number, W: number, arch: number, cup: number) {
  const g = new THREE.PlaneGeometry(W, L, 8, 10).translate(0, L / 2 - 0.14 * L, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const t = Math.max(0, y / L);
    p.setZ(i, -arch * t * t * L + cup * (x / (W / 2)) ** 2 * W * 0.5);
  }
  g.computeVertexNormals();
  return g;
}

const POTS = [
  { glaze: '#e6dccb', foot: '#b8a890' },
  { glaze: '#2a2a2c', foot: '#3a3a3c' },
  { glaze: '#b4643c', foot: '#8a4a2a' },
];

function bigPot(R: number, H: number, v: number) {
  const n = 40;
  const pot = smoothLathe(
    [
      [0, 0],
      [R * 0.8, 0],
      [R * 0.86, 0.02],
      [R * 0.92, H * 0.35],
      [R, H * 0.9],
      [R + 0.02, H * 0.92],
      [R + 0.02, H],
      [R - 0.02, H],
      [R - 0.03, H * 0.9],
      [0, H * 0.86],
    ],
    n,
    48,
  );
  const { glaze, foot } = POTS[v % POTS.length];
  const gc = C(glaze);
  const clay = v % POTS.length === 2;
  paintLathe(pot, n, (x, y, z, _a, out) => {
    out.copy(gc);
    if (!clay) {
      // a speckled stoneware glaze, the bare foot showing below
      if (y < 0.035) out.set(foot);
      out.multiplyScalar(0.92 + 0.1 * noise3(x * 30, y * 30, z * 30));
      if (noise3(x * 90, y * 90, z * 90) > 0.55) out.multiplyScalar(0.6);
    } else {
      mix(out, out, C('#e6d6c0'), smoothstep(0.25, 0.7, noise3(x * 12, y * 12, z * 12)) * 0.3);
      out.multiplyScalar(0.9 + 0.12 * noise3(x * 40, y * 40, z * 40));
    }
  });
  const soil = paint(new THREE.CircleGeometry(R - 0.025, 28).rotateX(-Math.PI / 2).translate(0, H * 0.87, 0), (x, _y, z, out) => out.set('#2a1c12').multiplyScalar(0.7 + 0.5 * noise3(x * 40, 0, z * 40)));
  return { pot, soil, glazed: !clay };
}

function monsteraGeometry(v: number) {
  return once(`office:monstera:${v}`, () => {
    const r = rand(v * 31 + 7);
    const R = 0.27;
    const H = 0.44;
    const { pot, soil, glazed } = bigPot(R, H, v);
    const leaves = new Merger();
    const stems = new Merger();
    const moss = new Merger();
    // a moss pole up the middle, a few aerial roots
    const poleH = 0.85 + r() * 0.15;
    const pole = new THREE.CylinderGeometry(0.035, 0.04, poleH, 12, 16).translate(0.02, H * 0.85 + poleH / 2, -0.03);
    paint(pole, (x, y, z, out) => out.set('#5a4a2a').multiplyScalar(0.6 + 0.6 * Math.max(0, noise3(x * 40, y * 25, z * 40))));
    moss.add(pole);
    const n = 8 + (v % 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.5;
      const up = 0.35 + (i / n) * 0.75 + r() * 0.15;
      const reach = 0.22 + r() * 0.3;
      const base = V(Math.cos(a) * 0.04, H * 0.86, Math.sin(a) * 0.04);
      const tip = V(Math.cos(a) * reach, H * 0.86 + up, Math.sin(a) * reach);
      const mid = base.clone().lerp(tip, 0.55).add(V(0, 0.08, 0));
      stems.add(paint(tubeThrough([base, mid, tip], (t) => 0.012 - t * 0.004, 12, 6).geometry, (_x, y, _z, out) => out.set('#4e6e2c').multiplyScalar(0.85 + 0.3 * Math.min(1, y))));
      // the leaf hangs out from the stem's tip, facing up and out, arching down
      const L = 0.56 + r() * 0.22 + up * 0.1;
      const leaf = bentLeaf(L, L * 0.98, 0.3 + r() * 0.2, 0.07);
      const tint = new THREE.Color().setScalar(0.85 + r() * 0.25);
      paint(leaf, (_x, _y, _z, out) => out.copy(tint));
      const yaw = -a - Math.PI / 2;
      const pitch = -0.55 - r() * 0.45;
      const roll = (r() - 0.5) * 0.6;
      leaves.add(leaf, trs([tip.x, tip.y, tip.z], [pitch - Math.PI / 2 + 1.0, yaw, roll], 1, 'YXZ'));
    }
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2;
      const y0 = H + 0.3 + r() * 0.5;
      stems.add(paint(tubeThrough([V(0.02 + Math.cos(a) * 0.04, y0, Math.sin(a) * 0.04), V(Math.cos(a) * 0.12, y0 - 0.2, Math.sin(a) * 0.12), V(Math.cos(a) * 0.16, H * 0.88, Math.sin(a) * 0.16)], () => 0.006, 10, 5).geometry, (_x, _y, _z, out) => out.set('#6a5236')));
    }
    const stemsG = stems.build();
    return { pot, soil, glazed, leaves: leaves.build(), stems: stemsG, moss: moss.build() };
  });
}

export function Monstera({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const g = monsteraGeometry(v);
  const p = propMats();
  const m = leafMats();
  return (
    <group rotation={[0, (seed % 5) * 0.7, 0]}>
      <mesh geometry={g.pot} material={g.glazed ? p.glaze : p.vc} castShadow receiveShadow />
      <mesh geometry={g.soil} material={p.vc} />
      <mesh geometry={g.moss} material={m.moss} castShadow />
      <mesh geometry={g.stems} material={p.vc} castShadow />
      <mesh geometry={g.leaves} material={m.monstera} castShadow receiveShadow />
    </group>
  );
}

// ---------- snake plant ----------

/** A sansevieria leaf: dark green with pale wavy cross-bands, a golden margin. u across, v along. */
function snakeTex() {
  return tex('o-snake-leaf', 128, 512, (g, w, h) => {
    const r = rand(9);
    g.fillStyle = '#1f3d22';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 7 + r() * 9) {
      g.strokeStyle = `rgba(${150 + r() * 40},${180 + r() * 30},${140 + r() * 30},${0.25 + r() * 0.25})`;
      g.lineWidth = 2 + r() * 4;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy = y + Math.sin(x * 0.12 + y) * 4 + (r() - 0.5) * 3;
        if (x === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
    const edge = g.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, 'rgba(214,190,80,0.95)');
    edge.addColorStop(0.12, 'rgba(214,190,80,0)');
    edge.addColorStop(0.88, 'rgba(214,190,80,0)');
    edge.addColorStop(1, 'rgba(214,190,80,0.95)');
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
  });
}

function snakeGeometry(v: number) {
  return once(`office:snake:${v}`, () => {
    const r = rand(v * 17 + 3);
    const R = 0.15;
    const H = 0.26;
    const n = 40;
    const pot = smoothLathe(
      [
        [0, 0],
        [R * 0.9, 0],
        [R, 0.015],
        [R, H],
        [R - 0.015, H],
        [R - 0.015, H * 0.85],
        [0, H * 0.82],
      ],
      n,
      48,
    );
    const col = C(['#ece6da', '#2c2c2e', '#7a8a7a'][v % 3]);
    paintLathe(pot, n, (x, y, z, _a, out) => {
      out.copy(col);
      // shallow vertical ribs
      out.multiplyScalar(0.9 + 0.1 * Math.cos(Math.atan2(z, x) * 36));
      if (y < 0.015) out.multiplyScalar(0.7);
    });
    const soil = paint(new THREE.CircleGeometry(R - 0.018, 24).rotateX(-Math.PI / 2).translate(0, H * 0.83, 0), (x, _y, z, out) => out.set('#2e2014').multiplyScalar(0.7 + 0.5 * noise3(x * 50, 0, z * 50)));
    const leaves = new Merger();
    const count = 9 + (v % 3) * 2;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + r() * 0.4;
      const d = 0.02 + r() * 0.07;
      const len = 0.55 + r() * 0.45 - d * 1.5;
      const wd = 0.075 + r() * 0.03;
      const g = blade(len, wd, { segs: 16, across: 4, ruffle: 0.004, curl: 0.03 + r() * 0.04, tip: 0.98, freq: 8 });
      // a slow twist up the blade
      const p = g.attributes.position;
      const tw = (r() - 0.5) * 1.2;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k);
        const t = (y / len) * tw;
        const x = p.getX(k);
        const z = p.getZ(k);
        p.setXYZ(k, x * Math.cos(t) - z * Math.sin(t), y, x * Math.sin(t) + z * Math.cos(t));
      }
      g.computeVertexNormals();
      paint(g, (_x, y, _z, out) => out.setScalar(0.75 + 0.3 * smoothstep(0, 0.3, y)));
      const lean = 0.08 + d * 1.6 + r() * 0.1;
      leaves.add(g, trs([Math.cos(a) * d, H * 0.82, Math.sin(a) * d], [lean, -a + Math.PI / 2, 0], 1, 'YXZ'));
    }
    return { pot, soil, leaves: leaves.build() };
  });
}

export function SnakePlant({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const g = snakeGeometry(v);
  const p = propMats();
  const m = leafMats();
  return (
    <group rotation={[0, seed * 0.9, 0]}>
      <mesh geometry={g.pot} material={p.glaze} castShadow receiveShadow />
      <mesh geometry={g.soil} material={p.vc} />
      <mesh geometry={g.leaves} material={m.snake} castShadow receiveShadow />
    </group>
  );
}

// ---------- trailing pothos ----------

/** A heart-shaped leaf grid (stalk at the origin, growing along +y, face +z), vertex coloured. */
function heartLeaf(len: number, wid: number, paintFn: (u: number, v: number, out: THREE.Color) => void) {
  const nu = 3;
  const nv = 8;
  const cols = nu * 2 + 1;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Color();
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    const hw = (wid / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + v * 0.88)), 0.75) * (1 + 0.25 * Math.pow(1 - v, 2));
    for (let i = 0; i < cols; i++) {
      const u = (i - nu) / nu;
      const notch = (1 - Math.abs(u)) * 0.12 * Math.pow(1 - v, 6) * len;
      pos.push(u * hw, v * len - notch * (v < 0.2 ? 1 : 0), 0.22 * hw * u * u + 0.1 * len * v * v);
      tmp.setRGB(1, 1, 1);
      paintFn(u, v, tmp);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function pothosGeometry(v: number) {
  return once(`office:pothos:${v}`, () => {
    const r = rand(v * 23 + 11);
    const R = 0.16;
    const H = 0.22;
    const n = 40;
    const pot = smoothLathe(
      [
        [0, 0],
        [R * 0.75, 0],
        [R * 0.8, 0.012],
        [R * 0.95, H * 0.5],
        [R, H * 0.92],
        [R + 0.012, H],
        [R - 0.012, H],
        [R - 0.02, H * 0.9],
        [0, H * 0.86],
      ],
      n,
      48,
    );
    const glaze = C(['#3e6a5a', '#d8c08a', '#3a4a6a'][v % 3]);
    paintLathe(pot, n, (x, y, z, along, out) => {
      out.copy(glaze);
      mix(out, out, glaze.clone().multiplyScalar(0.6), smoothstep(H * 0.6, 0.02, y) * 0.4);
      mix(out, out, C('#f0e8d6'), smoothstep(H * 0.9, H, y) * 0.4 * (along < 0.7 ? 1 : 0));
      out.multiplyScalar(0.92 + 0.1 * noise3(x * 40, y * 40, z * 40));
    });
    // a saucer under it
    const saucer = smoothLathe(
      [
        [0, 0],
        [R * 0.95, 0],
        [R * 1.08, 0.025],
        [R * 1.04, 0.03],
        [R * 0.9, 0.012],
        [0, 0.012],
      ],
      12,
      40,
    );
    paintLathe(saucer, 12, (_x, _y, _z, _a, out) => out.copy(glaze).multiplyScalar(0.85));
    const soil = paint(new THREE.CircleGeometry(R - 0.02, 24).rotateX(-Math.PI / 2).translate(0, H * 0.87, 0), (x, _y, z, out) => out.set('#2a1c12').multiplyScalar(0.75 + 0.45 * noise3(x * 60, 0, z * 60)));
    const leaves = new Merger();
    const vines = new Merger();
    const leafPaint = (u: number, vv: number, out: THREE.Color) => {
      out.set('#2c6a2a');
      mix(out, out, C('#4f8f36'), smoothstep(0.1, 0.9, vv) * 0.45);
      const streak = noise3(u * 3, vv * 6, v * 3 + 1);
      mix(out, out, C('#e0cc6a'), smoothstep(0.3, 0.55, streak) * 0.6);
      if (Math.abs(u) < 0.12) mix(out, out, C('#a8c870'), 0.35);
    };
    const big = heartLeaf(0.14, 0.12, leafPaint);
    const small = heartLeaf(0.1, 0.085, leafPaint);
    const up = V(0, 1, 0);
    const put = (pt: THREE.Vector3, dir: THREE.Vector3, face: THREE.Vector3, s: number, b: boolean) => {
      const Y = dir.clone().normalize();
      const X = new THREE.Vector3().crossVectors(Y, face).normalize();
      if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
      const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
      leaves.add(b ? big : small, new THREE.Matrix4().makeBasis(X, Y, Z).scale(V(s, s, s)).setPosition(pt));
    };
    // a full crown of leaves on short stalks
    for (let k = 0; k < 13; k++) {
      const a = (k / 13) * Math.PI * 2 + r() * 0.4;
      const tip = V(Math.cos(a) * (0.1 + r() * 0.07), H * 0.86 + 0.07 + r() * 0.12, Math.sin(a) * (0.1 + r() * 0.07));
      vines.add(tubeThrough([V(Math.cos(a) * 0.03, H * 0.86, Math.sin(a) * 0.03), tip], () => 0.005, 4, 4).geometry);
      put(tip, V(Math.cos(a), 0.9, Math.sin(a)), V(Math.cos(a), 1.2, Math.sin(a)), 0.9 + r() * 0.4, true);
    }
    // vines spilling over the rim, down the pot and out across the surface it stands on
    const trails = 5 + (v % 2);
    for (let k = 0; k < trails; k++) {
      const a = -0.9 + (k / (trails - 1)) * 3.4 + (r() - 0.5) * 0.3;
      const c = Math.cos(a + Math.PI / 2);
      const s = Math.sin(a + Math.PI / 2);
      const out = 0.3 + r() * 0.35;
      const pts = [V(c * 0.06, H * 0.88, s * 0.06), V(c * (R + 0.03), H + 0.03, s * (R + 0.03)), V(c * (R + 0.07), H * 0.4, s * (R + 0.07)), V(c * (R + 0.12), 0.02, s * (R + 0.12)), V(c * (R + out) + (r() - 0.5) * 0.12, 0.012, s * (R + out) + (r() - 0.5) * 0.12)];
      const curve = new THREE.CatmullRomCurve3(pts);
      vines.add(tubeThrough(pts, () => 0.0045, 32, 4).geometry);
      const count = 8;
      for (let j = 1; j <= count; j++) {
        const t = j / (count + 0.4);
        const pt = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        const side = j % 2 ? 1 : -1;
        const outward = V(c, 0.25, s);
        const onFloor = pt.y < 0.05;
        const dir = onFloor ? new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(side).add(tan.clone().multiplyScalar(0.6)) : new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(side).add(V(0, -0.4, 0)).add(outward.clone().multiplyScalar(0.6));
        put(pt.clone().add(V(0, onFloor ? 0.012 : 0, 0)), dir, onFloor ? up : outward, 0.6 + (1 - t) * 0.4, j < 4);
      }
    }
    return { pot, saucer, soil, leaves: leaves.build(), vines: paint(vines.build(), (_x, _y, _z, out) => out.set('#4a7a2e')) };
  });
}

export function TrailingPothos({ seed }: { seed: number }) {
  const v = variant(seed, 3);
  const g = pothosGeometry(v);
  const p = propMats();
  return (
    <group rotation={[0, (seed % 7) * 0.6, 0]}>
      <mesh geometry={g.saucer} material={p.glaze} receiveShadow castShadow />
      <mesh geometry={g.pot} material={p.glaze} position={[0, 0.012, 0]} castShadow receiveShadow />
      <mesh geometry={g.soil} material={p.vc} position={[0, 0.012, 0]} />
      <mesh geometry={g.vines} material={p.vc} castShadow />
      <mesh geometry={g.leaves} material={p.leaf} castShadow receiveShadow />
    </group>
  );
}
