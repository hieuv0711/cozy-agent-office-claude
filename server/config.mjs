import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HOME = os.homedir();

function expand(p) {
  return path.resolve(String(p).trim().replace(/^~(?=$|\/)/, HOME));
}

// Claude Code config folders to read. ~/.claude always; more via CLAUDE_CONFIG_DIR
// or AGENT_OFFICE_CLAUDE_DIRS=/path/one,/path/two (one per login).
export const ROOTS = [
  ...new Set(
    [path.join(HOME, '.claude'), process.env.CLAUDE_CONFIG_DIR, ...(process.env.AGENT_OFFICE_CLAUDE_DIRS || '').split(',')]
      .filter((p) => p && String(p).trim())
      .map(expand),
  ),
].filter((p) => fs.existsSync(path.join(p, 'projects')));

// Our own data (cached summaries that outlive Claude Code's transcript cleanup).
export const DATA_DIR = expand(process.env.AGENT_OFFICE_HOME || path.join(HOME, '.agent-office'));
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
// 11: a prompt's mark carries its words, so a long session's oldest requests can be named
// 12: and no prompt is dropped when a long session has too many marks to draw
export const CACHE_VERSION = 12;

export const PORT = Number(process.env.AGENT_OFFICE_PORT || process.env.PORT || 4777);
export const HOST = '127.0.0.1';

export const LIVE_POLL_MS = 1000;
// A transcript being written right now, with no live-session entry, counts as a headless run
// (claude -p, Agent SDK)...
export const HEADLESS_ACTIVE_MS = 30_000;
// ...and leaves the office after this much quiet.
export const HEADLESS_LEAVE_MS = 10 * 60_000;
