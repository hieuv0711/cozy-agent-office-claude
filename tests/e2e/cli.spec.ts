import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from './support/fixtures';

// SH-09: `npx cozy-agent-office-claude` (bin/agent-office.mjs). Its options, a
// server on a port of its own, and the mode the VS Code / Cursor extension
// starts it in (its page may be shown inside the editor's panel). The servers
// here keep their notes in a folder of their own, so the real one is untouched,
// and are stopped by their own process.

const BIN = path.resolve('bin/agent-office.mjs');

function run(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; out: string }>((resolve) => {
    const p = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('exit', (code) => resolve({ code, out }));
  });
}

async function serve(port: number, env: Record<string, string>, fn: (base: string) => Promise<void>) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-cli-'));
  const p = spawn(process.execPath, [BIN, '--port', String(port), '--no-open'], { env: { ...process.env, AGENT_OFFICE_HOME: home, ...env } });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  try {
    await expect.poll(() => out, { message: 'it says where it serves', timeout: 20_000 }).toContain(`http://127.0.0.1:${port}/`);
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    p.kill();
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('SH-09 npx: options, a port of its own, and the editor panel mode', async ({ request }) => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { name: string; version: string; bin: Record<string, string> };
  expect(pkg.bin[pkg.name], 'npx runs the command named after the package').toBe('bin/agent-office.mjs');
  // the options
  const version = await run(['--version']);
  expect(version).toEqual({ code: 0, out: `${pkg.version}\n` });
  const help = await run(['--help']);
  expect(help.code).toBe(0);
  expect(help.out).toContain(`Usage: npx ${pkg.name} [options]`);
  expect(help.out).toContain('--no-open');
  const bad = await run(['--port', 'nope']);
  expect(bad.code).toBe(2);
  expect(bad.out).toContain('The port must be a whole number from 1 to 65535');
  expect((await run(['--frobnicate'])).out).toContain('Unknown option: --frobnicate');

  // its own port; a page that is only ever its own page
  await serve(4791, {}, async (base) => {
    const meta = await (await request.get(`${base}/api/meta`)).json();
    expect(meta).toMatchObject({ name: pkg.name, version: pkg.version });
    const page = await request.get(`${base}/`);
    expect(page.status()).toBe(200);
    expect(page.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(page.headers()['x-frame-options']).toBe('DENY');
  });
  // started by the editor extension: its panel may show the page
  await serve(4792, { AGENT_OFFICE_EMBED: 'vscode' }, async (base) => {
    const page = await request.get(`${base}/`);
    expect(page.headers()['content-security-policy']).toContain('frame-ancestors vscode-webview:');
    expect(page.headers()['x-frame-options']).toBeUndefined();
    // and still lets only YouTube's and Spotify's players in
    expect(page.headers()['content-security-policy']).toContain('frame-src https://www.youtube-nocookie.com https://open.spotify.com');
  });
});
