import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createStore } from '../lib/store';
import type { CatalogItem } from './types';

// Pictures for the customise panel: each item is drawn once, off screen, into
// a small transparent image the first time the panel opens. One item every few
// frames, so the scene never stutters; kept for the rest of the visit.

export const thumbs = createStore<{ map: Record<string, string> }>({ map: {} });

const SIZE = 256; // rendered size; shown at about 72 px, so it stays sharp on retina
const OUT = 144;

export function ThumbMaker({ catalog }: { catalog: CatalogItem[] }) {
  const gl = useThree((s) => s.gl);
  const main = useThree((s) => s.scene);
  const [current, setCurrent] = useState<CatalogItem | null>(null);
  const holder = useRef<THREE.Group>(null);
  const frames = useRef(0);
  const stage = useMemo(() => {
    const s = new THREE.Scene();
    const hemi = new THREE.HemisphereLight('#f4fbff', '#3c4650', 1.5);
    const key = new THREE.DirectionalLight('#fff4e6', 2.4);
    key.position.set(-3, 5, 6);
    const rim = new THREE.DirectionalLight('#9fdcff', 1.1);
    rim.position.set(4, 2, -5);
    s.add(hemi, key, rim);
    return s;
  }, []);
  const cam = useMemo(() => new THREE.PerspectiveCamera(26, 1, 0.01, 400), []);
  const rt = useMemo(() => {
    const t = new THREE.WebGLRenderTarget(SIZE, SIZE);
    t.texture.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const tmp = useMemo(() => ({ box: new THREE.Box3(), size: new THREE.Vector3(), center: new THREE.Vector3(), dir: new THREE.Vector3(), clear: new THREE.Color(), buf: new Uint8Array(SIZE * SIZE * 4) }), []);
  useEffect(() => () => rt.dispose(), [rt]);

  // the next item without a picture
  useEffect(() => {
    if (current) return;
    const next = catalog.find((c) => !thumbs.get().map[c.kind]);
    if (next) {
      frames.current = 0;
      setCurrent(next);
    }
  }, [current, catalog]);

  useFrame(() => {
    const it = current;
    const h = holder.current;
    if (!it || !h) return;
    // a few frames for its geometry to be built and placed
    if (++frames.current < 3) return;
    stage.environment = main.environment;
    h.updateMatrixWorld(true);
    tmp.box.setFromObject(h);
    let url = '';
    if (!tmp.box.isEmpty()) {
      tmp.box.getSize(tmp.size);
      tmp.box.getCenter(tmp.center);
      const long = tmp.size.x > Math.max(tmp.size.y, tmp.size.z) * 4;
      const r = long ? Math.max(tmp.size.x * 0.2, tmp.size.y * 1.4) : Math.max(tmp.size.x, tmp.size.y * 1.05, tmp.size.z) * 0.5;
      const dist = (r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) * 0.92;
      const wall = it.surfaces.every((s) => s === 'wall');
      tmp.dir.set(wall ? 0 : 0.42, wall ? 0.05 : 0.5, 1).normalize();
      cam.position.copy(tmp.center).addScaledVector(tmp.dir, dist);
      cam.near = dist * 0.05;
      cam.far = dist * 4;
      cam.updateProjectionMatrix();
      cam.lookAt(tmp.center);
      cam.updateMatrixWorld();
      const prev = gl.getRenderTarget();
      gl.getClearColor(tmp.clear);
      const alpha = gl.getClearAlpha();
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.render(stage, cam);
      gl.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, tmp.buf);
      gl.setRenderTarget(prev);
      gl.setClearColor(tmp.clear, alpha);
      // pixels come bottom row first: flip into a canvas, then scale down smoothly
      const big = document.createElement('canvas');
      big.width = big.height = SIZE;
      const g = big.getContext('2d') as CanvasRenderingContext2D;
      const img = g.createImageData(SIZE, SIZE);
      for (let y = 0; y < SIZE; y++) img.data.set(tmp.buf.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
      g.putImageData(img, 0, 0);
      const out = document.createElement('canvas');
      out.width = out.height = OUT;
      const o = out.getContext('2d') as CanvasRenderingContext2D;
      o.imageSmoothingQuality = 'high';
      o.drawImage(big, 0, 0, OUT, OUT);
      url = out.toDataURL('image/png');
    }
    thumbs.set((s) => ({ map: { ...s.map, [it.kind]: url || 'none' } }));
    setCurrent(null);
  });

  if (!current) return null;
  const R = current.Render;
  return createPortal(
    <group ref={holder}>
      <R seed={1} />
    </group>,
    stage,
  );
}
