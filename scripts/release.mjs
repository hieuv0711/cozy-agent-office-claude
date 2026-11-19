// Release helpers (CONTRIBUTING.md, "Releasing").
//
//   npm run bump -- 0.2.0
//     Sets the version in package.json, package-lock.json and vscode/package.json, and starts a
//     "## 0.2.0" section in CHANGELOG.md for the notes.
//
//   node scripts/release.mjs check v0.2.0
//     For the release workflow: checks that the tag matches all three files, and that
//     CHANGELOG.md has notes for the version. Prints those notes, which become the GitHub release's
//     text. Exits 1 if anything doesn't match.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const write = (p, text) => writeFileSync(path.join(root, p), text);
// The Marketplace takes major.minor.patch only: no pre-release tags
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

/** The notes under "## <version>" in CHANGELOG.md, up to the next "## " heading; null if missing. */
function notes(version) {
  const lines = read('CHANGELOG.md').split('\n');
  const start = lines.findIndex((l) => l === `## ${version}` || l.startsWith(`## ${version} `));
  if (start < 0) return null;
  const next = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines
    .slice(start + 1, next < 0 ? lines.length : next)
    .join('\n')
    .trim();
}

/** Replaces the first `"version": "…"` in a package.json, keeping the rest of the file as it is. */
function setVersion(file, version) {
  const text = read(file);
  const next = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  if (next === text && !text.includes(`"version": "${version}"`)) fail(`No "version" field in ${file}.`);
  write(file, next);
}

const versions = () => {
  const lock = JSON.parse(read('package-lock.json'));
  return {
    'package.json': JSON.parse(read('package.json')).version,
    'package-lock.json': lock.version,
    'package-lock.json (packages[""])': lock.packages?.['']?.version,
    'vscode/package.json': JSON.parse(read('vscode/package.json')).version,
  };
};

const [cmd, arg = ''] = process.argv.slice(2);

if (cmd === 'bump') {
  const version = arg.replace(/^v/, '');
  if (!SEMVER.test(version)) fail(`Give the new version as major.minor.patch, like 0.2.0 (got "${arg}").`);
  const before = JSON.parse(read('package.json')).version;
  setVersion('package.json', version);
  setVersion('vscode/package.json', version);
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
  if (notes(version) === null) {
    const changelog = read('CHANGELOG.md');
    const at = changelog.indexOf('\n## ') + 1; // the newest section's heading, or 0 if there is none
    const section = `## ${version} (${new Date().toISOString().slice(0, 10)})\n\n- \n`;
    write('CHANGELOG.md', at > 0 ? `${changelog.slice(0, at)}${section}\n${changelog.slice(at)}` : `${changelog.trimEnd()}\n\n${section}`);
  }
  console.log(`${before} -> ${version} in package.json, package-lock.json and vscode/package.json.`);
  console.log(`Write what changed under "## ${version}" in CHANGELOG.md, then open a pull request.`);
} else if (cmd === 'check') {
  const version = arg.replace(/^refs\/tags\//, '').replace(/^v/, '');
  if (!SEMVER.test(version)) fail(`Release tags look like v0.2.0 (got "${arg}").`);
  const wrong = Object.entries(versions()).filter(([, v]) => v !== version);
  if (wrong.length) fail(`The tag says ${version}, but ${wrong.map(([f, v]) => `${f} says ${v}`).join(', ')}. Run npm run bump -- ${version} in a pull request first.`);
  const text = notes(version);
  if (!text || /^-\s*$/.test(text)) fail(`CHANGELOG.md has no notes under "## ${version}".`);
  // GitHub shows every line break in a release's text, so join each wrapped line onto its bullet
  process.stdout.write(`${text.replace(/\n[ \t]+(?=\S)/g, ' ')}\n`);
} else {
  fail('Usage: node scripts/release.mjs bump <version> | check <tag>');
}
