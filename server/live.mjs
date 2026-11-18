import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { HEADLESS_ACTIVE_MS, HEADLESS_LEAVE_MS, LIVE_POLL_MS, ROOTS } from './config.mjs';
import { clip, median, projectName } from './model.mjs';
import { contextWindow, prettyModel } from './pricing.mjs';

// Claude Code keeps one small JSON file per running process in
// <config>/sessions/<pid>.json (pid, sessionId, cwd, name, status busy|idle|
// waiting|shell, waitingFor). Undocumented, but it gives live status without
// installing hooks. We only read the <pid>.json files, never the .key files.
async function readRegistry() {
  const out = [];
  for (const root of ROOTS) {
    const dir = path.join(root, 'sessions');
    let names = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (!/^\d+\.json$/.test(n)) continue;
      try {
        const j = JSON.parse(await fs.promises.readFile(path.join(dir, n), 'utf8'));
        if (j && j.sessionId && Number.isInteger(j.pid)) out.push({ ...j, root });
      } catch {
        // being rewritten; next tick
      }
    }
  }
  return out;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function psComm(pids) {
  return new Promise((resolve) => {
    if (!pids.length) return resolve(new Map());
    execFile('ps', ['-o', 'pid=,comm=', '-p', pids.join(',')], { timeout: 3000 }, (err, stdout) => {
      const m = new Map();
      if (stdout) {
        for (const line of String(stdout).split('\n')) {
          const mm = /^\s*(\d+)\s+(.+)$/.exec(line);
          if (mm) m.set(Number(mm[1]), mm[2].trim());
        }
      }
      resolve(err && !m.size ? null : m);
    });
  });
}

function officeStatus(reg, s) {
  const main = s.main;
  const asking = [...main.pending.values()].some((e) => e.cat === 'ask');
  if (reg) {
    if (reg.status === 'waiting' || reg.waitingFor) return 'needs-you';
    if (asking) return 'needs-you';
    if (reg.status === 'busy' || reg.status === 'shell') return 'working';
    if (reg.status === 'idle') return 'idle';
  }
  if (asking) return 'needs-you';
  if (main.pending.size) return 'working';
  if (Date.now() - main.lastTs < 30_000 && main.lastStop !== 'end_turn') return 'working';
  return 'idle';
}

export class Live {
  constructor(store) {
    this.store = store;
    this.entries = new Map();
    this.registered = new Set();
    this.comm = new Map();
    this.lastPs = 0;
    this.lastHeadless = 0;
    this.headless = new Set();
    this.snapshot = { now: Date.now(), sessions: [], totals: { working: 0, needsYou: 0, idle: 0, bots: 0 } };
    this.json = '';
    this.clients = new Set();
    this.busy = false;
  }

  isLiveId(id) {
    return this.entries.has(id);
  }

  entry(id) {
    return this.snapshot.sessions.find((s) => s.id === id) || null;
  }

  start() {
    const loop = async () => {
      if (!this.busy) {
        this.busy = true;
        try {
          await this.tick();
        } catch (e) {
          console.warn('[live]', e.message);
        } finally {
          this.busy = false;
        }
      }
      setTimeout(loop, LIVE_POLL_MS);
    };
    loop();
    setInterval(() => {
      for (const c of this.clients) c.write(': ping\n\n');
    }, 15000).unref();
  }

  async verifyPids(regs) {
    if (Date.now() - this.lastPs < 5000) return;
    this.lastPs = Date.now();
    const m = await psComm([...new Set(regs.map((r) => r.pid))]);
    if (m) this.comm = m;
  }

  alive(pid) {
    if (!pidAlive(pid)) return false;
    // pid reuse guard: if ps last saw this pid running something else, it is not Claude Code
    const c = this.comm.get(pid);
    return c === undefined || /claude|node|bun|deno/i.test(c);
  }

