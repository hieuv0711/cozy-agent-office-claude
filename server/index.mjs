#!/usr/bin/env node
// Agent Office server: reads Claude Code's local files, serves the 3D office.
// Read-only, localhost only, no hooks, no network calls.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_VERSION, DATA_DIR, HOST, PORT, ROOTS } from './config.mjs';
import { Live } from './live.mjs';
import { dayStart, isSessionId, Store } from './store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');
const pkg = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', 'package.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// AGENT_OFFICE_EMBED=vscode: started by the editor extension, which shows the page in its panel
const EMBED = process.env.AGENT_OFFICE_EMBED === 'vscode';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  // the only outside content: opt-in music players, YouTube's or Spotify's, when you paste a link
  'frame-src https://www.youtube-nocookie.com https://open.spotify.com',
  // shown only as its own page; started by the VS Code / Cursor extension, inside its panel too
  // (every ancestor must match: the panel's webview, and the editor window that holds it)
  EMBED ? 'frame-ancestors vscode-webview: vscode-file:' : "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

if (!ROOTS.length) {
  console.error('No Claude Code data found (looked for ~/.claude/projects). Set CLAUDE_CONFIG_DIR if yours lives elsewhere.');
  process.exit(1);
}

const store = new Store();
// Session numbers must be loaded before the live view hands out new ones; on the
// very first run, number the existing history oldest-first.
if (await store.loadNumbers()) await store.allSummaries().catch(() => {});
const live = new Live(store);
const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]);

function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
  res.end(body);
}

function json(res, data) {
  send(res, 200, JSON.stringify(data), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
}

// Dates come as epoch ms or YYYY-MM-DD (local day; `end` = end of that day).
function dateParam(v, end = false) {
  if (!v) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dayStart(v) + (end ? 86_400_000 - 1 : 0);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function listParam(v) {
  return String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function num(v, def, min = -Infinity, max = Infinity) {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== '' ? Math.min(max, Math.max(min, n)) : def;
}

async function sessionDetail(id, q) {
  const opts = {
    events: num(q.get('events'), 400, 1, 5000),
    agent: /^[\w-]{1,80}$/.test(q.get('agent') || '') ? q.get('agent') : '',
    from: num(q.get('from'), 0, 0),
    to: num(q.get('to'), 0, 0),
  };
  if (live.isLiveId(id)) {
    const s = await store.get(id, { live: true });
    if (!s) return null;
    return { ...s.detail({ ...opts, live: true }), office: live.entry(id) };
  }
  const plain = !opts.agent && !opts.from && !opts.to;
  const f = await store.locate(id);
  if (!f) {
    const c = await store.readCache(id, { anyVersion: true });
    return c?.detail ? { ...c.detail, archived: true } : null;
  }
  if (plain) {
    const c = await store.readCache(id);
    if (c && c.key === store.keyOf(f) && c.detail) return c.detail;
    const built = await store.buildCache(f);
    return built.detail;
  }
  const s = await store.get(id);
  return s ? s.detail({ ...opts, live: false }) : null;
}

async function serveStatic(pathname, req, res) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'bad path');
  }
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(DIST, '.' + rel);
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return send(res, 403, 'forbidden');
  let target = file;
  let st = null;
  try {
    st = await fs.promises.stat(target);
  } catch {
    st = null;
  }
  if (!st || !st.isFile()) {
    if (path.extname(rel)) return send(res, 404, 'not found');
    target = path.join(DIST, 'index.html');
    try {
      st = await fs.promises.stat(target);
    } catch {
      return send(
        res,
        503,
        '<!doctype html><meta charset="utf-8"><title>Agent Office</title><body style="font:16px system-ui;background:#100D1C;color:#F4F0FF;padding:40px">' +
          '<h1>Agent Office is running, but the web app is not built.</h1><p>Run <code>npm install</code> then <code>npm run build</code> in the project folder, and reload.</p>',
        'text/html; charset=utf-8',
      );
    }
  }
  const ext = path.extname(target);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  if (ext === '.html') {
    headers['Content-Security-Policy'] = CSP;
    if (!EMBED) headers['X-Frame-Options'] = 'DENY';
  }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(target).pipe(res);
}

