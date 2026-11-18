// Usage: node scripts/inline-html.mjs <built.html> <out.html>
// Folds a Vite-built page's scripts and stylesheets into the HTML itself, so
// the result is one file that opens straight from disk (file://), offline.
import fs from 'node:fs';
import path from 'node:path';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node scripts/inline-html.mjs <built.html> <out.html>');
  process.exit(1);
}
const dir = path.dirname(src);
let html = fs.readFileSync(src, 'utf8');

// A "</script" inside the code would end the script element early; "<\/" means
// the same thing to JavaScript in strings and regexes. "<!--" can switch the
// HTML parser into a different state, and has no blind fix, so refuse it.
const safe = (code) => {
  if (code.includes('<!--')) {
    console.error('the bundle contains "<!--", which is unsafe to inline; aborting');
    process.exit(1);
  }
  return code.replace(/<\/script/gi, '<\\/script');
};

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, file) => `<script type="module">${safe(fs.readFileSync(path.join(dir, file), 'utf8'))}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, file) => `<style>${fs.readFileSync(path.join(dir, file), 'utf8')}</style>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

const left = html.match(/<(script|link)[^>]+(src|href)="\.?\/?assets\/[^"]+"/g);
if (left) {
  console.error('still references external assets:', left);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
