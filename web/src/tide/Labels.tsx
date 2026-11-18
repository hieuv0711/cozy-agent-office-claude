import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { OfficeSession, OfficeSub } from '../api';
import { cameraCmd, cameraUi } from '../office/camera';
import { actionText, botLabel, botsFor, helperOf, helperRel, helperTip, helperTitle } from '../lib/session';
import { tip } from '../panels/Tooltip';
import { sessionColor } from '../theme';
import type { Placement } from './crew/Crew';

// Name tags over the creatures are plain DOM, placed every frame by projecting
// each creature's label point through the camera. Overlaps are resolved in
// screen space: the lowest tag stays, any tag it would cover moves up.
// A helper's tag says whose helper it is ("Explorer for web-shop-81"), and a
// thin line runs from it to that session's tag while either one is pointed at
// or focused, and while the session is selected.

type Box = { l: number; t: number; r: number; b: number };

const toward = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));

/**
 * The line from a helper's tag to its session's: from the top of the helper's
 * tag (its foot, when the session's tag is lower down) to the nearest edge of
 * the session's, in an arc that rises more the longer it is, so two lines to
 * one session part ways and clear the tags between. None when they touch.
 */
function linkPath(h: Box, p: Box): { d: string; x: number; y: number } | null {
  const m = 3;
  const down = p.t > h.b;
  const sx = (h.l + h.r) / 2;
  const sy = down ? h.b + m : h.t - m;
  const px = toward(sx, p.l - m, p.r + m);
  const py = toward(sy, p.t - m, p.b + m);
  const dx = px - sx;
  const dy = py - sy;
  const len = Math.hypot(dx, dy);
  if (len < 24) return null;
  // bowed up (down for a line that runs down), or sideways for one straight up or down
  let nx = -dy / len;
  let ny = dx / len;
  if ((ny > 0) !== down) {
    nx = -nx;
    ny = -ny;
  }
  const bow = Math.min(170, len * 0.24);
  const cx = (sx + px) / 2 + nx * bow;
  const cy = (sy + py) / 2 + ny * bow;
  const f = (n: number) => n.toFixed(1);
  return { d: `M${f(sx)} ${f(sy)}Q${f(cx)} ${f(cy)} ${f(px)} ${f(py)}`, x: px, y: py };
}

/**
 * A tag's width and height, and how much of it sits above its point: all of
 * it, except the second line of a quiet tag (an idle session's), which only
 * shows while the tag is pointed at or focused. That line hangs below, so the
 * name and its "+2" stay where they were instead of jumping up from under the
 * pointer.
 */
function measure(el: HTMLElement): [number, number, number] {
  const h = el.offsetHeight;
  const more = el.classList.contains('quiet') ? (el.querySelector<HTMLElement>(':scope > .chip-sub')?.offsetHeight ?? 0) : 0;
  return [el.offsetWidth, h, h - more];
}

