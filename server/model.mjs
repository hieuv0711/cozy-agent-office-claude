import fs from 'node:fs';
import path from 'node:path';
import { HOME } from './config.mjs';
import { JsonlTail } from './jsonl.mjs';
import { contextWindow, costOf, costParts, prettyModel } from './pricing.mjs';

// ---------- small helpers ----------

export function clip(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
export function one(s, n) {
  return clip(String(s ?? '').replace(/\s+/g, ' ').trim(), n);
}
export function ts(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}
export function textOf(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((b) => (typeof b === 'string' ? b : b && b.type === 'text' ? b.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}
function pushDur(a, key, ms) {
  const list = a.durs.get(key) || [];
  list.push(ms);
  if (list.length > 15) list.shift();
  a.durs.set(key, list);
}

// Median of a list of durations, or 0 with fewer than two.
export function median(list) {
  if (!list || list.length < 2) return 0;
  return [...list].sort((x, y) => x - y)[Math.floor(list.length / 2)];
}

// What counts as "the same kind of call" for typical durations: the tool name,
// plus the first two words of a shell command (npm test, git push, …).
function durKey(ev) {
  if (ev.name !== 'Bash') return ev.name;
  const words = String(ev.target || '').trim().split(/\s+/).slice(0, 2).join(' ');
  return `Bash:${words}`;
}

function relPath(p, cwd) {
  if (!p || typeof p !== 'string') return '';
  if (cwd && p.startsWith(cwd + '/')) return p.slice(cwd.length + 1);
  return p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p;
}
export function projectName(cwd, file) {
  if (cwd) return path.basename(cwd) || cwd;
  const dir = file ? path.basename(path.dirname(file)) : '';
  return dir.split('-').filter(Boolean).pop() || dir;
}
function scriptName(script) {
  if (typeof script !== 'string') return '';
  return /name:\s*['"`]([^'"`]+)['"`]/.exec(script)?.[1] || '';
}
function cleanDesc(d) {
  return one(String(d).replace(/^v\d+:/, '').replace(/^"|"$/g, ''), 160);
}
export function shortTool(name) {
  if (!name) return '?';
  const m = /^mcp__.+?__(.+)$/.exec(name);
  return m ? m[1] : name;
}

export function toolCategory(name) {
  if (!name) return 'other';
  if (/^(Read|Grep|Glob|LS|NotebookRead|ToolSearch|Skill|ListMcpResourcesTool|ReadMcpResourceTool|ReadMcpResourceDirTool)$/.test(name)) return 'read';
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(name)) return 'edit';
  if (/^(Bash|BashOutput|KillShell|KillBash|Monitor|TaskStop)$/.test(name)) return 'run';
  if (/^(Agent|Task|Workflow|SendMessage|TaskOutput|TeamCreate|TeamDelete)$/.test(name)) return 'agent';
  if (/^(WebFetch|WebSearch)$/.test(name) || /^mcp__.*(chrome|browser|playwright|puppeteer)/i.test(name)) return 'web';
  if (/^(AskUserQuestion|ExitPlanMode|EnterPlanMode)$/.test(name)) return 'ask';
  if (/^(TodoWrite|TaskCreate|TaskUpdate|TaskList|TaskGet)$/.test(name)) return 'plan';
  if (/^mcp__/.test(name)) return 'mcp';
  return 'other';
}

export function toolTarget(name, input, cwd) {
  const i = input && typeof input === 'object' ? input : {};
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
    case 'NotebookRead':
      return relPath(i.file_path || i.notebook_path || i.path, cwd);
    case 'Bash':
      return one(String(i.command || '').split('\n')[0], 160);
    case 'Grep':
      return one(`${i.pattern ?? ''}${i.path ? ' in ' + relPath(i.path, cwd) : ''}${i.glob ? ' (' + i.glob + ')' : ''}`, 160);
    case 'Glob':
      return one(i.pattern, 160);
    case 'WebFetch':
      return one(i.url, 160);
    case 'WebSearch':
      return one(i.query, 160);
    case 'Agent':
    case 'Task':
      return one(`${i.subagent_type || 'general-purpose'}: ${i.description || ''}`, 160);
    case 'Workflow':
      return one(i.name || scriptName(i.script) || (i.scriptPath ? path.basename(i.scriptPath) : 'workflow'), 120);
    case 'Skill':
      return one(i.skill || i.name, 100);
    case 'ToolSearch':
      return one(i.query, 100);
    case 'TodoWrite':
      return `${Array.isArray(i.todos) ? i.todos.length : 0} todos`;
    case 'AskUserQuestion':
      return one(i.questions?.[0]?.question || i.question, 160);
    case 'SendMessage':
      return one(`to ${i.to || i.recipient || ''}`, 80);
    default: {
      for (const v of Object.values(i)) if (typeof v === 'string' && v.trim()) return one(v, 120);
      return '';
    }
  }
}

function emptyTok() {
  return { in: 0, out: 0, cr: 0, cw5: 0, cw1: 0, ws: 0 };
}
export function addTok(a, b) {
  a.in += b.in;
  a.out += b.out;
  a.cr += b.cr;
  a.cw5 += b.cw5;
  a.cw1 += b.cw1;
  a.ws += b.ws || 0;
  return a;
}

// Cleans a user record down to the text the person typed, or '' when it is
// not a prompt (tool results, reminders, command output...).
// Claude Code wraps pasted text in <pasted_content id="..."> tags; keep the text, drop the tags.
export function unwrapPaste(s) {
  return String(s || '').replace(/<\/?pasted_content[^>]*>/g, '').trim();
}

export function promptText(r) {
  if (!r || r.type !== 'user' || r.isMeta || r.isCompactSummary) return '';
  const c = r.message?.content;
  if (Array.isArray(c) && c.some((b) => b && b.type === 'tool_result')) return '';
  let s = textOf(c).trim();
  if (!s || s.startsWith('<task-notification>') || r.origin?.kind === 'task-notification') return '';
  if (/^<(local-command-|bash-stdout|bash-stderr|command-)/.test(s) || s.startsWith('[Request interrupted')) return '';
  s = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  return unwrapPaste(s);
}

// ---------- one agent = one transcript file ----------

export class Agent {
  constructor(session, { id, kind, file }) {
    this.session = session;
    this.id = id;
    this.kind = kind; // main | subagent | teammate | workflow
    this.file = file;
    this.tail = file ? new JsonlTail(file) : null;
    this.meta = {};
    this.metaMtime = 0;
    this.type = kind === 'main' ? 'main' : '';
    this.name = '';
    this.desc = '';
    this.color = '';
    this.parentAgentId = '';
    this.toolUseId = '';
    this.runId = '';
    this.phase = '';
    this.reset();
  }

  reset() {
    this.firstTs = 0;
    this.lastTs = 0;
    this.msgs = new Map();
    this.pending = new Map();
    this.toolEvents = new Map();
    this.durs = new Map(); // tool kind -> recent durations (ms), for "typical" times
    this.quietSince = 0; // last tool result or prompt: the start of a "thinking" stretch
    this.events = [];
    this.toolCounts = new Map();
    this.toolCalls = 0;
    this.errors = 0;
    this.prompts = 0;
    this.firstPrompt = '';
    this.lastPrompt = '';
    this.task = '';
    this.lastText = '';
    this.lastTextTs = 0;
    this.model = '';
    this.requestedModel = '';
    this.ctx = 0;
    this.ctxTs = 0;
    this.ctxSeries = [];
    this.files = new Map();
    this.lastStop = '';
    this.lastStopTs = 0;
    this.textKeys = new Set();
    this.cwd = '';
    this.branch = '';
    this.version = '';
    this.compactions = 0;
    this.naive = emptyTok(); // usage summed per line, without dedupe (self-test only)
  }

  async pull(final) {
    if (!this.tail) return false;
    return this.tail.pull((r) => this.session.ingest(this, r), { final, onReset: () => this.reset() });
  }

  touch(t) {
    if (!t) return;
    if (!this.firstTs || t < this.firstTs) this.firstTs = t;
    if (t > this.lastTs) this.lastTs = t;
  }

  fileStat(p) {
    const key = relPath(p, this.session.cwd || this.cwd) || '?';
    let f = this.files.get(key);
    if (!f) {
      f = { path: key, reads: 0, edits: 0, added: 0, removed: 0, isNew: false };
      this.files.set(key, f);
    }
    return f;
  }

  tokens() {
    const t = emptyTok();
    for (const r of this.msgs.values()) addTok(t, r);
    return t;
  }

  cost() {
    let usd = 0;
    let unknown = false;
    for (const r of this.msgs.values()) {
      const c = costOf(r.model, r, r.speed);
      usd += c.usd;
      if (!c.known) unknown = true;
    }
    return { usd, unknown };
  }

  now() {
    let best = null;
    for (const ev of this.pending.values()) if (!best || ev.t > best.t) best = ev;
    if (!best) return null;
    // Typical duration of this kind of call in this session: the median of the
    // last ones that finished (needs two). The UI fills the caption against it.
    const typicalMs = median(this.durs.get(durKey(best)));
    return { tool: best.name, short: shortTool(best.name), cat: best.cat, target: best.target, desc: best.desc || '', since: best.t, typicalMs };
  }
}

// ---------- one session = main transcript + subagents + workflow runs ----------

export class Session {
  constructor({ id, file, root }) {
    this.id = id;
    this.file = file;
    this.root = root;
    this.dir = file.replace(/\.jsonl$/, '');
    this.main = new Agent(this, { id: 'main', kind: 'main', file });
    this.subs = new Map();
    this.workflows = new Map();
    this.links = new Map();
    this.teammates = new Map();
    this.tasks = new Map();
    this.titles = { ai: '', custom: '', summary: '' };
    this.lastPromptRec = '';
    this.costState = null;
    this.prs = new Map();
    this.rev = 0;
    this.lastScan = 0;
    this.inline = null;
  }

  get cwd() {
    return this.main.cwd;
  }

  get title() {
    return this.titles.custom || this.titles.ai || this.titles.summary || one(this.main.firstPrompt, 90) || 'Untitled session';
  }

  async refresh({ final = false } = {}) {
    let changed = await this.main.pull(final);
    const now = Date.now();
    if (final || now - this.lastScan > 1500) {
      this.lastScan = now;
      if (await this.scan()) changed = true;
    }
    for (const a of this.subs.values()) if (await a.pull(final)) changed = true;
    for (const w of this.workflows.values()) {
      if (w.journal && (await w.journal.pull((r) => this.ingestJournal(w, r), { final }))) changed = true;
    }
    if (changed) this.rev++;
    return changed;
  }

  // Finds subagent transcripts, their .meta.json sidecars, Workflow runs and
  // their journals. Workflow agents live one level deeper than Agent-tool ones.
  async scan() {
    let changed = false;
    const subDir = path.join(this.dir, 'subagents');
    const names = await readdirSafe(subDir);
    for (const n of names) {
      const m = /^agent-(.+)\.jsonl$/.exec(n);
      if (m && !this.subs.has(m[1])) {
        this.addSub(m[1], path.join(subDir, n), 'subagent');
        changed = true;
      }
    }
    const wfDir = path.join(subDir, 'workflows');
    for (const runId of await readdirSafe(wfDir)) {
      const w = this.workflow(runId);
      for (const n of await readdirSafe(path.join(wfDir, runId))) {
        const m = /^agent-(.+)\.jsonl$/.exec(n);
        if (m && !this.subs.has(m[1])) {
          const a = this.addSub(m[1], path.join(wfDir, runId, n), 'workflow');
          a.runId = runId;
          w.agents.add(m[1]);
          const st = w.started.get(m[1]);
          if (st) a.phase = a.phase || st.phase;
          changed = true;
        }
        if (n === 'journal.jsonl' && !w.journal) {
          w.journal = new JsonlTail(path.join(wfDir, runId, n));
          changed = true;
        }
      }
    }
    for (const a of this.subs.values()) if (await this.readMeta(a)) changed = true;
    // Run records are written when a Workflow run finishes.
    const recDir = path.join(this.dir, 'workflows');
    for (const n of await readdirSafe(recDir)) {
      const m = /^(.+)\.json$/.exec(n);
      if (!m) continue;
      const w = this.workflow(m[1]);
      if (w.recordLoaded) continue;
      try {
        const j = JSON.parse(await fs.promises.readFile(path.join(recDir, n), 'utf8'));
        w.recordLoaded = true;
        w.taskId = w.taskId || j.taskId || '';
        w.name = w.name || scriptName(j.script);
        w.finishedAt = ts(j.timestamp);
        w.status = 'done';
        const res = j.result;
        w.summary = clip(typeof res === 'string' ? res : res?.summary || '', 900);
        changed = true;
      } catch {
        // half-written; try again next scan
      }
    }
    return changed;
  }

  addSub(id, file, kind) {
    const a = new Agent(this, { id, kind, file });
    this.subs.set(id, a);
    return a;
  }

  workflow(runId) {
    let w = this.workflows.get(runId);
    if (!w) {
      w = { runId, name: '', taskId: '', ev: null, agents: new Set(), started: new Map(), results: new Set(), resultText: new Map(), resultLen: new Map(), journal: null, status: 'running', finishedAt: 0, summary: '', recordLoaded: false };
      this.workflows.set(runId, w);
    }
    return w;
  }

  async readMeta(a) {
    const mf = a.file.replace(/\.jsonl$/, '.meta.json');
    let st;
    try {
      st = await fs.promises.stat(mf);
    } catch {
      return false;
    }
    if (st.mtimeMs === a.metaMtime) return false;
    let m;
    try {
      m = JSON.parse(await fs.promises.readFile(mf, 'utf8')) || {};
    } catch {
      return false;
    }
    a.metaMtime = st.mtimeMs;
    a.meta = m;
    if (m.agentType === 'workflow-subagent') a.kind = 'workflow';
    else if (m.teamName || m.taskKind === 'teammate') a.kind = 'teammate';
    a.type = m.agentType === 'workflow-subagent' ? 'workflow agent' : m.customAgentType || m.spawnedAgentType || m.agentType || 'agent';
    a.name = m.name || a.name;
    a.desc = m.description ? cleanDesc(m.description) : a.desc;
    a.color = m.color || a.color;
    a.parentAgentId = m.parentAgentId || '';
    a.toolUseId = m.toolUseId || '';
    a.phase = m.workflowPhase || a.phase;
    return true;
  }

  ingestJournal(w, r) {
    if (r.type === 'started' && r.agentId) {
      w.started.set(r.agentId, { label: one(r.label, 80), phase: r.phase || '' });
      const a = this.subs.get(r.agentId);
      if (a && !a.phase) a.phase = r.phase || '';
    } else if (r.type === 'result' && r.agentId) {
      w.results.add(r.agentId);
      // Workflow agents hand back structured output, not a final message.
      const res = r.result;
      let text = '';
      if (typeof res === 'string') text = res;
      else if (res && typeof res === 'object') {
        const lead = res.summary || res.verdict || res.claim || res.answer || res.title;
        text = (typeof lead === 'string' ? lead + '\n\n' : '') + JSON.stringify(res, null, 1);
      }
      if (text) {
        w.resultText.set(r.agentId, clip(text, 1500));
        w.resultLen.set(r.agentId, typeof res === 'string' ? res.length : JSON.stringify(res).length);
      }
    }
  }

  inlineAgent() {
    if (!this.inline) {
      this.inline = new Agent(this, { id: 'sidechain', kind: 'subagent', file: null });
      this.inline.type = 'Task (inline)';
      this.inline.desc = 'Subagent turns stored inside the main transcript';
      this.subs.set('sidechain', this.inline);
    }
    return this.inline;
  }

  // ---------- record ingestion ----------

  ingest(agent, r) {
    switch (r.type) {
      case 'assistant':
        return this.onAssistant(agent.kind === 'main' && r.isSidechain ? this.inlineAgent() : agent, r);
      case 'user':
        return this.onUser(agent.kind === 'main' && r.isSidechain ? this.inlineAgent() : agent, r);
      case 'system':
        return this.onSystem(agent, r);
      case 'ai-title':
        if (r.aiTitle) this.titles.ai = one(r.aiTitle, 140);
        return;
      case 'custom-title':
        if (r.customTitle) this.titles.custom = one(r.customTitle, 140);
        return;
      case 'summary':
        if (r.summary && !this.titles.summary) this.titles.summary = one(r.summary, 140);
        return;
      case 'last-prompt':
        if (r.lastPrompt) this.lastPromptRec = one(r.lastPrompt, 400);
        return;
      case 'cost-state':
        if (agent.kind === 'main' && typeof r.totalCostUSD === 'number') {
          this.costState = {
            usd: r.totalCostUSD,
            linesAdded: r.totalLinesAdded || 0,
            linesRemoved: r.totalLinesRemoved || 0,
            models: Object.keys(r.modelUsage || {}),
            unknown: !!r.hasUnknownModelCost,
            at: this.main.lastTs,
          };
        }
        return;
      case 'queue-operation':
        // Background-task notifications that arrive mid-turn are queued, not written as user messages.
        if (r.operation === 'enqueue' && typeof r.content === 'string' && r.content.startsWith('<task-notification>')) {
          this.onTaskNote(agent, r.content, ts(r.timestamp));
        }
        return;
      case 'pr-link':
        if (r.prNumber) this.prs.set(r.prNumber, { number: r.prNumber, url: r.prUrl || '', repo: r.prRepository || '' });
        return;
      default:
        return;
    }
  }

  onAssistant(a, r) {
    const t = ts(r.timestamp);
    a.touch(t);
    if (r.cwd) a.cwd = r.cwd;
    if (r.gitBranch) a.branch = r.gitBranch;
    if (r.version) a.version = r.version;
    const m = r.message || {};
    if (r.isApiErrorMessage) {
      a.errors++;
      a.events.push({ t, a: a.id, k: 'error', text: one(textOf(m.content), 220) });
      return;
    }
    if (m.model && m.model !== '<synthetic>') {
      a.model = m.model;
      if (r.requestedModel) a.requestedModel = r.requestedModel;
    }
    const u = m.usage;
    if (u && m.id && m.model && m.model !== '<synthetic>') {
      // Claude Code writes one line per content block; every line of a message
      // repeats its usage, and streamed lines can carry partial output counts.
      // Keep one row per message id with the largest value seen per field.
      let row = this.msgRow(a, m, t);
      const cw = u.cache_creation_input_tokens || 0;
      const cw1 = u.cache_creation?.ephemeral_1h_input_tokens || 0;
      const cw5 = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens || 0) + Math.max(0, cw - cw1 - (u.cache_creation.ephemeral_5m_input_tokens || 0)) : cw;
      row.in = Math.max(row.in, u.input_tokens || 0);
      row.out = Math.max(row.out, u.output_tokens || 0);
      row.cr = Math.max(row.cr, u.cache_read_input_tokens || 0);
      row.cw5 = Math.max(row.cw5, cw5);
      row.cw1 = Math.max(row.cw1, cw1);
      row.ws = Math.max(row.ws, u.server_tool_use?.web_search_requests || 0);
      if (u.speed) row.speed = u.speed;
      a.naive.in += u.input_tokens || 0;
      a.naive.out += u.output_tokens || 0;
      a.naive.cr += u.cache_read_input_tokens || 0;
      a.naive.cw5 += cw;
      const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + cw;
      if (ctx > 0) {
        if (t >= a.ctxTs) {
          a.ctx = ctx;
          a.ctxTs = t;
        }
        if (!row.ctxLogged) {
          row.ctxLogged = true;
          a.ctxSeries.push([t, ctx]);
        }
      }
    }
    if (m.stop_reason) {
      a.lastStop = m.stop_reason;
      a.lastStopTs = t;
    }
    const content = Array.isArray(m.content) ? m.content : [];
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'tool_use') this.openTool(a, b, t);
      else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
        const key = `${m.id}|${b.text.length}|${b.text.slice(0, 32)}`;
        if (a.textKeys.has(key)) continue;
        a.textKeys.add(key);
        a.lastText = clip(b.text.trim(), 4000);
        a.lastTextTs = t;
        a.events.push({ t, a: a.id, k: 'text', text: one(b.text, 280) });
      }
    }
  }

  msgRow(a, m, t) {
    let row = a.msgs.get(m.id);
    if (!row) {
      row = { model: m.model, t, in: 0, out: 0, cr: 0, cw5: 0, cw1: 0, ws: 0, speed: 'standard', ctxLogged: false };
      a.msgs.set(m.id, row);
    }
    return row;
  }

  openTool(a, b, t) {
    if (!b.id || a.toolEvents.has(b.id)) return;
    const name = b.name || '?';
    const input = b.input && typeof b.input === 'object' ? b.input : {};
    const ev = { t, a: a.id, k: 'tool', id: b.id, name, cat: toolCategory(name), target: toolTarget(name, input, a.cwd || this.cwd) };
    if (typeof input.file_path === 'string') ev.path = input.file_path;
    if (name === 'Bash') {
      if (input.description) ev.desc = one(input.description, 110);
      if (input.run_in_background) ev.bg = true;
    }
    if (name === 'Agent' || name === 'Task') {
      ev.subType = input.subagent_type || 'general-purpose';
      ev.subDesc = one(input.description, 140);
      ev.bg = !!input.run_in_background;
      if (input.name) ev.subName = one(input.name, 60);
    }
    if (name === 'Workflow') ev.wfName = input.name || scriptName(input.script) || '';
    // the stretch since the last result or prompt was thinking: remember how long
    if (a.quietSince && ev.t > a.quietSince && ev.t - a.quietSince < 600_000) pushDur(a, 'think', ev.t - a.quietSince);
    a.quietSince = 0;
    a.toolEvents.set(b.id, ev);
    a.pending.set(b.id, ev);
    a.events.push(ev);
    a.toolCalls++;
    a.toolCounts.set(name, (a.toolCounts.get(name) || 0) + 1);
  }

  onUser(a, r) {
    const t = ts(r.timestamp);
    a.touch(t);
    if (r.cwd) a.cwd = r.cwd;
    if (r.gitBranch) a.branch = r.gitBranch;
    if (r.version) a.version = r.version;
    const c = r.message?.content;
    if (Array.isArray(c) && c.some((b) => b && b.type === 'tool_result')) {
      for (const b of c) if (b && b.type === 'tool_result') this.closeTool(a, b, r.toolUseResult, t);
      return;
    }
    if (r.isMeta) return;
    if (r.isCompactSummary) {
      a.compactions++;
      a.events.push({ t, a: a.id, k: 'compact' });
      return;
    }
    let s = textOf(c).trim();
    if (!s && Array.isArray(c) && c.some((b) => b && b.type === 'image')) s = '[image]';
    if (!s) return;
    if (s.startsWith('<task-notification>') || r.origin?.kind === 'task-notification') return this.onTaskNote(a, s, t);
    if (/^<(local-command-stdout|local-command-stderr|local-command-caveat|bash-stdout|bash-stderr)>/.test(s)) return;
    if (s.startsWith('<command-')) {
      const n = /<command-name>([^<]*)<\/command-name>/.exec(s)?.[1] || '';
      const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(s)?.[1] || '';
      if (n) a.events.push({ t, a: a.id, k: 'command', text: one(`${n} ${args}`, 200) });
      return;
    }
    if (s.startsWith('[Request interrupted')) {
      a.events.push({ t, a: a.id, k: 'interrupt' });
      return;
    }
    s = unwrapPaste(s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ''));
    if (!s) return;
    const bash = /^<bash-input>([\s\S]*?)<\/bash-input>/.exec(s);
    if (bash) {
      a.events.push({ t, a: a.id, k: 'command', text: one('! ' + bash[1], 200) });
      return;
    }
    if (a.kind !== 'main') {
      if (!a.task) {
        a.task = clip(s, 1500);
        a.events.push({ t, a: a.id, k: 'task', text: one(s, 320) });
      } else {
        a.events.push({ t, a: a.id, k: 'prompt', text: one(s, 320) });
      }
      return;
    }
    a.prompts++;
    a.quietSince = t;
    if (!a.firstPrompt) a.firstPrompt = clip(s, 1500);
    a.lastPrompt = clip(s, 1500);
    a.events.push({ t, a: a.id, k: 'prompt', text: one(s, 420) });
  }

  onTaskNote(a, s, t) {
    const id = /<task-id>([^<]+)<\/task-id>/.exec(s)?.[1]?.trim() || '';
    const status = /<status>([^<]+)<\/status>/.exec(s)?.[1]?.trim() || '';
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(s)?.[1]?.trim() || '';
    const toolUseId = /<tool-use-id>([^<]+)<\/tool-use-id>/.exec(s)?.[1]?.trim() || '';
    const prev = id ? this.tasks.get(id) : null;
    if (prev && prev.status === status) return; // same notification seen twice (queued, then delivered)
    if (id) this.tasks.set(id, { status, summary: one(summary, 300), t, toolUseId });
    a.events.push({ t, a: a.id, k: 'notify', id, status, text: one(summary, 260) });
    if (toolUseId) {
      const ev = this.findToolEvent(toolUseId);
      if (ev) {
        ev.doneAt = t;
        ev.doneStatus = status;
      }
    }
  }

  closeTool(a, b, tur, t) {
    const ev = a.toolEvents.get(b.tool_use_id);
    if (!ev) return;
    if (!ev.end) ev.end = t;
    ev.ok = !b.is_error;
    a.pending.delete(ev.id);
    if (ev.t && ev.end >= ev.t) pushDur(a, durKey(ev), ev.end - ev.t);
    a.quietSince = t;
    if (b.is_error) {
      a.errors++;
      ev.info = one(textOf(b.content), 170);
    }
    if (tur && typeof tur === 'object' && !Array.isArray(tur)) this.applyResult(a, ev, tur, t);
  }

  applyResult(a, ev, r, t) {
    switch (ev.name) {
      case 'Edit':
      case 'MultiEdit':
      case 'Write':
      case 'NotebookEdit': {
        const f = a.fileStat(r.filePath || ev.path);
        let add = 0;
        let del = 0;
        for (const h of Array.isArray(r.structuredPatch) ? r.structuredPatch : []) {
          for (const l of Array.isArray(h.lines) ? h.lines : []) {
            if (l[0] === '+') add++;
            else if (l[0] === '-') del++;
          }
        }
        if (r.type === 'create') {
          f.isNew = true;
          if (!add && typeof r.content === 'string') add = r.content.split('\n').length;
        }
        f.added += add;
        f.removed += del;
        f.edits++;
        ev.add = add;
        ev.del = del;
        if (ev.ok !== false) ev.info = r.type === 'create' ? `new file, +${add}` : `+${add} −${del}`;
        break;
      }
      case 'Read': {
        const f = a.fileStat(r.file?.filePath || ev.path);
        f.reads++;
        if (ev.ok !== false) ev.info = f.reads > 1 ? `read ${f.reads}× this session` : r.file?.numLines ? `${r.file.numLines} lines` : '';
        if (f.reads > 2) ev.reread = f.reads;
        break;
      }
      case 'Bash': {
        const out = String(r.stdout || '').trimEnd();
        const err = String(r.stderr || '').trimEnd();
        const body = out || err;
        if (r.interrupted) ev.info = 'interrupted';
        else if (r.backgroundTaskId) ev.info = 'running in background';
        else if (body && ev.ok !== false) ev.info = one(body.split('\n').slice(-1)[0], 150);
        if (body) ev.tail = clip(body.split('\n').slice(-6).join('\n'), 600);
        break;
      }
      case 'Grep':
      case 'Glob': {
        if (typeof r.numFiles === 'number') ev.info = `${r.numFiles} file${r.numFiles === 1 ? '' : 's'}`;
        break;
      }
      case 'Agent':
      case 'Task': {
        const aid = r.agentId || r.agent_id;
        if (aid) {
          ev.sub = aid;
          this.links.set(aid, ev);
        }
        if (r.status === 'teammate_spawned') {
          this.teammates.set(aid, { name: r.name || '', color: r.color || '', team: r.team_name || '' });
          ev.info = `teammate ${r.name || ''}`.trim();
        } else if (r.status === 'async_launched' || r.isAsync) {
          ev.info = 'running in background';
        } else if (r.totalTokens != null || r.status === 'completed') {
          const full = textOf(r.content);
          ev.result = { tokens: r.totalTokens || 0, tools: r.totalToolUseCount || 0, ms: r.totalDurationMs || 0, text: clip(full, 1500), chars: full.length };
          ev.info = `${fmtK(r.totalTokens || 0)} tokens · ${r.totalToolUseCount || 0} tool calls`;
          if (aid) this.tasks.set(aid, { status: 'completed', summary: '', t, toolUseId: ev.id });
        }
        break;
      }
      case 'Workflow': {
        if (r.runId) {
          ev.run = r.runId;
          const w = this.workflow(r.runId);
          w.ev = ev;
          w.taskId = w.taskId || r.taskId || '';
          w.name = w.name || r.workflowName || ev.wfName || '';
        }
        if (r.status === 'async_launched') ev.info = 'running in background';
        break;
      }
      default:
        break;
    }
  }

  onSystem(a, r) {
    const t = ts(r.timestamp);
    if (r.subtype === 'compact_boundary') {
      a.compactions++;
      a.events.push({ t, a: a.id, k: 'compact' });
    }
  }

  findToolEvent(toolUseId) {
    const ev = this.main.toolEvents.get(toolUseId);
    if (ev) return ev;
    for (const s of this.subs.values()) {
      const e = s.toolEvents.get(toolUseId);
      if (e) return e;
    }
    return null;
  }

  // ---------- derived views ----------

  subStatus(a, live) {
    const task = this.tasks.get(a.id);
    if (task && /kill|cancel|stop/i.test(task.status)) return 'stopped';
    if (task && /fail|error/i.test(task.status)) return 'failed';
    if (a.meta.finished || (task && /complete|done|success/i.test(task.status))) return 'done';
    const link = this.links.get(a.id) || (a.toolUseId ? this.findToolEvent(a.toolUseId) : null);
    if (link?.result) return 'done';
    if (a.kind === 'workflow') {
      const w = this.workflows.get(a.runId);
      if (w && (w.results.has(a.id) || w.status === 'done')) return 'done';
    }
    if (!live) return a.lastStop === 'end_turn' && !a.pending.size ? 'done' : 'stopped';
    if (a.kind === 'teammate' && a.lastStop === 'end_turn' && !a.pending.size) return 'idle';
    if (a.lastStop === 'end_turn' && !a.pending.size && Date.now() - a.lastTs > 120_000) return 'done';
    return 'running';
  }

  agentInfo(a, live) {
    const tok = a.tokens();
    const cost = a.cost();
    if (a.kind === 'main') {
      return {
        id: 'main', kind: 'main', parent: null, type: 'main', name: '', desc: this.title, status: null,
        startedAt: a.firstTs, lastTs: a.lastTs, model: prettyModel(a.model), toolCalls: a.toolCalls, errors: a.errors,
        tokens: tok, cost: cost.usd, now: live ? a.now() : null, result: '', task: '', runId: '', phase: '', color: '',
        ctx: a.ctx, top: topOf(a.toolCounts, 3),
      };
    }
    const link = this.links.get(a.id) || (a.toolUseId ? this.findToolEvent(a.toolUseId) : null);
    const w = a.runId ? this.workflows.get(a.runId) : null;
    const started = w?.started.get(a.id);
    const mate = this.teammates.get(a.id);
    const status = this.subStatus(a, live);
    return {
      id: a.id,
      kind: a.kind,
      parent: a.parentAgentId || (link && link.a !== 'main' ? link.a : 'main'),
      type: a.kind === 'workflow' ? (w?.name || 'workflow') : a.type || link?.subType || 'agent',
      name: a.name || mate?.name || link?.subName || '',
      desc: a.desc || link?.subDesc || started?.label || one(a.task, 140),
      status,
      startedAt: a.firstTs || link?.t || 0,
      lastTs: a.lastTs,
      model: prettyModel(a.model),
      toolCalls: a.toolCalls,
      errors: a.errors,
      tokens: tok,
      cost: cost.usd,
      now: live && status === 'running' ? a.now() : null,
      result: status === 'done' ? link?.result?.text || w?.resultText.get(a.id) || clip(a.lastText, 1500) : '',
      resultChars: status === 'done' ? link?.result?.chars || w?.resultLen.get(a.id) || a.lastText.length : 0,
      task: clip(a.task, 700),
      runId: a.runId,
      phase: a.phase || started?.phase || '',
      color: a.color || mate?.color || '',
      ctx: a.ctx,
      top: topOf(a.toolCounts, 3),
    };
  }

  workflowInfo(w, live) {
    let running = 0;
    let done = 0;
    let failed = 0;
    const phases = {};
    let first = 0;
    for (const id of w.agents) {
      const a = this.subs.get(id);
      if (!a) continue;
      const st = this.subStatus(a, live);
      if (st === 'running') running++;
      else if (st === 'failed') failed++;
      else done++;
      if (a.phase) phases[a.phase] = (phases[a.phase] || 0) + 1;
      if (a.firstTs && (!first || a.firstTs < first)) first = a.firstTs;
    }
    const task = w.taskId ? this.tasks.get(w.taskId) : null;
    let status = w.status === 'done' ? 'done' : task ? (/fail|error|kill/i.test(task.status) ? 'failed' : 'done') : live ? 'running' : 'stopped';
    return {
      runId: w.runId,
      name: w.name || w.ev?.wfName || w.ev?.target || w.runId,
      status,
      total: w.agents.size,
      running: status === 'running' ? running : 0,
      done,
      failed,
      phases,
      startedAt: w.ev?.t || first,
      finishedAt: w.finishedAt || task?.t || 0,
      summary: w.summary || task?.summary || '',
    };
  }

  filesMerged() {
    const m = new Map();
    for (const a of [this.main, ...this.subs.values()]) {
      for (const f of a.files.values()) {
        const g = m.get(f.path) || { path: f.path, reads: 0, edits: 0, added: 0, removed: 0, isNew: false };
        g.reads += f.reads;
        g.edits += f.edits;
        g.added += f.added;
        g.removed += f.removed;
        g.isNew = g.isNew || f.isNew;
        m.set(f.path, g);
      }
    }
    return [...m.values()].sort((x, y) => y.edits - x.edits || y.added + y.removed - (x.added + x.removed) || y.reads - x.reads);
  }

  // A helper's kind of work, as Team view and Recap name it: its subagent
  // type, its workflow's name, or a teammate's type.
  agentType(a) {
    if (a.kind === 'main') return 'main';
    const link = this.links.get(a.id) || (a.toolUseId ? this.findToolEvent(a.toolUseId) : null);
    const w = a.runId ? this.workflows.get(a.runId) : null;
    return a.kind === 'workflow' ? w?.name || 'workflow' : a.type || link?.subType || 'agent';
  }

  // Tokens and their price per local day, model and agent ("main", or a
  // helper as "kind:type"), for Recap's cost-by-model breakdown. One row:
  // [day, model, agent, messages, in, out, cacheRead, cacheWrite, $in, $out, $cacheRead, $cacheWrite, $webSearch].
  usage() {
    const acc = new Map();
    for (const a of [this.main, ...this.subs.values()]) {
      const who = a.kind === 'main' ? 'main' : `${a.kind}:${this.agentType(a)}`;
      for (const r of a.msgs.values()) {
        if (!r.t) continue;
        const day = dayKeyOf(r.t);
        const model = prettyModel(r.model) || r.model;
        const k = `${day}|${model}|${who}`;
        let g = acc.get(k);
        if (!g) acc.set(k, (g = [day, model, who, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        const c = costParts(r.model, r, r.speed);
        g[3]++;
        g[4] += r.in;
        g[5] += r.out;
        g[6] += r.cr;
        g[7] += r.cw5 + r.cw1;
        g[8] += c.in;
        g[9] += c.out;
        g[10] += c.cr;
        g[11] += c.cw;
        g[12] += c.ws;
      }
    }
    return [...acc.values()].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)).map((g) => g.map((v, i) => (i >= 8 ? Math.round(v * 1e5) / 1e5 : v)));
  }

  byModel() {
    const acc = {};
    for (const a of [this.main, ...this.subs.values()]) {
      for (const r of a.msgs.values()) {
        const k = prettyModel(r.model) || r.model;
        const g = (acc[k] ||= { in: 0, out: 0, cr: 0, cw: 0, usd: 0, messages: 0 });
        g.in += r.in;
        g.out += r.out;
        g.cr += r.cr;
        g.cw += r.cw5 + r.cw1;
        g.usd += costOf(r.model, r, r.speed).usd;
        g.messages++;
      }
    }
    return acc;
  }

  summary() {
    const main = this.main;
    const subs = [...this.subs.values()];
    const tMain = main.tokens();
    const tSubs = emptyTok();
    let cSubs = 0;
    const cMain = main.cost();
    let unknown = cMain.unknown;
    let toolCalls = main.toolCalls;
    let errors = main.errors;
    let endedAt = main.lastTs;
    let nSub = 0;
    let nWf = 0;
    // Did it end on a failure: the main agent's last finished tool call failed,
    // or its last request to the model came back as an error.
    let lastStep = null;
    for (const e of main.events) if (((e.k === 'tool' && e.end) || e.k === 'error') && (!lastStep || e.t >= lastStep.t)) lastStep = e;
    for (const a of subs) {
      addTok(tSubs, a.tokens());
      const c = a.cost();
      cSubs += c.usd;
      unknown = unknown || c.unknown;
      toolCalls += a.toolCalls;
      errors += a.errors;
      if (a.lastTs > endedAt) endedAt = a.lastTs;
      if (a.kind === 'workflow') nWf++;
      else nSub++;
    }
    let edited = 0;
    let added = 0;
    let removed = 0;
    for (const f of this.filesMerged()) {
      if (!f.edits) continue;
      edited++;
      added += f.added;
      removed += f.removed;
    }
    return {
      id: this.id,
      root: this.root,
      file: this.file,
      cwd: main.cwd,
      project: projectName(main.cwd, this.file),
      branch: main.branch,
      version: main.version,
      title: this.title,
      firstPrompt: clip(main.firstPrompt, 700),
      lastPrompt: clip(main.lastPrompt || this.lastPromptRec, 700),
      lastText: clip(main.lastText, 900),
      startedAt: main.firstTs,
      endedAt,
      model: prettyModel(main.model),
      models: Object.keys(this.byModel()),
      tokens: { main: tMain, subs: tSubs },
      cost: { main: cMain.usd, subs: cSubs, total: cMain.usd + cSubs, unknown },
      costState: this.costState,
      toolCalls,
      prompts: main.prompts,
      errors,
      endedFailed: !!lastStep && (lastStep.k === 'error' || lastStep.ok === false),
      subagents: nSub,
      workflowAgents: nWf,
      workflows: this.workflows.size,
      filesEdited: edited,
      linesAdded: added,
      linesRemoved: removed,
      prs: [...this.prs.values()],
      compactions: main.compactions,
      empty: main.prompts === 0 && toolCalls === 0 && subs.length === 0,
      days: this.days(),
      tools: topTools([main, ...subs]).slice(0, 8),
      modelUsd: Object.fromEntries(Object.entries(this.byModel()).map(([k, v]) => [k, Math.round(v.usd * 1000) / 1000])),
      usage: this.usage(),
    };
  }

  // Activity per local calendar day, so a session that crosses midnight counts on both days.
  days() {
    const out = {};
    const day = (t) => {
      const d = new Date(t);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return (out[k] ||= { tok: 0, usd: 0, tools: 0, prompts: 0, edits: 0, add: 0, del: 0, active: 0, b: new Set() });
    };
    for (const a of [this.main, ...this.subs.values()]) {
      for (const r of a.msgs.values()) {
        if (!r.t) continue;
        const g = day(r.t);
        g.tok += r.in + r.out + r.cr + r.cw5 + r.cw1;
        g.usd += costOf(r.model, r, r.speed).usd;
        g.b.add(Math.floor(r.t / 300_000));
      }
      for (const e of a.events) {
        if (!e.t) continue;
        const g = day(e.t);
        g.b.add(Math.floor(e.t / 300_000));
        if (e.k === 'tool') {
          g.tools++;
          if (e.cat === 'edit' && e.ok !== false) {
            g.edits++;
            g.add += e.add || 0;
            g.del += e.del || 0;
          }
        } else if (e.k === 'prompt' && a.kind === 'main') g.prompts++;
      }
    }
    for (const g of Object.values(out)) {
      g.active = g.b.size * 5; // minutes, in 5-minute slots with any activity
      g.usd = Math.round(g.usd * 1000) / 1000;
      delete g.b;
    }
    return out;
  }

  // Text that History search looks through: title, prompts, files,
  // commands and other tool targets, subagent tasks.
  searchText() {
    const parts = new Set([this.title, this.main.cwd, this.main.branch]);
    for (const a of [this.main, ...this.subs.values()]) {
      if (a.desc) parts.add(a.desc);
      if (a.task) parts.add(a.task.slice(0, 500));
      for (const e of a.events) {
        if (e.k === 'prompt' || e.k === 'command') parts.add(e.text);
        else if (e.k === 'tool' && e.target) parts.add(e.target);
      }
      for (const f of a.files.keys()) parts.add(f);
    }
    const s = [...parts].filter(Boolean).join('\n');
    return s.length > 120_000 ? s.slice(0, 120_000) : s;
  }

  detail({ events = 400, agent = '', from = 0, to = 0, live = false } = {}) {
    const sum = this.summary();
    const now = Date.now();
    const agents = [this.main, ...this.subs.values()];
    let evs = [];
    for (const a of agents) {
      if (agent && a.id !== agent) continue;
      for (const e of a.events) evs.push(e);
    }
    evs.sort((x, y) => y.t - x.t);
    const totalEvents = evs.length;
    evs = evs.slice(0, events).map(serializeEvent);
    const start = from || sum.startedAt || now;
    const end = to || (live ? now : sum.endedAt || start);
    const lanes = {};
    const marks = {};
    for (const a of agents) {
      lanes[a.id] = laneOf(a, start, end, live ? now : a.lastTs);
      marks[a.id] = marksOf(a, start, end);
    }
    return {
      ...sum,
      live,
      agents: agents.map((a) => this.agentInfo(a, live)),
      workflows: [...this.workflows.values()].map((w) => this.workflowInfo(w, live)),
      events: evs,
      totalEvents,
      window: [start, end],
      lanes,
      marks,
      context: downsample(this.main.ctxSeries, 320),
      ctx: this.main.ctx,
      ctxWindow: contextWindow(this.main.model, this.main.requestedModel),
      tools: topTools(agents),
      files: this.filesMerged().slice(0, 80),
      byModel: this.byModel(),
    };
  }
}

// Local calendar day of a timestamp (YYYY-MM-DD in this computer's timezone).
function dayKeyOf(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- serialisation helpers ----------

const EVENT_FIELDS = ['t', 'a', 'k', 'id', 'name', 'cat', 'target', 'desc', 'end', 'ok', 'info', 'text', 'status', 'sub', 'run', 'subType', 'subDesc', 'subName', 'bg', 'tail', 'doneAt', 'doneStatus', 'reread', 'wfName'];

function serializeEvent(e) {
  const o = {};
  for (const k of EVENT_FIELDS) if (e[k] !== undefined && e[k] !== '' && e[k] !== null) o[k] = e[k];
  if (e.k === 'tool') o.short = shortTool(e.name);
  if (e.result) o.result = { tokens: e.result.tokens, tools: e.result.tools, ms: e.result.ms, text: clip(e.result.text, 700) };
  return o;
}

function laneOf(a, start, end, openEnd) {
  const segs = [];
  for (const e of a.events) {
    if (e.k !== 'tool') continue;
    const s = e.t;
    let f = e.end || (a.pending.has(e.id) ? openEnd : s);
    if (f < start || s > end) continue;
    f = Math.max(f, s + 400);
    segs.push([Math.max(s, start), Math.min(f, end), e.cat, `${shortTool(e.name)} ${e.target || ''}`.trim().slice(0, 90), e.ok === false ? 0 : 1, 1]);
  }
  segs.sort((x, y) => x[0] - y[0]);
  let gap = Math.max(1, (end - start) / 1200);
  let out = segs;
  while (out.length > 900) {
    const merged = [];
    for (const sg of out) {
      const last = merged[merged.length - 1];
      if (last && last[2] === sg[2] && sg[0] - last[1] <= gap) {
        last[1] = Math.max(last[1], sg[1]);
        last[4] = last[4] && sg[4];
        last[5] += sg[5];
        if (last[5] === 2) last[3] = last[3].split(' ')[0];
      } else merged.push(sg.slice());
    }
    if (merged.length === out.length) break;
    out = merged;
    gap *= 4;
  }
  return out;
}

// The moments that matter over the whole session, even when the events sent
// are only the latest: your prompts carry their words (one line), so a long
// session's replay can say what you asked in every request.
function marksOf(a, start, end) {
  const out = [];
  for (const e of a.events) {
    if (e.t < start || e.t > end) continue;
    if (e.k === 'prompt') out.push([e.t, e.k, String(e.text || '').slice(0, 240)]);
    else if (e.k === 'compact' || e.k === 'error' || e.k === 'interrupt' || e.k === 'notify' || e.k === 'command') out.push([e.t, e.k]);
  }
  if (out.length <= 600) return out;
  // too many to draw: every prompt and every stop stays (the replay is told by them); the rest thin out
  const keep = (m) => m[1] === 'prompt' || m[1] === 'interrupt';
  const rest = out.filter((m) => !keep(m));
  const room = Math.max(0, 600 - (out.length - rest.length));
  const step = Math.ceil(rest.length / Math.max(1, room));
  let n = 0;
  return out.filter((m) => keep(m) || (room > 0 && n++ % step === 0));
}

function downsample(series, max) {
  if (series.length <= max) return series.slice();
  const step = series.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(series[Math.floor(i * step)]);
  out[out.length - 1] = series[series.length - 1];
  return out;
}

function topTools(agents) {
  const m = new Map();
  for (const a of agents) for (const [k, v] of a.toolCounts) m.set(k, (m.get(k) || 0) + v);
  return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 24);
}

function topOf(map, n) {
  return [...map.entries()].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => [shortTool(k), v]);
}

function fmtK(n) {
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
}

async function readdirSafe(dir) {
  try {
    return await fs.promises.readdir(dir);
  } catch {
    return [];
  }
}
