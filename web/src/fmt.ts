import type { Tok } from './api';

export function fmtTok(n: number | undefined): string {
  const v = n || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k';
  return String(Math.round(v));
}

export function fmtUsd(n: number | undefined): string {
  const v = n || 0;
  if (v >= 100) return '$' + Math.round(v).toLocaleString();
  if (v >= 0.005) return '$' + v.toFixed(2);
  if (v > 0) return '<$0.01';
  return '$0';
}

export function fmtDur(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return '0 s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 10) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export function clock(t: number): string {
  if (!t) return '';
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function clockSec(t: number): string {
  if (!t) return '';
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function dayLabel(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function totalTok(t?: Tok | null): number {
  return t ? t.in + t.out + t.cr + t.cw5 + t.cw1 : 0;
}

export function sumTok(a?: Tok | null, b?: Tok | null): Tok {
  const z = { in: 0, out: 0, cr: 0, cw5: 0, cw1: 0, ws: 0 };
  for (const t of [a, b]) {
    if (!t) continue;
    z.in += t.in;
    z.out += t.out;
    z.cr += t.cr;
    z.cw5 += t.cw5;
    z.cw1 += t.cw1;
    z.ws += t.ws || 0;
  }
  return z;
}

// Final messages are Markdown; show them as calm plain text.
export function plain(md: string | undefined): string {
  if (!md) return '';
  return md
    .replace(/```\w*\n?/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]\n]+)\]\((?:https?:|\/)[^)\s]*\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\|[\s:|-]+\|$/gm, '')
    .replace(/^\|(.*)\|$/gm, (_, row: string) => row.split('|').map((c) => c.trim()).join(' · '))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function pct(n: number): string {
  return n >= 10 ? `${Math.round(n)}%` : `${n.toFixed(1)}%`;
}
