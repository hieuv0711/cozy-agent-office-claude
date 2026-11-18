// API list prices in USD per million tokens:
// [input, output, cache read, cache write (5 min), cache write (1 hour)].
// Checked against Claude Code's own cost-state records on this machine for
// Fable 5.2, Opus 5.5 and Haiku 5.5 (exact match). Other rows follow the
// published price list. On a subscription plan this is the size of the work
// at API prices, not a bill.
const TABLE = {
  'claude-fable-5-2': [8, 40, 0.2, 10, 16],
  'claude-mythos-5-2': [8, 40, 0.2, 10, 16],
  'claude-fable-5-1': [10, 50, 0.25, 12.5, 20],
  'claude-mythos-5-1': [10, 50, 0.25, 12.5, 20],
  'claude-fable-5': [10, 50, 1, 12.5, 20],
  'claude-mythos-5': [10, 50, 1, 12.5, 20],
  'claude-opus-5-5': [4, 20, 0.2, 5, 8],
  'claude-opus-5': [5, 25, 0.5, 6.25, 10],
  'claude-opus-4-8': [5, 25, 0.5, 6.25, 10],
  'claude-opus-4-7': [5, 25, 0.5, 6.25, 10],
  'claude-opus-4-6': [5, 25, 0.5, 6.25, 10],
  'claude-opus-4-5': [5, 25, 0.5, 6.25, 10],
  'claude-opus-4-1': [15, 75, 1.5, 18.75, 30],
  'claude-opus-4': [15, 75, 1.5, 18.75, 30],
  'claude-sonnet-5-5': [2, 10, 0.1, 2.5, 4],
  'claude-sonnet-5': [2, 10, 0.2, 2.5, 4],
  'claude-sonnet-4-6': [3, 15, 0.3, 3.75, 6],
  'claude-sonnet-4-5': [3, 15, 0.3, 3.75, 6],
  'claude-sonnet-4': [3, 15, 0.3, 3.75, 6],
  'claude-3-7-sonnet': [3, 15, 0.3, 3.75, 6],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125, 0.2],
  'claude-haiku-4-5': [1, 5, 0.1, 1.25, 2],
  'claude-3-5-haiku': [0.8, 4, 0.08, 1, 1.6],
};
const KEYS = Object.keys(TABLE).sort((a, b) => b.length - a.length);
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches

export function normModel(model) {
  return String(model || '')
    .toLowerCase()
    .replace(/\[1m\]$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/^(?:us|eu|apac|global)\.anthropic\./, '')
    .replace(/^anthropic\./, '')
    .replace(/@.*$/, '')
    .replace(/-v\d+:\d+$/, '');
}

export function priceKey(model) {
  const m = normModel(model);
  if (TABLE[m]) return m;
  return KEYS.find((k) => m.startsWith(k + '-')) || null;
}

// u: { in, out, cr, cw5, cw1, ws }  →  USD (0 when the model is unknown)
export function costOf(model, u, speed) {
  const key = priceKey(model);
  if (!key) return { usd: 0, known: false };
  const p = TABLE[key];
  let mult = speed === 'fast' ? 2 : 1;
  // Haiku 5.5 bills prompts over 100K tokens at 5x.
  if (key === 'claude-haiku-5-5' && u.in + u.cr + u.cw5 + u.cw1 > 100_000) mult *= 5;
  const usd = ((u.in * p[0] + u.out * p[1] + u.cr * p[2] + u.cw5 * p[3] + u.cw1 * p[4]) * mult) / 1e6 + (u.ws || 0) * WEB_SEARCH_USD;
  return { usd, known: true };
}

// The same price split by what was paid for: input, output, cache read, cache
// write (both lifetimes) and web searches. The parts add up to costOf().usd.
export function costParts(model, u, speed) {
  const key = priceKey(model);
  const ws = (u.ws || 0) * WEB_SEARCH_USD;
  if (!key) return { in: 0, out: 0, cr: 0, cw: 0, ws: 0, usd: 0, known: false };
  const p = TABLE[key];
  let mult = speed === 'fast' ? 2 : 1;
  if (key === 'claude-haiku-5-5' && u.in + u.cr + u.cw5 + u.cw1 > 100_000) mult *= 5;
  const k = mult / 1e6;
  const parts = { in: u.in * p[0] * k, out: u.out * p[1] * k, cr: u.cr * p[2] * k, cw: (u.cw5 * p[3] + u.cw1 * p[4]) * k, ws, known: true };
  return { ...parts, usd: parts.in + parts.out + parts.cr + parts.cw + parts.ws };
}

export function contextWindow(model, requested) {
  if (/\[1m\]/i.test(String(requested || ''))) return 1_000_000;
  const m = normModel(model);
  if (/fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[5678]|sonnet-4-6/.test(m)) return 1_000_000;
  return 200_000;
}

export function prettyModel(model) {
  const m = normModel(model).replace(/^claude-/, '');
  if (!m || m === '<synthetic>') return '';
  const parts = m.split('-');
  if (/^\d+$/.test(parts[0])) {
    // old naming: 3-7-sonnet
    const fam = parts.find((p) => !/^\d+$/.test(p)) || '';
    const ver = parts.filter((p) => /^\d+$/.test(p)).join('.');
    return `${cap(fam)} ${ver}`.trim();
  }
  const fam = parts[0];
  const ver = parts.slice(1).filter((p) => /^\d+$/.test(p)).join('.');
  return `${cap(fam)} ${ver}`.trim();
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
