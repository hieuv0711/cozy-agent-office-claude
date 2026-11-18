import * as THREE from 'three';
import { mergeParts, paintGeometry, tubeThrough } from '../../tank/geo';
import { cached } from '../../tank/sdf';
import { noise3, rng, smoothstep } from '../../tank/util';

// Things the cooks hold and work with, in cook metres (see plan.ts): knife,
// ladle, order ticket, teacup, whisk and bowl, and the station's board, pot,
// burner, vegetables and recipe book. Smooth lathe and extruded shapes, painted
// per vertex, so they hold up in a close-up.

const lathe = (pts: [number, number][], seg = 40) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );

// ---------- materials (shared by every cook) ----------

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  return {
    steel: new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.85, roughness: 0.32 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: '#6c6f76', metalness: 0.8, roughness: 0.45 }),
    blade: new THREE.MeshStandardMaterial({ color: '#dfe3e8', metalness: 0.95, roughness: 0.18 }),
    wood: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.72 }),
    paper: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, side: THREE.DoubleSide }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    veg: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.55 }),
    broth: new THREE.MeshStandardMaterial({ color: '#d6974a', roughness: 0.25, emissive: '#5a2c0c', emissiveIntensity: 0.35 }),
    tea: new THREE.MeshStandardMaterial({ color: '#7c6a2a', roughness: 0.15 }),
    iron: new THREE.MeshStandardMaterial({ color: '#2b2a2c', metalness: 0.6, roughness: 0.55 }),
    flame: new THREE.MeshBasicMaterial({ color: new THREE.Color('#6fb4ff').multiplyScalar(2.2), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    steam: new THREE.MeshBasicMaterial({ color: '#f3efe8', transparent: true, opacity: 0.22, depthWrite: false }),
  };
}
export const propMats = () => (mats ??= makeMats());

// ---------- in the hand ----------

/** A cook's knife: handle centred on the origin along z, blade forward (+z), edge down. */
export function knifeGeometry() {
  return cached('prop-knife', () => {
    const s = new THREE.Shape();
    // the blade in (z, y): heel at z = 0.032, tip at z = 0.17
    s.moveTo(0.032, 0.012);
    s.lineTo(0.15, 0.011);
    s.quadraticCurveTo(0.168, 0.009, 0.172, 0.002);
    s.quadraticCurveTo(0.15, -0.024, 0.09, -0.027);
    s.lineTo(0.036, -0.027);
    s.quadraticCurveTo(0.03, -0.026, 0.03, -0.02);
    s.lineTo(0.03, 0.006);
    s.quadraticCurveTo(0.03, 0.012, 0.032, 0.012);
    const blade = new THREE.ExtrudeGeometry(s, { depth: 0.0022, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 16 });
    // shape x -> z, shape y -> y, extrude depth -> x
    blade.rotateY(-Math.PI / 2).translate(0.0011, 0, 0);
    paintGeometry(blade, (_x, y, _z, out) => {
      // a brighter bevel along the edge
      out.setRGB(1, 1, 1).multiplyScalar(0.86 + 0.24 * smoothstep(-0.012, -0.026, y));
    });
    const handle = new THREE.CapsuleGeometry(0.0105, 0.058, 6, 14).rotateX(Math.PI / 2).scale(0.82, 1, 1).translate(0, -0.004, -0.004);
    paintGeometry(handle, (x, y, z, out) => {
      const g = 0.5 + 0.5 * Math.sin(z * 260 + noise3(x * 90, y * 90, z * 40) * 3);
      out.setRGB(0.42, 0.25, 0.14).multiplyScalar(0.8 + 0.25 * g);
    });
    const bolster = new THREE.CylinderGeometry(0.0105, 0.011, 0.008, 14).rotateX(Math.PI / 2).scale(0.75, 1, 1).translate(0, -0.004, 0.028);
    paintGeometry(bolster, (_x, _y, _z, out) => out.setRGB(0.75, 0.76, 0.8));
    return mergeParts([blade, handle, bolster], ['position', 'normal', 'color']).scale(1.3, 1.3, 1.3);
  });
}

