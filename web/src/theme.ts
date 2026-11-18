// Fansub Night: letterbox ink, subtitle white, and one yellow that only ever
// means "waiting for you". Text greys are subtitle white at lower strength.
export const C = {
  bg: '#0E1018',
  text: '#F6F1E4',
  text2: '#DCD6C8',
  muted: '#B4AE9F',
  faint: '#8C8778',
  work: '#F6F1E4',
  need: '#FFD84A',
  idle: '#8C8778',
  bot: '#A9B8F0',
  pink: '#EC8FB6',
  mint: '#8FD19E',
  red: '#F27D6B',
  accent: '#F6F1E4',
};

// Activity colours follow the validated categorical slots (fixed order); yellow
// stays reserved for "asks you".
export const CAT: Record<string, { label: string; color: string; tag: string }> = {
  read: { label: 'Read and search', color: '#3987E5', tag: 'READ' },
  edit: { label: 'Edit and write', color: '#D55181', tag: 'EDIT' },
  run: { label: 'Run a command', color: '#D95926', tag: 'RUN' },
  agent: { label: 'Subagents', color: '#9085E9', tag: 'AGENT' },
  web: { label: 'Web', color: '#199E70', tag: 'WEB' },
  ask: { label: 'Asks you', color: '#FFD84A', tag: 'ASK' },
  plan: { label: 'Plan', color: '#9A9488', tag: 'PLAN' },
  mcp: { label: 'MCP tools', color: '#7A7568', tag: 'MCP' },
  other: { label: 'Other', color: '#7A7568', tag: 'TOOL' },
};

export function catOf(c: string | undefined) {
  return CAT[c || 'other'] || CAT.other;
}

// Speaker colours: light enough to read as caption names on ink, never yellow.
const SESSION_COLORS = ['#7FB8E8', '#EF9A85', '#93CF9B', '#B8A4EF', '#EC8FB6', '#5FC4B8', '#F2B483', '#8FA2F2', '#A6DCC0', '#D79BE0'];

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function sessionColor(id: string): string {
  return SESSION_COLORS[hash(id) % SESSION_COLORS.length];
}

export const STATUS = {
  working: { label: 'Working', color: C.work },
  'needs-you': { label: 'Needs you', color: C.need },
  idle: { label: 'Idle', color: C.idle },
} as const;

export const SUB_STATUS: Record<string, { label: string; color: string }> = {
  running: { label: 'Running', color: C.work },
  idle: { label: 'Standing by', color: C.idle },
  done: { label: 'Done', color: C.mint },
  failed: { label: 'Failed', color: C.red },
  stopped: { label: 'Stopped', color: C.faint },
};
