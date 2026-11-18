import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * A fingerprint of the code that paints and builds the scene's assets (the
 * rooms' textures and geometry, the people's parts). The browser keeps those
 * assets between visits (web/src/lib/assetCache.ts) under this fingerprint, so
 * an update that doesn't touch that code (the panels, the people's routines,
 * the server) keeps them, and the next open doesn't build them all again.
 *
 * Which code: every module that builds or paints an asset (it calls one of the
 * cache's builders), and everything those modules import, followed through
 * relative imports within the scene's code (type-only imports aside), plus
 * the three.js version.
 */
function assetFingerprint(): { hash: string; files: number } {
  const src = join(here, 'src');
  const all: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) all.push(p);
    }
  };
  walk(src);
  const text = new Map(all.map((f) => [f, readFileSync(f, 'utf8')]));
  const builds = /\b(cached|once|tex|meshSDF|beginBuild|keepPicture|takePicture|takeGeometry)\s*[(<]|\b\w+Tex\s*\(/;
  const seen = new Set<string>();
  const queue = all.filter((f) => !f.endsWith('lib/assetCache.ts') && builds.test(text.get(f)!));
  const resolveImport = (from: string, spec: string) => {
    const base = resolve(dirname(from), spec);
    for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (text.has(c)) return c;
    return null;
  };
  // the scene's own code; the sounds, panels and app around it never shape an asset
  const scene = (f: string) => /^(tank|tide|lib)\//.test(relative(src, f)) || relative(src, f) === 'theme.ts';
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of text.get(f)!.matchAll(/^\s*(import|export)\s+(?!type\b)[^;]*?from\s+['"](\.[^'"]+)['"]/gm)) {
      const r = resolveImport(f, m[2]);
      if (r && scene(r) && !seen.has(r)) queue.push(r);
    }
  }
  if (process.env.AO_ASSETS_LIST) console.log([...seen].map((f) => relative(here, f)).sort().join('\n'));
  const h = createHash('sha256');
  for (const f of [...seen].sort()) h.update(relative(here, f)).update('\0').update(text.get(f)!).update('\0');
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { devDependencies?: Record<string, string> };
  h.update(`three@${pkg.devDependencies?.three ?? ''}`);
  return { hash: h.digest('hex').slice(0, 12), files: seen.size };
}

const building = process.env.NODE_ENV === 'production' || process.argv.includes('build');
const assets = building ? assetFingerprint() : { hash: 'dev', files: 0 };
if (building) console.log(`scene assets fingerprint ${assets.hash} (${assets.files} modules)`);

export default defineConfig({
  root: here,
  plugins: [react()],
  // the saved scene assets belong to the code that made them (lib/assetCache)
  define: { __ASSETS__: JSON.stringify(assets.hash) },
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:4777', changeOrigin: true } },
  },
});
