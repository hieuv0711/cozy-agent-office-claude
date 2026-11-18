import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Builds web/kitchen.html as one bundle with no code splitting, so
// scripts/inline-html.mjs can fold it into a single self-contained HTML file.

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../node_modules/.cache/standalone', import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: fileURLToPath(new URL('kitchen.html', import.meta.url)),
      output: { inlineDynamicImports: true },
    },
  },
});
