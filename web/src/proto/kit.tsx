import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Small shared pieces for the concept scenes.

export function Eye({ p, s = 0.09, look = [0, 0, 1], closed = false }: { p: [number, number, number]; s?: number; look?: [number, number, number]; closed?: boolean }) {
  if (closed) {
    return (
      <mesh position={p} rotation={[0, 0, 0]}>
        <boxGeometry args={[s * 1.8, s * 0.28, s * 0.4]} />
        <meshBasicMaterial color="#1b1a22" />
      </mesh>
    );
  }
  return (
    <group position={p}>
      <mesh>
        <sphereGeometry args={[s, 16, 12]} />
        <meshStandardMaterial color="#fbf8f2" roughness={0.3} />
      </mesh>
      <mesh position={[look[0] * s * 0.45, look[1] * s * 0.45, s * 0.62]}>
        <sphereGeometry args={[s * 0.52, 14, 10]} />
        <meshBasicMaterial color="#141218" />
      </mesh>
      <mesh position={[look[0] * s * 0.45 + s * 0.18, look[1] * s * 0.45 + s * 0.2, s * 0.98]}>
        <sphereGeometry args={[s * 0.16, 8, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

export function useCanvasTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256, deps: unknown[] = []) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d') as CanvasRenderingContext2D, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A glyph on a soft round card, for "?" and "z" thought bubbles.
export function glyphTexture(glyph: string, fg: string, bg = 'rgba(255,255,255,0.85)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = bg;
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = fg;
  g.font = 'bold 76px "M PLUS Rounded 1c", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
