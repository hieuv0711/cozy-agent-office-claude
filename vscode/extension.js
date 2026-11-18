// Agent Office for VS Code and Cursor: the room in the bottom panel (and in an
// editor tab), drawn by the same Agent Office web app, served by its own small
// server on 127.0.0.1. The server reads Claude Code's files on this computer
// and installs nothing into Claude Code. It starts when the room is first
// shown and stops with the editor.
'use strict';

const vscode = require('vscode');
const cp = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

let log;
/** The running server: its process and port (one per editor window). */
let server = null;
/** A start in progress, shared by everyone who asks meanwhile. */
let starting = null;

function activate(context) {
  log = vscode.window.createOutputChannel('Agent Office');
  context.subscriptions.push(log);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'agentOffice.room',
      {
        resolveWebviewView(view) {
          show(context, view.webview, 'panel');
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.commands.registerCommand('agentOffice.open', () => {
      const panel = vscode.window.createWebviewPanel('agentOffice.tab', 'Agent Office', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
      show(context, panel.webview, 'tab');
    }),
    vscode.commands.registerCommand('agentOffice.openInBrowser', async () => {
      try {
        const port = await ensureServer(context);
        await vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${port}/`));
      } catch (e) {
        failed(e);
      }
    }),
    { dispose: stop },
  );
}

function deactivate() {
  stop();
}

/**
 * Fills a webview with the room: a word while the server starts, then the page itself. The bottom
 * panel ('panel') opens on the room alone, sized for a short pane; an editor tab ('tab') on the
 * whole app. Either can switch in the page.
 */
async function show(context, webview, mode) {
  webview.options = { enableScripts: true };
  webview.html = page('<p class="note">Opening the room…</p>');
  try {
    const port = await ensureServer(context);
    webview.options = { enableScripts: true, portMapping: [{ webviewPort: port, extensionHostPort: port }] };
    webview.html = page(`<iframe src="http://127.0.0.1:${port}/?embed=${mode}" title="Agent Office" allow="autoplay; clipboard-write; fullscreen"></iframe>`, port);
  } catch (e) {
    webview.html = page(`<p class="note">${escapeHtml(e.message || String(e))}</p>`);
    failed(e);
  }
}

function page(body, port) {
  const frame = port ? ` frame-src http://127.0.0.1:${port};` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';${frame}">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0e1018; color: #dcd6c8; font: 13px system-ui, sans-serif; }
  iframe { display: block; border: 0; width: 100%; height: 100%; }
  .note { margin: 16px; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function failed(e) {
  log.appendLine(String(e && e.stack ? e.stack : e));
  vscode.window.showErrorMessage(`Agent Office: ${e.message || e}`, 'Show log').then((pick) => pick && log.show());
}

/** A free port on 127.0.0.1, or the one set in the settings. */
function pickPort() {
  const set = vscode.workspace.getConfiguration('agentOffice').get('port') || 0;
  if (set > 0) return Promise.resolve(set);
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Answers once the server serves the page. */
function ready(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/meta', timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function ensureServer(context) {
  if (server && server.proc.exitCode === null) return Promise.resolve(server.port);
  if (starting) return starting;
  starting = (async () => {
    try {
      return await start(context);
    } finally {
      starting = null;
    }
  })();
  return starting;
}

/** Starts the server on a free port and waits until it answers (or says why it stopped). */
async function start(context) {
  const port = await pickPort();
  const script = path.join(context.extensionPath, 'app', 'server', 'index.mjs');
  log.appendLine(`Starting the room's server on 127.0.0.1:${port}`);
  // the editor's own Node runs it; the page may be shown in this editor's panels
  const proc = cp.fork(script, [], {
    env: { ...process.env, AGENT_OFFICE_PORT: String(port), AGENT_OFFICE_EMBED: 'vscode', ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let last = '';
  const take = (buf) => {
    const text = buf.toString();
    log.append(text);
    const lines = text.trim().split('\n');
    last = lines[lines.length - 1] || last;
  };
  proc.stdout.on('data', take);
  proc.stderr.on('data', take);
  proc.on('exit', (code) => {
    log.appendLine(`The room's server stopped (${code}).`);
    if (server && server.proc === proc) server = null;
  });
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) throw new Error(last || `the room's server stopped (${proc.exitCode})`);
    if (await ready(port)) {
      server = { proc, port };
      return port;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  proc.kill();
  throw new Error("The room's server didn't start in time. See the Agent Office log.");
}

function stop() {
  if (server) {
    server.proc.kill();
    server = null;
  }
}

module.exports = { activate, deactivate };