/** A ladle: grip at the origin, the handle running down (-y) to a deep bowl 0.15 below. */
export function ladleGeometry() {
  return cached('prop-ladle', () => {
    const pts = [new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0, -0.045, 0.004), new THREE.Vector3(0, -0.11, 0.002), new THREE.Vector3(0, -0.15, -0.012)];
    const handle = tubeThrough(pts, (t) => 0.0055 - 0.0012 * t, 24, 8).geometry;
    const bowl = lathe(
      [
        [0.0, -0.04],
        [0.018, -0.037],
        [0.03, -0.026],
        [0.036, -0.01],
        [0.037, 0.0],
        [0.034, 0.0],
        [0.032, -0.009],
        [0.026, -0.022],
        [0.015, -0.031],
        [0.0, -0.033],
      ],
      28,
    ).translate(0, -0.15, -0.03);
    return mergeParts([handle, bowl], ['position', 'normal']);
  });
}

/** A small handleless teacup (yunomi) with tea in it; base on y = 0. */
export function cupGeometry() {
  return cached('prop-cup', () => {
    const g = lathe(
      [
        [0.0, 0.0],
        [0.022, 0.0],
        [0.024, 0.004],
        [0.027, 0.03],
        [0.029, 0.058],
        [0.0265, 0.06],
        [0.025, 0.035],
        [0.022, 0.012],
        [0.0, 0.01],
      ],
      32,
    );
    paintGeometry(g, (x, y, z, out) => {
      // a celadon glaze pooling darker toward the foot, bare clay at the foot
      out.setRGB(0.58, 0.72, 0.62).multiplyScalar(0.8 + 0.3 * smoothstep(0.0, 0.05, y) + 0.06 * noise3(x * 200, y * 200, z * 200));
      if (y < 0.005) out.setRGB(0.62, 0.48, 0.36);
    });
    return g.scale(1.35, 1.35, 1.35);
  });
}

const paperTex = new Map<number, THREE.CanvasTexture>();

