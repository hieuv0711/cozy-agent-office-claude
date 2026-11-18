import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeParts } from '../../tank/geo';
import { pageEdgeTexture } from './desk-art';
import { mapUV, material, metals, planarUV, rand, roundedBox, slab, solid, weaveTexture } from './desk-kit';

// Hardcover books: cloth boards, a rounded spine with a leather label and
// raised gold bands, and a block of pages. Lying in a stack, or standing in
// a row between bookends.

const CLOTHS = ['#64262a', '#2b4535', '#26324a', '#9a7633', '#2e5254', '#4a2f42', '#866a4c', '#2c2c30', '#8e4a36', '#c4b898'] as const;
const LABELS = ['#1c1714', '#3a1414', '#e3d7b8'] as const;

type BookSpec = { w: number; t: number; d: number; cloth: string; label: string; bands: number };

function randomBook(r: () => number, o: { w: [number, number]; t: [number, number]; d: [number, number] }): BookSpec {
  const lerp = ([a, b]: [number, number]) => a + (b - a) * r();
  return {
    w: lerp(o.w),
    t: lerp(o.t),
    d: lerp(o.d),
    cloth: CLOTHS[Math.floor(r() * CLOTHS.length)],
    label: LABELS[Math.floor(r() * LABELS.length)],
    bands: r() < 0.25 ? 0 : r() < 0.6 ? 2 : 4,
  };
}

/** A spine piece: a half-ellipse tube along x, centred at x, bulging toward +z. */
function spinePiece(R: number, bulge: number, len: number, x: number, y: number, z: number) {
  return new THREE.CylinderGeometry(R, R, len, 22, 1, true, -Math.PI / 2, Math.PI).rotateZ(-Math.PI / 2).scale(1, 1, bulge).translate(x, y, z);
}

/**
 * One book lying flat: spine along +z, x is the book's height, y its
 * thickness (bottom at y = 0), z its width.
 */
function bookGeometry(b: BookSpec) {
  const board = 0.022;
  const R = b.t / 2;
  const bulge = 0.42;
  const zs = b.d / 2 - R * bulge;
  const coverLen = zs + b.d / 2;
  const coverZ = (zs - b.d / 2) / 2;
  const cloth = [
    roundedBox(b.w, board, coverLen, 0.009, 2).translate(0, b.t - board / 2, coverZ),
    roundedBox(b.w, board, coverLen, 0.009, 2).translate(0, board / 2, coverZ),
    spinePiece(R, bulge, b.w, 0, R, zs),
  ].map((g) => solid(g, b.cloth));
  const labelLen = Math.min(0.55, b.w * 0.28);
  cloth.push(solid(spinePiece(R * 1.012, bulge * 1.04, labelLen, b.w * 0.08, R, zs), b.label));
  const gold: THREE.BufferGeometry[] = [];
  const ring = (x: number, len = 0.03) => gold.push(spinePiece(R * 1.03, bulge * 1.07, len, x, R, zs));
  if (b.bands >= 2) {
    ring(b.w / 2 - 0.16);
    ring(-b.w / 2 + 0.16);
  }
  if (b.bands >= 4) {
    ring(b.w / 2 - 0.25);
    ring(-b.w / 2 + 0.25);
  }
  ring(b.w * 0.08 + labelLen / 2 + 0.025, 0.012);
  ring(b.w * 0.08 - labelLen / 2 - 0.025, 0.012);
  const pagesLen = coverLen - 0.04;
  const pages = mapUV(roundedBox(b.w - 0.05, b.t - board * 2 - 0.004, pagesLen, 0.006, 2).translate(0, b.t / 2, -b.d / 2 + 0.035 + pagesLen / 2 - 0.01), (x, y, z) => [x + z, y * 1.1]);
  return {
    cloth: planarUV(mergeParts(cloth, ['position', 'normal', 'color']), 2.5),
    gold: mergeParts(gold, ['position', 'normal']),
    pages,
  };
}

function useBookMaterials() {
  return {
    cloth: material('book:cloth', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, bumpMap: weaveTexture('book', { thread: 3 }), bumpScale: 0.45 })),
    pages: material('book:pages', () => new THREE.MeshStandardMaterial({ map: pageEdgeTexture(), roughness: 0.9 })),
    gold: metals().gold,
  };
}