function problem(res, code, error) {
  send(res, code, JSON.stringify({ error }), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
}

// The one endpoint that does something: bring a live session's Terminal tab to
// the front. Same-origin JSON only, a tiny body, a pid that belongs to a live
// session with a terminal, and a tty that must look like ttysNNN before it goes
// anywhere near AppleScript. Nothing is written to disk.
async function focusTerminal(req, res) {
  const origin = String(req.headers.origin || '');
  if (![...allowedHosts].some((h) => origin === `http://${h}`)) return problem(res, 403, 'Forbidden origin');
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return problem(res, 403, 'Forbidden site');
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return problem(res, 415, 'JSON only');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024) return problem(res, 413, 'Body too large');
  }
  let pid;
  try {
    pid = JSON.parse(raw).pid;
  } catch {
    return problem(res, 400, 'Bad JSON');
  }
  if (!Number.isInteger(pid) || pid <= 1) return problem(res, 400, 'Bad pid');
  const s = live.snapshot.sessions.find((x) => x.pid === pid);
  if (!s) return problem(res, 404, 'No live session with that pid');
  if (s.headless) return problem(res, 409, 'This session runs without a terminal');
  if (process.platform !== 'darwin') return problem(res, 501, 'Only on macOS for now');
  const tty = await new Promise((resolve) => execFile('ps', ['-o', 'tty=', '-p', String(pid)], { timeout: 3000 }, (e, out) => resolve(e ? '' : String(out).trim())));
  if (!/^ttys\d{1,4}$/.test(tty)) return problem(res, 409, 'This session has no terminal tab');
  const script = [
    'tell application "Terminal"',
    '  repeat with w in windows',
    '    repeat with t in tabs of w',
    `      if tty of t is "/dev/${tty}" then`,
    '        set selected of t to true',
    '        set index of w to 1',
    '        activate',
    '        return "ok"',
    '      end if',
    '    end repeat',
    '  end repeat',
    '  return "missing"',
    'end tell',
  ].join('\n');
  const out = await new Promise((resolve) =>
    execFile('osascript', ['-e', script], { timeout: 8000 }, (e, o, err) => resolve(e ? { error: String(err || e.message).trim() } : { result: String(o).trim() })),
  );
  if (out.error) {
    const denied = /not authori[sz]ed|-1743/i.test(out.error);
    return problem(res, denied ? 403 : 502, denied ? 'macOS blocked it: allow Agent Office (node) to control Terminal in System Settings > Privacy & Security > Automation' : `Terminal did not answer: ${out.error.slice(0, 200)}`);
  }
  if (out.result !== 'ok') return problem(res, 404, `No Terminal tab on ${tty} (is the session in another terminal app?)`);
  return json(res, { ok: true, tty });
}

async function route(req, res) {
  // DNS-rebinding guard: only answer to our own loopback host names.
  if (!allowedHosts.has(String(req.headers.host || '').toLowerCase())) return send(res, 403, 'Forbidden host');
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname;
  if (req.method === 'POST' && p === '/api/focus') return focusTerminal(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'GET only', 'text/plain', { Allow: 'GET, HEAD' });
  if (p === '/api/office') return json(res, live.snapshot);
  if (p === '/api/stream') return live.sse(req, res);
  if (p === '/api/history') {
    const q = u.searchParams;
    return json(
      res,
      await store.history({
        q: (q.get('q') || '').slice(0, 300),
        limit: num(q.get('limit'), 400, 1, 5000),
        offset: num(q.get('offset'), 0, 0, 1e6),
        isLive: (id) => live.isLiveId(id),
        empty: q.get('empty') === '1',
        from: dateParam(q.get('from')),
        to: dateParam(q.get('to'), true),
        projects: listParam(q.get('projects')),
        models: listParam(q.get('models')),
        status: listParam(q.get('status')).filter((x) => ['live', 'ended', 'kept'].includes(x)),
        sort: ['recent', 'cost', 'tokens', 'duration', 'tools'].includes(q.get('sort')) ? q.get('sort') : 'recent',
        problems: q.get('problems') === '1',
      }),
    );
  }
  if (p === '/api/recap') {
    const now = Date.now();
    const from = dateParam(u.searchParams.get('from')) || now - 7 * 86_400_000;
    const to = dateParam(u.searchParams.get('to'), true) || now;
    return json(res, await store.recap({ from, to, isLive: (id) => live.isLiveId(id) }));
  }
  // what one model did in a period (Recap's cost by model, opened)
  if (p === '/api/recap/model') {
    const now = Date.now();
    const model = (u.searchParams.get('model') || '').slice(0, 80);
    if (!model) return send(res, 400, 'model is required');
    const from = dateParam(u.searchParams.get('from')) || now - 7 * 86_400_000;
    const to = dateParam(u.searchParams.get('to'), true) || now;
    return json(res, await store.modelRecap({ model, from, to, isLive: (id) => live.isLiveId(id) }));
  }
  const m = /^\/api\/session\/([^/]+)$/.exec(p);
  if (m) {
    if (!isSessionId(m[1])) return send(res, 400, 'bad session id');
    const d = await sessionDetail(m[1], u.searchParams);
    return d ? json(res, d) : send(res, 404, 'session not found');
  }
  if (p === '/api/meta') {
    return json(res, { name: pkg.name, version: pkg.version, roots: ROOTS, dataDir: DATA_DIR, cacheVersion: CACHE_VERSION, indexing: store.indexing, now: Date.now() });
  }
  if (p.startsWith('/api/')) return send(res, 404, 'unknown endpoint');
  return serveStatic(p, req, res);
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    console.error('[http]', e);
    if (!res.headersSent) send(res, 500, 'internal error');
    else res.end();
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy. Try another: --port 4778 (or AGENT_OFFICE_PORT=4778)`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`Agent Office  ${url}`);
  console.log(`Reading       ${ROOTS.join(', ')}`);
  console.log(`History cache ${DATA_DIR}`);
  if (process.argv.includes('--open')) openBrowser(url);
});

/** Opens the page in the default browser (macOS, Windows, Linux); without one, the address above is enough. */
function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  execFile(cmd, args, { windowsHide: true }, () => {});
}

live.start();
setTimeout(() => store.indexAll((id) => live.isLiveId(id)), 4000).unref();
setInterval(() => store.indexAll((id) => live.isLiveId(id)), 10 * 60_000).unref();

// started by the editor extension (with a channel back to it): leave with the editor, even if it crashed
if (process.connected) process.on('disconnect', () => process.exit(0));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close();
    process.exit(0);
  });
}
