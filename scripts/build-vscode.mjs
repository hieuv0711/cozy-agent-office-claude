// Packs the VS Code / Cursor extension (vscode/): copies the server and the built
// web app next to it, then makes a .vsix with vsce. Build the web app first
// (npm run build). The .vsix lands in the project folder; install it with
// "Extensions: Install from VSIX…", or publish it with vsce / ovsx.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(root, 'vscode');
const app = path.join(ext, 'app');
if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('Build the web app first: npm run build');
  process.exit(1);
}
rmSync(app, { recursive: true, force: true });
mkdirSync(app, { recursive: true });
cpSync(path.join(root, 'server'), path.join(app, 'server'), { recursive: true, filter: (p) => !p.endsWith('selftest.mjs') });
cpSync(path.join(root, 'dist'), path.join(app, 'dist'), { recursive: true });
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
// the server reads its name and version from ../package.json
writeFileSync(path.join(app, 'package.json'), `${JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: 'module' }, null, 2)}\n`);
cpSync(path.join(root, 'LICENSE'), path.join(ext, 'LICENSE'));
const { name, version } = JSON.parse(readFileSync(path.join(ext, 'package.json'), 'utf8'));
// vsce needs a Node that can require() ES modules: 20.19 or newer (22.12 or newer on 22)
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 19) || (major === 22 && minor < 12)) {
  console.error(`vsce needs Node 20.19+ or 22.12+ (this is ${process.versions.node}).`);
  process.exit(1);
}
const out = path.join(root, `${name}-${version}.vsix`);
execFileSync('npx', ['--yes', '@vscode/vsce@3', 'package', '--no-dependencies', '--out', out], { cwd: ext, stdio: 'inherit' });
console.log(`\n${path.relative(root, out)}`);