type Placed = { b: BookSpec; g: ReturnType<typeof bookGeometry>; pos: [number, number, number]; rot: [number, number, number] };

function Books({ books }: { books: Placed[] }) {
  const m = useBookMaterials();
  return (
    <>
      {books.map(({ g, pos, rot }, i) => (
        <group key={i} position={pos} rotation={rot}>
          <mesh geometry={g.cloth} material={m.cloth} castShadow receiveShadow />
          <mesh geometry={g.gold} material={m.gold} />
          <mesh geometry={g.pages} material={m.pages} receiveShadow />
        </group>
      ))}
    </>
  );
}

/** Three to five hardcovers lying in a slightly skewed pile, spines out (+z). */
export function BookStack({ seed }: { seed: number }) {
  const books = useMemo(() => {
    const r = rand(seed);
    const n = 3 + Math.floor(r() * 3);
    let y = 0;
    const out: Placed[] = [];
    for (let i = 0; i < n; i++) {
      const b = randomBook(r, { w: [2.0 - i * 0.12, 2.5 - i * 0.12], t: [0.16, 0.36], d: [1.35 - i * 0.04, 1.65 - i * 0.04] });
      out.push({ b, g: bookGeometry(b), pos: [(r() - 0.5) * 0.14, y, (r() - 0.5) * 0.1], rot: [0, (r() - 0.5) * 0.32, 0] });
      y += b.t;
    }
    return out;
  }, [seed]);
  return <Books books={books} />;
}

function bookendGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0.5, 0.85);
  s.quadraticCurveTo(0.5, 1.25, 0, 1.28);
  s.quadraticCurveTo(-0.5, 1.25, -0.5, 0.85);
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0.82, 0.2, 0, Math.PI * 2, true);
  s.holes.push(hole);
  // the upright plate stands in the yz plane; a flange runs under it along -x
  const plate = slab(s, 0.05, 0.016, 2, 24).rotateY(Math.PI / 2);
  const flange = roundedBox(0.42, 0.035, 0.96, 0.014, 2).translate(-0.2, 0.0175, 0);
  return mergeParts([plate, flange], ['position', 'normal']);
}

/** Seven to nine books standing on end, spines out (+z), between brass bookends, or with the last one leaning. */
export function BookRow({ seed }: { seed: number }) {
  const { books, ends } = useMemo(() => {
    const r = rand(seed);
    const n = 7 + Math.floor(r() * 3);
    const lean = r() < 0.5;
    const out: Placed[] = [];
    let x = 0;
    let prevH = 0;
    for (let i = 0; i < n; i++) {
      const b = randomBook(r, { w: [1.75, 2.45], t: [0.18, 0.42], d: [1.05, 1.42] });
      const z = 0.62 - b.d / 2;
      if (lean && i === n - 1) {
        // tipped about its bottom-left corner until it rests on its neighbour
        const phi = 0.24;
        const xb = x - 0.012 + Math.min(prevH, b.w) * Math.tan(phi);
        const c = Math.cos(phi);
        const sn = Math.sin(phi);
        out.push({ b, g: bookGeometry(b), pos: [xb + b.t * c - (b.w / 2) * sn, b.t * sn + (b.w / 2) * c, z], rot: [0, 0, Math.PI / 2 + phi] });
        x = xb + b.t * c;
      } else {
        // stood on its bottom edge
        out.push({ b, g: bookGeometry(b), pos: [x + b.t, b.w / 2, z], rot: [0, 0, Math.PI / 2] });
        x += b.t + 0.012;
        prevH = b.w;
      }
    }
    const width = x;
    for (const o of out) o.pos[0] -= width / 2;
    return { books: out, ends: lean ? [-width / 2 - 0.03] : [-width / 2 - 0.03, width / 2 + 0.03] };
  }, [seed]);
  const g = useMemo(bookendGeometry, []);
  const m = metals();
  return (
    <group>
      <Books books={books} />
      {ends.map((x, i) => (
        <mesh key={i} geometry={g} material={m.brass} position={[x, 0, 0.62 - 0.6]} rotation={[0, i === 0 ? 0 : Math.PI, 0]} castShadow receiveShadow />
      ))}
    </group>
  );
}
