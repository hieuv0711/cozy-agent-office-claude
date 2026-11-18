import * as THREE from 'three';

export type Mood = 'dusk' | 'night' | 'rain';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D] as const;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function finish(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function skyline(g: CanvasRenderingContext2D, r: () => number, W: number, H: number, maxFrac: number, color: string, lit: number) {
  let x = -10;
  while (x < W) {
    const w = 26 + r() * 70;
    const h = H * (0.1 + r() * maxFrac);
    g.fillStyle = color;
    g.fillRect(x, H - h, w, h);
    if (r() < 0.25) g.fillRect(x + w * 0.4, H - h - 14, 3, 14);
    for (let wy = H - h + 8; wy < H - 6; wy += 11) {
      for (let wx = x + 5; wx < x + w - 6; wx += 9) {
        if (r() < lit) {
          const k = r();
          g.fillStyle = k < 0.68 ? 'rgba(255,214,140,0.9)' : k < 0.84 ? 'rgba(255,140,200,0.85)' : 'rgba(140,220,255,0.85)';
          g.fillRect(wx, wy, 4, 5);
        }
      }
    }
    x += w + r() * 8;
  }
}

export function skyTexture(mood: Mood) {
  const W = 1024;
  const H = 300;
  const [c, g] = canvas(W, H);
  const r = rng(11);
  const grad = g.createLinearGradient(0, 0, 0, H);
  if (mood === 'dusk') {
    grad.addColorStop(0, '#24185A');
    grad.addColorStop(0.42, '#6D3A8C');
    grad.addColorStop(0.75, '#E9758C');
    grad.addColorStop(1, '#FFC07A');
  } else if (mood === 'night') {
    grad.addColorStop(0, '#060515');
    grad.addColorStop(0.6, '#171140');
    grad.addColorStop(1, '#33256A');
  } else {
    grad.addColorStop(0, '#111733');
    grad.addColorStop(0.6, '#233058');
    grad.addColorStop(1, '#3B4775');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const stars = mood === 'night' ? 190 : mood === 'dusk' ? 60 : 0;
  for (let i = 0; i < stars; i++) {
    g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.65})`;
    const big = r() < 0.12;
    g.fillRect(r() * W, r() * H * 0.55, big ? 2 : 1, big ? 2 : 1);
  }
  if (mood === 'dusk') {
    const sg = g.createRadialGradient(700, 270, 8, 700, 270, 210);
    sg.addColorStop(0, 'rgba(255,220,160,0.95)');
    sg.addColorStop(1, 'rgba(255,150,120,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);
  }
  if (mood !== 'rain') {
    // moon
    g.fillStyle = mood === 'night' ? 'rgba(255,240,220,0.95)' : 'rgba(255,236,230,0.85)';
    g.beginPath();
    g.arc(210, 62, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = mood === 'night' ? '#0b0920' : '#2a1b5c';
    g.beginPath();
    g.arc(219, 56, 18, 0, Math.PI * 2);
    g.fill();
  }
  skyline(g, r, W, H, 0.55, mood === 'dusk' ? '#3E2860' : mood === 'night' ? '#15102E' : '#1E2445', 0.12);
  skyline(g, r, W, H, 0.38, mood === 'dusk' ? '#211539' : mood === 'night' ? '#0A0817' : '#111630', mood === 'dusk' ? 0.22 : 0.34);
  return finish(c);
}

export function rainTexture() {
  const [c, g] = canvas(256, 256);
  const r = rng(5);
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const len = 10 + r() * 22;
    g.strokeStyle = `rgba(200,220,255,${0.18 + r() * 0.3})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - len * 0.18, y + len);
    g.stroke();
  }
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1.2);
  return t;
}

export function plankTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(3);
  const tones = ['#2E2650', '#2A2349', '#322A57', '#28214A', '#2F2853'];
  const ph = 64;
  for (let y = 0; y < 512; y += ph) {
    let x = -Math.floor(r() * 200);
    while (x < 512) {
      const w = 160 + r() * 220;
      g.fillStyle = tones[Math.floor(r() * tones.length)];
      g.fillRect(x, y, w, ph);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(255,255,255,${0.012 + r() * 0.02})`;
        g.fillRect(x, y + r() * ph, w, 1);
      }
      g.fillStyle = 'rgba(10,8,24,0.55)';
      g.fillRect(x, y, 2, ph);
      x += w;
    }
    g.fillStyle = 'rgba(10,8,24,0.6)';
    g.fillRect(0, y, 512, 2);
  }
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}

// Screen contents: scrolling "code" for working agents, an alert for agents
// that need you, a sleepy moon for idle ones.
export function codeTexture() {
  const [c, g] = canvas(256, 512);
  const r = rng(9);
  g.fillStyle = '#120D24';
  g.fillRect(0, 0, 256, 512);
  // code on the screens in the caption pastels (no neon)
  const cols = ['#f2b483', '#ec8fb6', '#7fb8e8', '#b8a4ef', '#93cf9b', '#f6f1e4'];
  let indent = 0;
  for (let y = 10; y < 505; y += 13) {
    if (r() < 0.12) continue;
    indent = Math.max(0, Math.min(5, indent + (r() < 0.3 ? 1 : r() < 0.3 ? -1 : 0)));
    let x = 12 + indent * 14;
    const parts = 1 + Math.floor(r() * 4);
    for (let p = 0; p < parts && x < 240; p++) {
      const w = 14 + r() * 60;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.globalAlpha = 0.75 + r() * 0.25;
      g.fillRect(x, y, Math.min(w, 244 - x), 6);
      x += w + 6;
    }
    g.globalAlpha = 1;
  }
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 0.45);
  return t;
}

export function alertTexture() {
  const [c, g] = canvas(256, 160);
  const grad = g.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, '#2A2208');
  grad.addColorStop(1, '#4A3C0C');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#FFD84A';
  g.font = 'bold 96px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 128, 84);
  g.strokeStyle = 'rgba(255,216,74,0.6)';
  g.lineWidth = 4;
  g.strokeRect(10, 10, 236, 140);
  return finish(c);
}

export function sleepTexture() {
  const [c, g] = canvas(256, 160);
  g.fillStyle = '#17112E';
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = 'rgba(185,166,255,0.9)';
  g.beginPath();
  g.arc(108, 80, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#17112E';
  g.beginPath();
  g.arc(120, 70, 24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(185,166,255,0.7)';
  g.font = '600 26px system-ui, sans-serif';
  g.fillText('z', 150, 66);
  g.font = '600 18px system-ui, sans-serif';
  g.fillText('z', 172, 50);
  return finish(c);
}
