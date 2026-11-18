#!/usr/bin/env node
// npx cozy-agent-office-claude: the Agent Office server, then the browser.
// Reads Claude Code's own files on this computer, installs nothing into Claude
// Code, and serves on 127.0.0.1 only.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);

const HELP = `Agent Office ${pkg.version}
Your Claude Code sessions as little people at work in a cozy 3D room, in your browser.

Usage: npx ${pkg.name} [options]

Options:
  -p, --port <number>  Port on 127.0.0.1 (default 4777, or AGENT_OFFICE_PORT)
      --no-open        Don't open the browser
  -v, --version        Print the version
  -h, --help           Print this help

It reads ~/.claude (more folders: CLAUDE_CONFIG_DIR, AGENT_OFFICE_CLAUDE_DIRS)
and keeps its own notes in ~/.agent-office (AGENT_OFFICE_HOME). Press Ctrl+C to stop.`;

const fail = (msg) => {
  console.error(`${msg}\nTry: npx ${pkg.name} --help`);
  process.exit(2);
};

let open = true;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') {
    console.log(HELP);
    process.exit(0);
  } else if (a === '-v' || a === '--version') {
    console.log(pkg.version);
    process.exit(0);
  } else if (a === '--no-open') {
    open = false;
  } else if (a === '--open') {
    open = true;
  } else if (a === '-p' || a === '--port' || a.startsWith('--port=')) {
    const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[++i];
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 65535) fail(`The port must be a whole number from 1 to 65535 (got "${v ?? ''}").`);
    process.env.AGENT_OFFICE_PORT = String(n);
  } else {
    fail(`Unknown option: ${a}`);
  }
}

// the server reads its settings from the environment and its flags from argv
process.argv = [process.argv[0], process.argv[1], ...(open ? ['--open'] : [])];
await import('../server/index.mjs');