  async tick() {
    const regs = await readRegistry();
    await this.verifyPids(regs);
    const live = new Map();
    const dead = new Set();
    for (const r of regs) {
      if (!this.alive(r.pid)) {
        dead.add(r.sessionId);
        continue;
      }
      this.registered.add(r.sessionId);
      const prev = live.get(r.sessionId);
      if (!prev || (r.updatedAt || 0) > (prev.updatedAt || 0)) live.set(r.sessionId, r);
    }
    // Headless runs (claude -p, SDK): a transcript that is changing and never
    // had a live-session entry. They leave after 10 quiet minutes.
    if (Date.now() - this.lastHeadless > 5000) {
      this.lastHeadless = Date.now();
      await this.store.scanFiles(true);
      const next = new Set();
      for (const f of this.store.files.values()) {
        if (live.has(f.id) || dead.has(f.id) || this.registered.has(f.id)) continue;
        const age = Date.now() - f.mtimeMs;
        if (age < HEADLESS_ACTIVE_MS || (this.headless.has(f.id) && age < HEADLESS_LEAVE_MS)) next.add(f.id);
      }
      this.headless = next;
    }
    const ids = [...live.keys(), ...[...this.headless].filter((id) => !live.has(id))];
    this.store.pinned = new Set(ids);
    const sessions = [];
    for (const id of ids) {
      const e = await this.build(id, live.get(id) || null);
      if (e) {
        e.num = this.store.numberOf(id);
        sessions.push(e);
      }
    }
    this.entries = new Map(sessions.map((s) => [s.id, s]));
    sessions.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    const totals = { working: 0, needsYou: 0, idle: 0, bots: 0 };
    for (const s of sessions) {
      if (s.status === 'working') totals.working++;
      else if (s.status === 'needs-you') totals.needsYou++;
      else totals.idle++;
      totals.bots += s.subsRunning;
    }
    const snap = { sessions, totals };
    const json = JSON.stringify(snap);
    if (json !== this.json) {
      this.json = json;
      this.snapshot = { now: Date.now(), ...snap };
      this.broadcast('office', this.snapshot);
    }
  }

  async build(id, reg) {
    let s;
    try {
      s = await this.store.get(id, { live: true });
    } catch (e) {
      console.warn(`[live] ${id}: ${e.message}`);
      return null;
    }
    if (!s) return null;
    const main = s.main;
    const status = officeStatus(reg, s);
    const subs = [];
    let subsRunning = 0;
    let subCost = 0;
    let lastActivity = main.lastTs;
    for (const a of s.subs.values()) {
      subCost += a.cost().usd;
      if (a.lastTs > lastActivity) lastActivity = a.lastTs;
      const st = s.subStatus(a, true);
      if (st === 'running') subsRunning++;
      const recent = Date.now() - (a.lastTs || 0) < 90_000;
      if (st === 'running' || st === 'idle' || recent) {
        const info = s.agentInfo(a, true);
        subs.push({ id: a.id, kind: a.kind, type: info.type, name: info.name, desc: info.desc, status: st, now: info.now, runId: a.runId, phase: info.phase, color: info.color, startedAt: info.startedAt, toolCalls: a.toolCalls });
      }
    }
    subs.sort((x, y) => (x.status === 'running' ? 0 : 1) - (y.status === 'running' ? 0 : 1) || x.startedAt - y.startedAt);
    const workflows = [...s.workflows.values()].map((w) => s.workflowInfo(w, true)).filter((w) => w.status === 'running');
    // typical times in this session, for the captions' karaoke fill
    const helperDurs = [];
    for (const a of s.subs.values()) {
      const st = s.subStatus(a, true);
      if ((st === 'done' || st === 'failed') && a.firstTs && a.lastTs > a.firstTs) helperDurs.push(a.lastTs - a.firstTs);
    }
    const window = contextWindow(main.model, main.requestedModel);
    return {
      id,
      pid: reg?.pid || null,
      name: reg?.name || projectName(main.cwd, s.file),
      nameSource: reg?.nameSource || '',
      title: s.title,
      cwd: main.cwd || reg?.cwd || '',
      project: projectName(main.cwd || reg?.cwd, s.file),
      branch: main.branch,
      model: prettyModel(main.model),
      status,
      rawStatus: reg?.status || (reg ? '' : 'headless'),
      waitingFor: reg?.waitingFor || '',
      statusSince: reg?.statusUpdatedAt || main.lastTs,
      startedAt: reg?.startedAt || main.firstTs,
      lastActivity,
      now: status !== 'idle' ? main.now() : null,
      lastPrompt: clip(main.lastPrompt || s.lastPromptRec, 240),
      ctx: { tokens: main.ctx, window, pct: window ? Math.min(100, (main.ctx / window) * 100) : 0 },
      tokens: main.tokens(),
      cost: main.cost().usd,
      subCost,
      toolCalls: main.toolCalls,
      subsRunning,
      subsTotal: s.subs.size,
      thinkMs: median(main.durs.get('think')),
      helperMs: median(helperDurs.slice(-15)),
      subs: subs.slice(0, 40),
      workflows,
      headless: !reg,
      rev: s.rev,
      version: reg?.version || main.version,
    };
  }

  // ---------- server-sent events ----------

  sse(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    res.write(`event: office\ndata: ${JSON.stringify(this.snapshot)}\n\n`);
    this.clients.add(res);
    req.on('close', () => this.clients.delete(res));
  }

  broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.clients) c.write(msg);
  }
}