/** An order ticket: off-white paper, a red header, a few hand-written lines (just marks, nothing readable). */
export function ticketTexture(seed: number) {
  let t = paperTex.get(seed % 6);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 176;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = rng(seed * 977 + 13);
  g.fillStyle = '#f4efe2';
  g.fillRect(0, 0, 128, 176);
  // fibres
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(120,100,70,${0.03 + r() * 0.05})`;
    g.fillRect(r() * 128, r() * 176, 1 + r() * 2, 1);
  }
  g.fillStyle = '#c4473a';
  g.fillRect(10, 12, 108, 10);
  g.strokeStyle = '#2c2a33';
  g.lineCap = 'round';
  for (let line = 0; line < 6; line++) {
    const y = 40 + line * 21;
    let x = 12;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(x, y);
    const end = 60 + r() * 52;
    while (x < end) {
      x += 3 + r() * 4;
      g.lineTo(x, y + (r() - 0.5) * 7);
    }
    g.stroke();
    // a tick or a number-like mark at the end
    g.beginPath();
    g.arc(108, y, 3 + r() * 2, 0, Math.PI * 2 * (0.6 + r() * 0.4));
    g.stroke();
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  paperTex.set(seed % 6, t);
  return t;
}

/** A ticket's paper: slightly curled, 0.13 x 0.18, centred on the origin, facing +z. */
export function ticketGeometry() {
  return cached('prop-ticket', () => {
    const g = new THREE.PlaneGeometry(0.13, 0.18, 6, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, -0.014 * Math.pow(p.getX(i) / 0.065, 2) + 0.004 * Math.sin(p.getY(i) * 26));
    g.computeVertexNormals();
    return g;
  });
}

/** A whisk: grip at the origin, wires bulging down (-y). */
export function whiskGeometry() {
  return cached('prop-whisk', () => {
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.006, 0.007, 0.06, 10).translate(0, 0.0, 0)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        const w = Math.sin(u * Math.PI) * 0.022;
        pts.push(new THREE.Vector3(Math.cos(a) * w, -0.03 - u * 0.075, Math.sin(a) * w));
      }
      parts.push(tubeThrough(pts, () => 0.0012, 16, 4).geometry);
    }
    return mergeParts(parts, ['position', 'normal']).scale(1.3, 1.3, 1.3);
  });
}

/** A small mixing bowl, base on y = 0. */
export function smallBowlGeometry() {
  return cached('prop-small-bowl', () =>
    paintGeometry(
      lathe(
        [
          [0, 0],
          [0.026, 0],
          [0.03, 0.004],
          [0.046, 0.026],
          [0.05, 0.038],
          [0.047, 0.039],
          [0.043, 0.027],
          [0.026, 0.008],
          [0, 0.006],
        ],
        32,
      ),
      (x, y, z, out) => {
        // cream glaze, a blue band under the rim
        out.setRGB(0.93, 0.9, 0.82);
        const r = Math.hypot(x, z);
        if (y > 0.028 && y < 0.034 && r > 0.045) out.setRGB(0.25, 0.36, 0.6);
      },
    ).scale(1.3, 1.3, 1.3),
  );
}

// ---------- at the station ----------

/** A thick wooden cutting board (0.3 x 0.19), top at y = 0.02, centred on the origin. */
export function boardGeometry() {
  return cached('prop-board', () => {
    const w = 0.3;
    const d = 0.19;
    const r = 0.022;
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -d / 2);
    s.lineTo(w / 2 - r, -d / 2);
    s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    s.lineTo(w / 2, d / 2 - r);
    s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    s.lineTo(-w / 2 + r, d / 2);
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    s.lineTo(-w / 2, -d / 2 + r);
    s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 8 });
    g.rotateX(-Math.PI / 2).translate(0, 0.002, 0);
    paintGeometry(g, (x, y, z, out) => {
      // pale hinoki: long grain along x, knife marks in the middle, darker end grain
      const grain = 0.5 + 0.5 * Math.sin(z * 520 + noise3(x * 20, 0, z * 60) * 4);
      out.setRGB(0.86, 0.68, 0.46).multiplyScalar(0.84 + 0.14 * grain);
      if (y < 0.016) out.multiplyScalar(0.82);
      const marks = Math.abs(Math.sin(x * 900 + z * 300)) > 0.985 && Math.abs(x) < 0.1 && Math.abs(z) < 0.06 ? 0.9 : 1;
      out.multiplyScalar(marks);
    });
    return g;
  });
}

/** What's left of a carrot, lying along +x: the cut face at x = 0, the top at x = 1 (scaled to its length). */
export function carrotGeometry() {
  return cached('prop-carrot', () => {
    const g = lathe(
      [
        [0.0, 0.0],
        [0.0185, 0.0],
        [0.0195, 0.015],
        [0.021, 0.5],
        [0.022, 0.86],
        [0.019, 0.95],
        [0.011, 0.99],
        [0.0, 1.0],
      ],
      20,
    ).rotateZ(-Math.PI / 2);
    paintGeometry(g, (x, y, z, out) => {
      const r = Math.hypot(y, z);
      if (x < 0.002) {
        // the fresh cut: a paler core inside a bright ring
        out.setRGB(1.0, 0.56, 0.16).multiplyScalar(0.95 + 0.2 * smoothstep(0.012, 0.0, r) + 0.12 * smoothstep(0.009, 0.011, r) * smoothstep(0.014, 0.012, r));
        return;
      }
      const ring = 0.5 + 0.5 * Math.sin(x * 120 + noise3(x * 30, y * 300, z * 300) * 2);
      out.setRGB(0.96, 0.45, 0.12).multiplyScalar(0.84 + 0.16 * ring);
    });
    return g;
  });
}

/** A carrot coin, lying flat. */
export function coinGeometry() {
  return cached('prop-coin', () => {
    const g = new THREE.CylinderGeometry(0.019, 0.019, 0.007, 16);
    paintGeometry(g, (x, y, z, out) => {
      const r = Math.hypot(x, z);
      out.setRGB(0.98, 0.5, 0.14).multiplyScalar(0.9 + 0.25 * smoothstep(0.006, 0.0, r) + (Math.abs(y) > 0.003 && r < 0.018 ? 0.08 : 0));
    });
    return g;
  });
}

/** The carrot's leafy top. */
export function carrotTopGeometry() {
  return cached('prop-carrot-top', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, Math.cos(a) * 0.006, Math.sin(a) * 0.006), new THREE.Vector3(0.045, Math.cos(a) * 0.016 + 0.004, Math.sin(a) * 0.016)];
      parts.push(tubeThrough(pts, (t) => 0.0032 * (1 - t * 0.5), 10, 5).geometry);
    }
    const g = mergeParts(parts, ['position', 'normal']).scale(1.4, 1.4, 1.4);
    paintGeometry(g, (x, _y, _z, out) => out.setRGB(0.32, 0.58, 0.22).multiplyScalar(0.8 + 3 * x));
    return g;
  });
}

/** A stock pot without its lid, base on y = 0 (0.28 across, 0.13 tall), with two side handles. */
export function potGeometry() {
  return cached('prop-pot', () => {
    const body = lathe(
      [
        [0.0, 0.0],
        [0.125, 0.0],
        [0.134, 0.006],
        [0.136, 0.02],
        [0.136, 0.124],
        [0.14, 0.13],
        [0.136, 0.134],
        [0.131, 0.128],
        [0.13, 0.02],
        [0.122, 0.012],
        [0.0, 0.012],
      ],
      48,
    );
    paintGeometry(body, (x, y, z, out) => {
      // brushed steel with a darker heat ring near the base
      const brush = 0.5 + 0.5 * Math.sin(y * 900 + noise3(x * 40, y * 4, z * 40) * 2);
      out.setRGB(1, 1, 1).multiplyScalar(0.82 + 0.1 * brush - 0.25 * smoothstep(0.03, 0.0, y));
    });
    const handles: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const pts = [new THREE.Vector3(s * 0.134, 0.1, -0.022), new THREE.Vector3(s * 0.165, 0.108, -0.02), new THREE.Vector3(s * 0.168, 0.108, 0.02), new THREE.Vector3(s * 0.134, 0.1, 0.022)];
      handles.push(tubeThrough(pts, () => 0.0042, 16, 6).geometry);
    }
    return mergeParts([body, ...handles], ['position', 'normal', 'color']);
  });
}

/** The broth's surface inside the pot. */
export function brothGeometry() {
  return cached('prop-broth', () => new THREE.CircleGeometry(0.129, 40).rotateX(-Math.PI / 2).translate(0, 0.105, 0));
}

/** A cast-iron burner on short legs, its ring at y = 0.03; base on y = 0. */
export function burnerGeometry() {
  return cached('prop-burner', () => {
    const base = lathe(
      [
        [0.0, 0.0],
        [0.12, 0.0],
        [0.125, 0.006],
        [0.118, 0.024],
        [0.1, 0.03],
        [0.0, 0.03],
      ],
      36,
    );
    const ring = new THREE.TorusGeometry(0.06, 0.008, 8, 32).rotateX(Math.PI / 2).translate(0, 0.032, 0);
    const prongs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      prongs.push(new THREE.BoxGeometry(0.06, 0.012, 0.012).translate(0.1, 0.036, 0).rotateY(a));
    }
    return mergeParts([base, ring, ...prongs], ['position', 'normal']);
  });
}

/** The burner's flame: a ring of little blue tongues (additive), drawn when it's lit. */
export function flameGeometry() {
  return cached('prop-flame', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      parts.push(new THREE.ConeGeometry(0.007, 0.03, 6).translate(0.06, 0.05, 0).rotateY(a));
    }
    return mergeParts(parts, ['position', 'normal']);
  });
}

/** An open recipe book (0.32 x 0.21), pages curving up from the spine; base on y = 0. */
export function bookGeometry() {
  return cached('prop-book', () => {
    const cover = new THREE.BoxGeometry(0.25, 0.008, 0.165).translate(0, 0.004, 0);
    paintGeometry(cover, (_x, _y, _z, out) => out.setRGB(0.55, 0.16, 0.12));
    const pages = new THREE.PlaneGeometry(0.236, 0.152, 24, 4).rotateX(-Math.PI / 2);
    const p = pages.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const u = Math.abs(x) / 0.118;
      p.setY(i, 0.012 + 0.01 * Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.85) - 0.006 * smoothstep(0.0, 0.08, 1 - u) * 0);
    }
    pages.computeVertexNormals();
    paintGeometry(pages, (x, _y, z, out) => {
      // paper, a drawing on the left page, lines on the right, shade at the spine
      out.setRGB(0.95, 0.92, 0.84);
      const lines = x < -0.015 && Math.abs(Math.sin(z * 200)) > 0.93 && Math.abs(z) < 0.06 && x > -0.105 ? 0.55 : 1;
      out.multiplyScalar(lines);
      const dx = x - 0.06;
      if (Math.hypot(dx, z + 0.01) < 0.034 && Math.hypot(dx, z + 0.01) > 0.028) out.setRGB(0.52, 0.34, 0.24);
      out.multiplyScalar(0.7 + 0.3 * smoothstep(0.0, 0.02, Math.abs(x)));
    });
    return mergeParts([cover, pages], ['position', 'normal', 'color']).scale(1.3, 1.3, 1.3);
  });
}

/** A finished bowl of ramen (0.19 across, cook metres): glazed bowl, broth, noodles, egg, chashu, nori, scallions. Base on y = 0. */
export function ramenGeometry() {
  return cached('prop-ramen', () => {
    const bowl = lathe(
      [
        [0.0, 0.0],
        [0.034, 0.0],
        [0.036, 0.007],
        [0.033, 0.009],
        [0.058, 0.03],
        [0.082, 0.058],
        [0.095, 0.076],
        [0.092, 0.079],
        [0.083, 0.064],
        [0.058, 0.036],
        [0.03, 0.017],
        [0.0, 0.015],
      ],
      44,
    );
    {
      // dark red glaze outside, a cream band at the rim, cream inside
      const p = bowl.attributes.position;
      const n = bowl.attributes.normal;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        const r = Math.hypot(x, z) || 1;
        const outward = (n.getX(i) * x + n.getZ(i) * z) / r > 0.05 && n.getY(i) < 0.9;
        let c: [number, number, number] = outward ? [0.5, 0.1, 0.08] : [0.93, 0.89, 0.8];
        if (outward && y > 0.062) c = [0.92, 0.87, 0.76];
        if (outward && y < 0.01) c = [0.66, 0.5, 0.38];
        col.set(c, i * 3);
      }
      bowl.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const broth = new THREE.CircleGeometry(0.081, 36).rotateX(-Math.PI / 2).translate(0, 0.06, 0);
    paintGeometry(broth, (x, _y, z, out) => out.setRGB(0.86, 0.58, 0.28).multiplyScalar(0.9 + 0.15 * Math.sin(x * 140) * Math.sin(z * 120)));
    const parts: THREE.BufferGeometry[] = [bowl, broth];
    // noodles: loose waves breaking the surface
    const r = rng(7);
    for (let k = 0; k < 7; k++) {
      const a0 = r() * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 8; j++) {
        const u = j / 8;
        const rad = 0.02 + u * 0.05;
        const a = a0 + u * 1.6;
        pts.push(new THREE.Vector3(Math.cos(a) * rad, 0.061 + Math.sin(u * 9 + k) * 0.003, Math.sin(a) * rad));
      }
      parts.push(paintGeometry(tubeThrough(pts, () => 0.0032, 20, 5).geometry, (_x, _y, _z, out) => out.setRGB(0.98, 0.86, 0.52)));
    }
    // half an egg, yolk up
    const egg = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.026, 0.016, 0.02).rotateX(-0.2).translate(0.03, 0.062, 0.022);
    paintGeometry(egg, (x, y, z, out) => {
      const d = Math.hypot((x - 0.03) / 0.014, (z - 0.022) / 0.011);
      out.setRGB(0.98, 0.97, 0.93);
      if (y > 0.07 && d < 1) out.setRGB(1.0, 0.6, 0.12);
    });
    // a slice of chashu
    const pork = new THREE.CylinderGeometry(0.028, 0.028, 0.006, 24).rotateZ(0.12).translate(-0.032, 0.064, 0.012);
    paintGeometry(pork, (x, _y, z, out) => {
      const d = Math.hypot(x + 0.032, z - 0.012);
      out.setRGB(0.78, 0.5, 0.38).multiplyScalar(d > 0.022 ? 0.72 : 1 + 0.15 * Math.sin(d * 600));
    });
    // nori standing at the back of the bowl
    const nori = new THREE.BoxGeometry(0.05, 0.06, 0.002).rotateX(-0.32).translate(-0.005, 0.078, -0.06);
    paintGeometry(nori, (_x, _y, _z, out) => out.setRGB(0.1, 0.16, 0.1));
    parts.push(egg, pork, nori);
    // scallions
    for (let k = 0; k < 9; k++) {
      const s = new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 10).translate(0.01 + (r() - 0.5) * 0.05, 0.063, -0.025 + (r() - 0.5) * 0.04);
      parts.push(paintGeometry(s, (_x, _y, _z, out) => out.setRGB(0.42, 0.72, 0.3)));
    }
    return mergeParts(parts, ['position', 'normal', 'color']);
  });
}

/** A noodle strainer (tebo): grip at the origin, a wooden handle running down (-y) to a deep mesh basket. */
export function strainerGeometry() {
  return cached('prop-strainer', () => {
    const handle = new THREE.CylinderGeometry(0.0075, 0.0085, 0.16, 10).translate(0, -0.06, 0);
    paintGeometry(handle, (_x, y, _z, out) => out.setRGB(0.62, 0.42, 0.24).multiplyScalar(0.85 + 0.15 * Math.sin(y * 300)));
    const basket = lathe(
      [
        [0.0, -0.3],
        [0.03, -0.3],
        [0.04, -0.29],
        [0.044, -0.2],
        [0.046, -0.14],
        [0.0, -0.14],
      ],
      24,
    );
    paintGeometry(basket, (x, y, z, out) => {
      // a fine steel mesh: a dark grid over silver
      const a = Math.atan2(x, z);
      const grid = Math.max(Math.abs(Math.sin(a * 24)), Math.abs(Math.sin(y * 260)));
      out.setRGB(0.5, 0.52, 0.56).multiplyScalar(grid > 0.85 ? 1.1 : 0.42);
    });
    const rim = new THREE.TorusGeometry(0.046, 0.004, 6, 24).rotateX(Math.PI / 2).translate(0, -0.14, 0);
    paintGeometry(rim, (_x, _y, _z, out) => out.setRGB(0.62, 0.63, 0.67));
    return mergeParts([handle, basket, rim], ['position', 'normal', 'color']);
  });
}

/** A folded kitchen cloth, lying flat (0.09 x 0.06). */
export function clothGeometry() {
  return cached('prop-cloth', () => {
    const g = new THREE.BoxGeometry(0.09, 0.012, 0.062, 6, 1, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.003 * Math.sin(p.getX(i) * 90) * Math.cos(p.getZ(i) * 70));
    g.computeVertexNormals();
    paintGeometry(g, (x, _y, z, out) => {
      // a blue-striped tea towel
      out.setRGB(0.95, 0.94, 0.9);
      if (Math.abs(Math.sin(z * 120)) > 0.92 || Math.abs(x) > 0.038) out.setRGB(0.32, 0.45, 0.68);
    });
    return g;
  });
}

/** A pair of chopsticks held together, tips toward +z (0.11 long). */
export function chopsticksGeometry() {
  return cached('prop-chopsticks', () => {
    const a = new THREE.CylinderGeometry(0.0022, 0.0042, 0.11, 6).rotateX(Math.PI / 2).translate(-0.004, 0, 0.04);
    const b = new THREE.CylinderGeometry(0.0022, 0.0042, 0.11, 6).rotateX(Math.PI / 2).rotateY(0.08).translate(0.004, 0.004, 0.04);
    const g = mergeParts([a, b], ['position', 'normal']);
    paintGeometry(g, (_x, _y, z, out) => out.setRGB(0.55, 0.3, 0.18).multiplyScalar(z > 0.07 ? 1.25 : 1));
    return g;
  });
}

const menuTex = new Map<number, THREE.CanvasTexture>();
/** A little menu card: a red header and brush marks (nothing readable). */
export function menuTexture(seed: number) {
  let t = menuTex.get(seed % 3);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = rng(seed * 31 + 5);
  g.fillStyle = '#efe4cc';
  g.fillRect(0, 0, 96, 128);
  g.fillStyle = '#a8322a';
  g.beginPath();
  g.arc(48, 22, 12, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a2e28';
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const y = 48 + i * 12;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(14, y);
    g.lineTo(14 + 30 + r() * 30, y + (r() - 0.5) * 3);
    g.stroke();
    g.beginPath();
    g.arc(80, y, 2.5, 0, Math.PI * 2);
    g.stroke();
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  menuTex.set(seed % 3, t);
  return t;
}
