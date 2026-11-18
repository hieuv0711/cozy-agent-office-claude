import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, CACHE_VERSION, DATA_DIR, ROOTS } from './config.mjs';
import { readHeadLines, readTailLines } from './jsonl.mjs';
import { clip, one, projectName, promptText, Session, ts } from './model.mjs';
import { prettyModel } from './pricing.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isSessionId(id) {
  return UUID.test(String(id || ''));
}

// Finds session transcripts, keeps a few parsed sessions in memory, and keeps
// a summary + report of every session on disk (~/.agent-office/cache) so the
// history survives restarts and Claude Code's own transcript cleanup.
const NUMBERS_FILE = path.join(DATA_DIR, 'numbers.json');

export class Store {
  constructor() {
    this.files = new Map();
    this.lastScan = 0;
    this.loaded = new Map();
    this.pinned = new Set();
    this.summaries = new Map();
    this.quick = new Map();
    this.cacheIdsMemo = null;
    this.search = new Map();
    this.indexing = { running: false, done: 0, total: 0, current: '' };
  }

  keyOf(f) {
    return `${f.size}:${Math.round(f.mtimeMs)}`;
  }

  async scanFiles(force = false) {
    if (!force && Date.now() - this.lastScan < 4000) return;
    this.lastScan = Date.now();
    const next = new Map();
    for (const root of ROOTS) {
      const pdir = path.join(root, 'projects');
      let dirs = [];
      try {
        dirs = await fs.promises.readdir(pdir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        let names = [];
        try {
          names = await fs.promises.readdir(path.join(pdir, d.name));
        } catch {
          continue;
        }
        for (const n of names) {
          if (!n.endsWith('.jsonl')) continue;
          const id = n.slice(0, -6);
          if (!UUID.test(id)) continue;
          const file = path.join(pdir, d.name, n);
          let st;
          try {
            st = await fs.promises.stat(file);
          } catch {
            continue;
          }
          const prev = next.get(id);
          if (!prev || st.mtimeMs > prev.mtimeMs) next.set(id, { id, file, root, size: st.size, mtimeMs: st.mtimeMs });
        }
      }
    }
    this.files = next;
  }

  async locate(id) {
    if (!this.files.has(id)) await this.scanFiles(true);
    return this.files.get(id) || null;
  }

  // A parsed session, refreshed with any new bytes. `live` keeps a half-written
  // last line for the next read instead of trying to parse it.
  async get(id, { live = false } = {}) {
    let s = this.loaded.get(id);
    if (s) {
      this.loaded.delete(id);
      this.loaded.set(id, s);
      await s.refresh({ final: !live });
      return s;
    }
    const f = await this.locate(id);
    if (!f) return null;
    s = new Session({ id, file: f.file, root: f.root });
    await s.refresh({ final: !live });
    this.loaded.set(id, s);
    this.evict();
    return s;
  }

  evict() {
    const cap = 4 + this.pinned.size;
    for (const k of [...this.loaded.keys()]) {
      if (this.loaded.size <= cap) break;
      if (!this.pinned.has(k)) this.loaded.delete(k);
    }
  }

  // ---------- disk cache ----------

  cachePath(id) {
    return path.join(CACHE_DIR, `${id}.json`);
  }

  // anyVersion: for sessions whose transcript is gone, an older cache format is
  // still the only record we have, so keep using it.
  async readCache(id, { anyVersion = false } = {}) {
    try {
      const j = JSON.parse(await fs.promises.readFile(this.cachePath(id), 'utf8'));
      return j && (j.v === CACHE_VERSION || (anyVersion && j.summary)) ? j : null;
    } catch {
      return null;
    }
  }

  async writeCache(id, data) {
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    const file = this.cachePath(id);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(data));
    await fs.promises.rename(tmp, file);
    this.cacheIdsMemo = null;
  }