export function TideLabels({
  placed,
  sessions,
  selected,
  selectedAgent,
  onSelect,
  labelPos,
  cam,
  leftText = 'Left the tank',
}: {
  placed: Placement[];
  sessions: OfficeSession[];
  selected: string | null;
  selectedAgent: string | null;
  onSelect: (sid: string, agent: string | null) => void;
  labelPos: Map<string, THREE.Vector3>;
  cam: React.MutableRefObject<THREE.Camera | null>;
  /** What a session that just ended shows under its name. */
  leftText?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stream = cameraUi.use((s) => s.stream);
  const els = useRef(new Map<string, HTMLElement>());
  const sizes = useRef(new Map<string, [number, number, number]>());
  // the lines from helpers' tags to their sessions' (keyed like the helpers' tags)
  const links = useRef(new Map<string, SVGGElement>());
  const sel = useRef(selected);
  sel.current = selected;
  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const v = new THREE.Vector3();
    const boxOf = new Map<string, Box>();
    const drawn = new WeakMap<SVGGElement, string>();
    // the stage's size, kept by a resize observer (reading it every frame forces a layout)
    let w = host.current?.clientWidth ?? 0;
    let h = host.current?.clientHeight ?? 0;
    const ro = new ResizeObserver(() => {
      w = host.current?.clientWidth ?? w;
      h = host.current?.clientHeight ?? h;
    });
    if (host.current) ro.observe(host.current);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const camera = cam.current;
      const box = host.current;
      if (!camera || !box) return;
      if (frame++ % 20 === 0) for (const [k, el] of els.current) sizes.current.set(k, measure(el));
      const chips: { k: string; el: HTMLElement; left: number; top: number; w: number; h: number }[] = [];
      for (const [k, el] of els.current) {
        const p = labelPos.get(k);
        if (!p) {
          el.style.visibility = 'hidden';
          continue;
        }
        v.copy(p).project(camera);
        if (v.z > 1 || v.z < -1) {
          el.style.visibility = 'hidden';
          continue;
        }
        const [ew, eh, above] = sizes.current.get(k) || measure(el);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        // helpers' tags are centred on their point; everyone's take part in the overlap pass
        chips.push({ k, el, left: x - ew / 2, top: k.startsWith('bot:') ? y - eh / 2 : y - above, w: ew, h: eh });
      }
      chips.sort((a, b) => b.top - a.top);
      const boxes: Box[] = [];
      boxOf.clear();
      // the session whose tag, or one of whose helpers' tags, is pointed at or focused
      const lit = box.querySelector<HTMLElement>(':scope > :hover, :scope > :focus-visible')?.dataset.owner ?? null;
      for (const c of chips) {
        let top = c.top;
        for (let guard = 0; guard < 12; guard++) {
          const hit = boxes.find((p) => c.left < p.r - 4 && c.left + c.w > p.l + 4 && top < p.b && top + c.h > p.t);
          if (!hit) break;
          top = hit.t - c.h - 4;
        }
        const b = { l: c.left, r: c.left + c.w, t: top, b: top + c.h };
        boxes.push(b);
        // one hidden by the page's own rules (a phone's width) has no size, and no line
        if (c.w > 0) boxOf.set(c.k, b);
        c.el.style.transform = `translate3d(${Math.round(c.left)}px, ${Math.round(top)}px, 0)`;
        c.el.style.visibility = 'visible';
        c.el.classList.toggle('linked', lit !== null && c.el.dataset.owner === lit);
      }
      // each helper's line to its session's tag, while both tags are on screen
      for (const [k, g] of links.current) {
        const owner = g.dataset.owner ?? '';
        const hb = boxOf.get(k);
        const pb = boxOf.get(owner);
        const path = hb && pb ? linkPath(hb, pb) : null;
        if (!path) {
          if (g.style.display !== 'none') g.style.display = 'none';
          continue;
        }
        if (g.style.display === 'none') g.style.display = '';
        if (drawn.get(g) !== path.d) {
          drawn.set(g, path.d);
          for (const el of g.querySelectorAll('path')) el.setAttribute('d', path.d);
          const end = g.querySelector('circle');
          end?.setAttribute('cx', path.x.toFixed(1));
          end?.setAttribute('cy', path.y.toFixed(1));
        }
        g.classList.toggle('on', owner === lit || owner === sel.current);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [labelPos, cam]);
  const ref = (key: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(key, el);
    else {
      els.current.delete(key);
      sizes.current.delete(key);
    }
  };
  const linkRef = (key: string) => (g: SVGGElement | null) => {
    if (g) links.current.set(key, g);
    else links.current.delete(key);
  };

  // every working helper is an agent too: a small tag in its session's colour
  // (its name or task, and whose helper it is); the selected session's helpers
  // say what they do this moment; the tooltip has the whole story
  const helpers: { s: OfficeSession; b: OfficeSub; mine: boolean; last: number }[] = stream
    ? []
    : sessions.flatMap((s) => {
        const mine = selected === s.id;
        const { list, extra } = botsFor(s);
        return list
          .filter((b) => mine || b.status === 'running')
          .map((b, i, shown) => ({ s, b, mine, last: mine && i === shown.length - 1 && extra > 0 ? extra : 0 }));
      });

  return (
    <div className="labels" ref={host}>
      <svg className="links" aria-hidden="true">
        {helpers.map(({ s, b }) => (
          <g key={`link:${b.id}`} ref={linkRef(`bot:${b.id}`)} data-owner={s.id} style={{ ['--c' as string]: sessionColor(s.id), display: 'none' }}>
            <path className="link-under" />
            <path className="link-line" />
            <circle className="link-end" r="2.8" />
          </g>
        ))}
      </svg>
      {placed.map((p) => {
        if (stream && p.s.status !== 'needs-you' && p.s.id !== selected) return null;
        const status = p.departing ? 'left' : p.s.status;
        const quiet = status === 'idle' && selected !== p.s.id;
        return (
          <button
            key={p.s.id}
            ref={ref(p.s.id)}
            type="button"
            className={`chip ${status}${selected === p.s.id ? ' sel' : ''}${quiet ? ' quiet' : ''}`}
            data-owner={p.s.id}
            style={{ ['--c' as string]: sessionColor(p.s.id), visibility: 'hidden' }}
            onClick={() => onSelect(p.s.id, null)}
            onDoubleClick={() => {
              onSelect(p.s.id, null);
              cameraCmd({ type: 'focus', sid: p.s.id });
            }}
            aria-label={`${p.s.name}: ${p.departing ? leftText.toLowerCase() : actionText(p.s)}`}
          >
            <span className="chip-top">
              <span className={`dot ${status}`} aria-hidden="true" />
              <span className="chip-name">{p.s.name}</span>
              {p.s.subsRunning > 0 && (
                <span
                  className="chip-bots"
                  {...tip(
                    `${p.s.subsRunning} helper${p.s.subsRunning === 1 ? ' is' : 's are'} working on parts of ${p.s.name}'s task. The line${p.s.subsRunning === 1 ? ' joins it' : 's join them'} to this tag; ${p.s.subsRunning === 1 ? 'its tag says' : 'their tags say'} what ${p.s.subsRunning === 1 ? 'it does' : 'each one does'}.`,
                  )}
                >
                  +{p.s.subsRunning}
                </span>
              )}
            </span>
            <span className="chip-sub">{p.departing ? leftText : actionText(p.s)}</span>
          </button>
        );
      })}
      {helpers.map(({ s, b, mine, last }) => {
        const done = b.status !== 'running' && b.status !== 'idle';
        const t = last
          ? { title: `+${last} more`, text: `${last} more helper${last === 1 ? ' is' : 's are'} working for ${s.name}. The card's Subagents tab lists every one.`, note: '' }
          : helperTip(b, s.name);
        return (
          <button
            key={`bot:${b.id}`}
            ref={ref(`bot:${b.id}`)}
            type="button"
            className={`bot-chip ${mine ? '' : 'quiet'} ${done ? 'done' : ''} ${b.status === 'failed' ? 'failed' : ''}`}
            data-owner={s.id}
            style={{ visibility: 'hidden', ['--c' as string]: sessionColor(s.id) }}
            onClick={() => onSelect(s.id, b.id)}
            {...tip(t.text, t.title, undefined, t.note)}
            aria-label={last ? `${last} more helpers of ${s.name}` : `${helperTitle(b)}, ${helperOf(b, s.name)}: ${botLabel(b)}`}
          >
            {last ? (
              <span className="bot-what">+{last} more</span>
            ) : (
              <>
                <span className="bot-what">{mine ? botLabel(b) : helperTitle(b)}</span>
                <span className="bot-for">
                  {helperRel(b)} <b>{s.name}</b>
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