  async cacheIds() {
    if (this.cacheIdsMemo) return this.cacheIdsMemo;
    let names = [];
    try {
      names = await fs.promises.readdir(CACHE_DIR);
    } catch {
      names = [];
    }
    this.cacheIdsMemo = names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).filter((id) => UUID.test(id));
    return this.cacheIdsMemo;
  }

  async cachedSummary(f) {
    const key = this.keyOf(f);
    const m = this.summaries.get(f.id);
    if (m) {
      if (m.key === key) return m.summary;
      if (m.checkedKey === key) return null;
    }
    const c = await this.readCache(f.id);
    if (c && c.key === key && c.summary) {
      this.summaries.set(f.id, { key, summary: c.summary });
      return c.summary;
    }
    this.summaries.set(f.id, { key: c?.key || '', checkedKey: key, summary: c?.summary || null });
    return null;
  }

  async buildCache(f) {
    const s = new Session({ id: f.id, file: f.file, root: f.root });
    await s.refresh({ final: true });
    const summary = s.summary();
    const detail = s.detail({ events: 3000, live: false });
    const key = this.keyOf(f);
    await this.writeCache(f.id, { v: CACHE_VERSION, id: f.id, key, summary, detail });
    const raw = s.searchText();
    await fs.promises.writeFile(path.join(CACHE_DIR, `${f.id}.search.txt`), raw);
    this.search.set(f.id, { raw, lower: raw.toLowerCase() });
    this.summaries.set(f.id, { key, summary });
    return { summary, detail };
  }

  // Cheap listing data from the first and last bytes of a transcript, for
  // sessions not indexed yet.
  async quickSummary(f) {
    const key = this.keyOf(f);
    const m = this.quick.get(f.id);
    if (m && m.key === key) return m.summary;
    let head = [];
    let tail = [];
    try {
      head = await readHeadLines(f.file, 160 * 1024);
      tail = f.size > 160 * 1024 ? await readTailLines(f.file, 256 * 1024, f.size) : [];
    } catch {
      // unreadable right now
    }
    let startedAt = 0;
    let endedAt = 0;
    let cwd = '';
    let branch = '';
    let firstPrompt = '';
    let lastPrompt = '';
    let ai = '';
    let custom = '';
    let sumTitle = '';
    let model = '';
    let costState = null;
    const take = (r, fromTail) => {
      const t = ts(r.timestamp);
      if (t) {
        if (!startedAt || t < startedAt) startedAt = t;
        if (t > endedAt) endedAt = t;
      }
      if (r.cwd && (!cwd || fromTail)) cwd = r.cwd;
      if (r.gitBranch && (!branch || fromTail)) branch = r.gitBranch;
      if (r.type === 'ai-title' && r.aiTitle) ai = r.aiTitle;
      if (r.type === 'custom-title' && r.customTitle) custom = r.customTitle;
      if (r.type === 'summary' && r.summary && !sumTitle) sumTitle = r.summary;
      if (r.type === 'last-prompt' && r.lastPrompt) lastPrompt = r.lastPrompt;
      if (r.type === 'cost-state' && typeof r.totalCostUSD === 'number') costState = { usd: r.totalCostUSD };
      if (r.type === 'assistant' && r.message?.model && r.message.model !== '<synthetic>' && !r.isSidechain) model = r.message.model;
      if (!firstPrompt && !fromTail && !r.isSidechain) firstPrompt = promptText(r);
    };
    for (const r of head) take(r, false);
    for (const r of tail) take(r, true);
    const dir = f.file.replace(/\.jsonl$/, '');
    let subagents = 0;
    let workflows = 0;
    try {
      subagents = (await fs.promises.readdir(path.join(dir, 'subagents'))).filter((n) => n.endsWith('.jsonl')).length;
    } catch {
      // none
    }
    try {
      workflows = (await fs.promises.readdir(path.join(dir, 'subagents', 'workflows'))).length;
    } catch {
      // none
    }
    const summary = {
      id: f.id,
      root: f.root,
      file: f.file,
      cwd,
      project: projectName(cwd, f.file),
      branch,
      title: one(custom || ai || sumTitle || firstPrompt, 140) || 'Untitled session',
      firstPrompt: clip(firstPrompt, 700),
      lastPrompt: clip(lastPrompt, 700),
      startedAt: startedAt || f.mtimeMs,
      endedAt: endedAt || f.mtimeMs,
      model: prettyModel(model),
      costState,
      subagents,
      workflows,
      size: f.size,
      empty: !firstPrompt && !subagents && f.size < 64 * 1024,
    };
    this.quick.set(f.id, { key, summary });
    return summary;
  }

  // Every session we know: indexed summaries, quick summaries for ones not
  // indexed yet, live ones from memory, and kept ones whose transcript is gone.
  async allSummaries(isLive = () => false) {
    await this.scanFiles();
    const out = [];
    const seen = new Set();
    for (const f of this.files.values()) {
      seen.add(f.id);
      const mem = isLive(f.id) ? this.loaded.get(f.id) : null;
      const c = mem ? mem.summary() : await this.cachedSummary(f);
      const s = c ? { ...c, indexed: true } : { ...(await this.quickSummary(f)), indexed: false };
      s.size = f.size;
      s.live = isLive(f.id);
      out.push(s);
    }
    for (const id of await this.cacheIds()) {
      if (seen.has(id)) continue;
      const m = this.summaries.get(id);
      let summary = m?.summary;
      if (!summary) {
        const c = await this.readCache(id, { anyVersion: true });
        summary = c?.summary;
        if (summary) this.summaries.set(id, { key: c.key, summary });
      }
      if (summary) out.push({ ...summary, indexed: true, archived: true, live: false });
    }
    // Stable session numbers, oldest first, so S-014 means the same session everywhere.
    await this.loadNumbers();
    for (const x of [...out].sort((p, q) => (p.startedAt || 0) - (q.startedAt || 0))) x.num = this.numberOf(x.id);
    return out;
  }

  // Returns true when there was no numbers file yet (first run).
  async loadNumbers() {
    if (this.numbers) return false;
    let fresh = true;
    try {
      const j = JSON.parse(await fs.promises.readFile(NUMBERS_FILE, 'utf8'));
      if (j && typeof j.next === 'number' && j.ids && typeof j.ids === 'object') {
        this.numbers = j;
        fresh = false;
      }
    } catch {
      // first run, or an unreadable file: start numbering afresh
    }
    this.numbers ||= { next: 1, ids: {} };
    return fresh;
  }

  // Number for a session id; new ids get the next number (saved shortly after).
  numberOf(id) {
    this.numbers ||= { next: 1, ids: {} };
    let n = this.numbers.ids[id];
    if (!n) {
      n = this.numbers.next++;
      this.numbers.ids[id] = n;
      clearTimeout(this.numbersSave);
      this.numbersSave = setTimeout(() => {
        const tmp = `${NUMBERS_FILE}.${process.pid}.tmp`;
        fs.promises
          .mkdir(DATA_DIR, { recursive: true })
          .then(() => fs.promises.writeFile(tmp, JSON.stringify(this.numbers)))
          .then(() => fs.promises.rename(tmp, NUMBERS_FILE))
          .catch(() => {});
      }, 500);
    }
    return n;
  }

  // Search text per session: original case for snippets, lower case for matching.
  async searchOf(s) {
    const mem = s.live ? this.loaded.get(s.id) : null;
    if (mem) {
      if (mem.__searchRev !== mem.rev) {
        const raw = mem.searchText();
        mem.__search = { raw, lower: raw.toLowerCase() };
        mem.__searchRev = mem.rev;
      }
      return mem.__search;
    }
    let e = this.search.get(s.id);
    if (!e) {
      let raw = '';
      try {
        raw = await fs.promises.readFile(path.join(CACHE_DIR, `${s.id}.search.txt`), 'utf8');
      } catch {
        raw = [s.title, s.firstPrompt, s.lastPrompt, s.cwd, s.branch].filter(Boolean).join('\n');
      }
      e = { raw, lower: raw.toLowerCase() };
      this.search.set(s.id, e);
    }
    return e;
  }

  async history({ q = '', limit = 400, offset = 0, isLive = () => false, empty = false, from = 0, to = 0, projects = [], models = [], status = [], sort = 'recent', problems = false } = {}) {
    const all = await this.allSummaries(isLive);
    // problems: only sessions where a step failed (a tool call or an API request)
    const pool = (empty ? all : all.filter((s) => !s.empty || s.live)).filter((s) => !problems || (s.errors || 0) > 0);
    const statusOf = (s) => (s.live ? 'live' : s.archived ? 'kept' : 'ended');
    const terms = parseQuery(q);
    let matched = pool;
    const matches = new Map();
    if (terms.length) {
      matched = [];
      for (const s of pool) {
        const meta = [s.title, s.firstPrompt, s.lastPrompt, s.cwd, s.branch, s.id, s.model, s.project].filter(Boolean).join('\n');
        const metaLower = meta.toLowerCase();
        const text = await this.searchOf(s);
        if (!terms.every((t) => metaLower.includes(t) || text.lower.includes(t))) continue;
        matched.push(s);
        matches.set(s.id, snippetOf(text, { raw: meta, lower: metaLower }, terms));
      }
    }
    // A session is "on" a day when it had activity that day (its per-day
    // buckets, the same rule as the Recap); older summaries fall back to
    // start/end overlap.
    const fromKey = from ? dayKey(from) : '';
    const toKey = to ? dayKey(to) : '';
    const inRange = (s) => {
      if (!from && !to) return true;
      const ds = s.days ? Object.keys(s.days) : [];
      if (ds.length) return ds.some((d) => (!fromKey || d >= fromKey) && (!toKey || d <= toKey));
      return (!from || (s.endedAt || 0) >= from) && (!to || (s.startedAt || 0) <= to);
    };
    const okStatus = (s) => !status.length || status.includes(statusOf(s));
    const okProject = (s) => !projects.length || projects.includes(s.project);
    const okModel = (s) => !models.length || (s.models && s.models.length ? s.models : [s.model]).some((m) => models.includes(m));
    // Each facet counts with every other filter applied, but not its own.
    const projectsFacet = countBy(matched.filter((s) => inRange(s) && okStatus(s) && okModel(s)), (s) => [s.project]);
    const modelsFacet = countBy(matched.filter((s) => inRange(s) && okStatus(s) && okProject(s)), (s) => (s.models && s.models.length ? s.models : [s.model]).filter(Boolean));
    const statusFacet = countBy(matched.filter((s) => inRange(s) && okProject(s) && okModel(s)), (s) => [statusOf(s)]);
    // The calendar shows every day, so it ignores the date filter.
    const calendar = {};
    for (const s of matched) {
      if (!okStatus(s) || !okProject(s) || !okModel(s)) continue;
      const days = s.days && Object.keys(s.days).length ? s.days : { [dayKey(s.endedAt)]: { usd: s.cost?.total || s.costState?.usd || 0, tok: 0 } };
      for (const [d, g] of Object.entries(days)) {
        const c = (calendar[d] ||= { sessions: 0, usd: 0, tok: 0, active: 0, problems: 0 });
        c.sessions++;
        c.usd += g.usd || 0;
        c.tok += g.tok || 0;
        c.active += g.active || 0;
        if ((s.errors || 0) > 0) c.problems++;
      }
    }
    const final = matched.filter((s) => inRange(s) && okStatus(s) && okProject(s) && okModel(s));
    const tok = (s) => (s.tokens ? sumTok(s.tokens.main) + sumTok(s.tokens.subs) : 0);
    const usd = (s) => s.cost?.total ?? s.costState?.usd ?? 0;
    const sorters = {
      recent: (a, b) => (b.endedAt || 0) - (a.endedAt || 0),
      cost: (a, b) => usd(b) - usd(a),
      tokens: (a, b) => tok(b) - tok(a),
      duration: (a, b) => (b.endedAt - b.startedAt || 0) - (a.endedAt - a.startedAt || 0),
      tools: (a, b) => (b.toolCalls || 0) - (a.toolCalls || 0),
    };
    final.sort(sorters[sort] || sorters.recent);
    // With a date filter, totals count only the chosen days (from the per-day
    // buckets), so they agree with the Recap; a session's row still shows its
    // whole cost.
    const scoped = !!(from || to);
    const totals = { sessions: final.length, tokens: 0, usd: 0, scoped };
    for (const s of final) {
      if (scoped && s.days && Object.keys(s.days).length) {
        for (const [d, g] of Object.entries(s.days)) {
          if ((fromKey && d < fromKey) || (toKey && d > toKey)) continue;
          totals.tokens += g.tok || 0;
          totals.usd += g.usd || 0;
        }
      } else {
        totals.tokens += tok(s);
        totals.usd += usd(s);
      }
    }
    return {
      total: all.length,
      hiddenEmpty: empty ? 0 : all.length - pool.length,
      indexing: this.indexing,
      totals,
      facets: { projects: projectsFacet, models: modelsFacet, status: statusFacet },
      calendar,
      // (the per-model usage rows stay home: Recap reads them, the list doesn't need them)
      sessions: final.slice(offset, offset + limit).map(({ usage: _usage, ...s }) => (matches.has(s.id) ? { ...s, match: matches.get(s.id) } : s)),
    };
  }

  // Totals per day and per project between two dates (local time), from the
  // per-day buckets of every session that was active in that window.
  async recap({ from, to, isLive = () => false }) {
    const all = await this.allSummaries(isLive);
    const days = {};
    const projects = {};
    const tools = {};
    const models = {};
    let sessions = 0;
    // sessions summed whole because they have no per-day model rows (older caches)
    let modelsWhole = 0;
    for (const s of all) {
      if (!s.days) continue;
      let touched = false;
      for (const [d, g] of Object.entries(s.days)) {
        const t = dayStart(d);
        if (t < from || t > to) continue;
        touched = true;
        const D = (days[d] ||= { tok: 0, usd: 0, tools: 0, prompts: 0, edits: 0, add: 0, del: 0, active: 0, sessions: 0, projects: {} });
        D.tok += g.tok;
        D.usd += g.usd;
        D.tools += g.tools;
        D.prompts += g.prompts;
        D.edits += g.edits;
        D.add += g.add;
        D.del += g.del;
        D.active += g.active;
        D.sessions++;
        const dp = (D.projects[s.project] ||= { usd: 0, tok: 0 });
        dp.usd += g.usd;
        dp.tok += g.tok;
        const P = (projects[s.project] ||= { usd: 0, tok: 0, sessions: 0, active: 0, add: 0, del: 0 });
        P.usd += g.usd;
        P.tok += g.tok;
        P.active += g.active;
        P.add += g.add;
        P.del += g.del;
      }
      if (!touched) continue;
      sessions++;
      projects[s.project].sessions++;
      for (const [n, c] of s.tools || []) tools[n] = (tools[n] || 0) + c;
      // cost by model counts only the days in the window, like everything above
      if (Array.isArray(s.usage)) {
        for (const u of s.usage) {
          const t = dayStart(u[0]);
          if (t < from || t > to) continue;
          models[u[1]] = (models[u[1]] || 0) + rowUsd(u);
        }
      } else {
        modelsWhole++;
        for (const [m, u] of Object.entries(s.modelUsd || {})) models[m] = (models[m] || 0) + u;
      }
    }
    // Stable project order (all-time cost) so a project keeps its chart colour across periods.
    const allTime = {};
    for (const s of all) allTime[s.project] = (allTime[s.project] || 0) + (s.cost?.total ?? s.costState?.usd ?? 0);
    return {
      from,
      to,
      sessions,
      projectOrder: Object.entries(allTime).sort((x, y) => y[1] - x[1]).map(([name]) => name),
      days,
      projects,
      tools: Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 10),
      models: Object.fromEntries(Object.entries(models).map(([m, u]) => [m, Math.round(u * 1000) / 1000])),
      modelsWhole,
    };
  }

  // What one model did between two dates: its sessions and projects, the main
  // agents against each kind of helper, its tokens and the price of each kind,
  // and a total per day. From the summaries' per-day model rows.
  async modelRecap({ model, from, to, isLive = () => false }) {
    const all = await this.allSummaries(isLive);
    const out = {
      model,
      from,
      to,
      messages: 0,
      tokens: { in: 0, out: 0, cr: 0, cw: 0 },
      cost: { in: 0, out: 0, cr: 0, cw: 0, ws: 0, total: 0 },
      days: {},
      sessions: [],
      projects: [],
      agents: [],
      // sessions active in the window that used this model but have no per-day rows (older caches)
      whole: 0,
    };
    const projects = new Map();
    const agents = new Map();
    for (const s of all) {
      if (!Array.isArray(s.usage)) {
        const active = s.days && Object.keys(s.days).some((d) => dayStart(d) >= from && dayStart(d) <= to);
        if (active && s.modelUsd?.[model]) out.whole++;
        continue;
      }
      let mine = null;
      for (const u of s.usage) {
        if (u[1] !== model) continue;
        const t = dayStart(u[0]);
        if (t < from || t > to) continue;
        const usd = rowUsd(u);
        const tok = u[4] + u[5] + u[6] + u[7];
        mine ||= { id: s.id, num: s.num, title: s.title, project: s.project, startedAt: s.startedAt, endedAt: s.endedAt, live: !!s.live, archived: !!s.archived, usd: 0, tok: 0, messages: 0, helpersUsd: 0 };
        mine.usd += usd;
        mine.tok += tok;
        mine.messages += u[3];
        if (u[2] !== 'main') mine.helpersUsd += usd;
        out.messages += u[3];
        out.tokens.in += u[4];
        out.tokens.out += u[5];
        out.tokens.cr += u[6];
        out.tokens.cw += u[7];
        out.cost.in += u[8];
        out.cost.out += u[9];
        out.cost.cr += u[10];
        out.cost.cw += u[11];
        out.cost.ws += u[12];
        out.cost.total += usd;
        const d = (out.days[u[0]] ||= { usd: 0, tok: 0, messages: 0 });
        d.usd += usd;
        d.tok += tok;
        d.messages += u[3];
        let a = agents.get(u[2]);
        if (!a) agents.set(u[2], (a = { key: u[2], kind: u[2] === 'main' ? 'main' : u[2].split(':')[0], type: u[2] === 'main' ? 'main' : u[2].slice(u[2].indexOf(':') + 1), usd: 0, tok: 0, messages: 0, sessions: new Set() }));
        a.usd += usd;
        a.tok += tok;
        a.messages += u[3];
        a.sessions.add(s.id);
      }
      if (!mine) continue;
      out.sessions.push(mine);
      let p = projects.get(s.project);
      if (!p) projects.set(s.project, (p = { name: s.project, usd: 0, tok: 0, sessions: 0 }));
      p.usd += mine.usd;
      p.tok += mine.tok;
      p.sessions++;
    }
    const r3 = (v) => Math.round(v * 1000) / 1000;
    for (const k of Object.keys(out.cost)) out.cost[k] = r3(out.cost[k]);
    for (const d of Object.values(out.days)) d.usd = r3(d.usd);
    out.sessions = out.sessions.sort((x, y) => y.usd - x.usd).map((x) => ({ ...x, usd: r3(x.usd), helpersUsd: r3(x.helpersUsd) }));
    out.projects = [...projects.values()].sort((x, y) => y.usd - x.usd).map((x) => ({ ...x, usd: r3(x.usd) }));
    out.agents = [...agents.values()].sort((x, y) => y.usd - x.usd).map((x) => ({ ...x, usd: r3(x.usd), sessions: x.sessions.size }));
    return out;
  }

  // Background pass that parses every session once (newest first) and caches
  // the result. Live sessions are skipped; they are parsed incrementally.
  async indexAll(isLive) {
    if (this.indexing.running) return;
    this.indexing.running = true;
    try {
      await this.scanFiles(true);
      const list = [...this.files.values()].sort((a, b) => b.mtimeMs - a.mtimeMs);
      this.indexing.total = list.length;
      this.indexing.done = 0;
      for (const f of list) {
        this.indexing.current = f.id;
        if (!isLive(f.id) && !(await this.cachedSummary(f))) {
          try {
            await this.buildCache(f);
          } catch (e) {
            console.warn(`[index] ${f.id}: ${e.message}`);
          }
          await sleep(25);
        }
        this.indexing.done++;
      }
    } finally {
      this.indexing.running = false;
      this.indexing.current = '';
    }
  }
}

// ---------- helpers ----------

// Words must all match; "quoted phrases" stay together.
function parseQuery(q) {
  const out = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(q || '').toLowerCase()))) out.push((m[1] || m[2]).trim());
  return out.filter(Boolean);
}

// The line where the first word matched, trimmed around the match.
function snippetOf(text, meta, terms) {
  for (const src of [text, meta]) {
    for (const t of terms) {
      const i = src.lower.indexOf(t);
      if (i < 0) continue;
      const a = src.lower.lastIndexOf('\n', i) + 1;
      const bEnd = src.lower.indexOf('\n', i);
      const b = bEnd < 0 ? src.raw.length : bEnd;
      let line = src.raw.slice(a, b);
      const pos = i - a;
      // keep the match near the start: the list column is narrow
      if (line.length > 80 && pos > 20) {
        const s0 = pos - 18;
        line = '…' + line.slice(s0, s0 + 110) + (s0 + 110 < line.length ? '…' : '');
      } else if (line.length > 130) line = line.slice(0, 130) + '…';
      return { text: line, term: t };
    }
  }
  return null;
}

function countBy(list, keys) {
  const m = new Map();
  for (const s of list) for (const k of keys(s)) if (k) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function sumTok(t) {
  return t ? (t.in || 0) + (t.out || 0) + (t.cr || 0) + (t.cw5 || 0) + (t.cw1 || 0) : 0;
}

// The price of one usage row (see Session.usage): its five parts added up.
function rowUsd(u) {
  return u[8] + u[9] + u[10] + u[11] + u[12];
}

export function dayKey(t) {
  const d = new Date(t || 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayStart(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}
