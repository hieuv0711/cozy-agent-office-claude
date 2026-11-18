import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../tooltip.css';

// One tooltip for the whole page, in the app's own look. Anything with a
// `data-tip` shows it: on hover after a short pause (at once when moving on
// from another tip), and at once on keyboard focus. Optional extras:
// `data-tip-title` (a heading in bold), `data-tip-key` (its keyboard key) and
// `data-tip-note` (a quieter last line).
// While it shows, the element is described by it (aria-describedby). A click,
// Escape, scrolling or leaving hides it.

const ID = 'ao-tip';
/** How long the pointer rests on something before its tip shows (ms). */
const DELAY = 300;
/** After a tip hides, the next one shows at once for this long (ms). */
const WARM = 450;

/** The attributes that give an element a tip. */
export function tip(text: string, title?: string, key?: string, note?: string): Record<string, string> {
  const a: Record<string, string> = { 'data-tip': text };
  if (title) a['data-tip-title'] = title;
  if (key) a['data-tip-key'] = key;
  if (note) a['data-tip-note'] = note;
  return a;
}

interface Shown {
  el: HTMLElement;
  title: string;
  text: string;
  key: string;
  note: string;
}

const read = (el: HTMLElement) => ({ title: el.dataset.tipTitle ?? '', text: el.dataset.tip ?? '', key: el.dataset.tipKey ?? '', note: el.dataset.tipNote ?? '' });
const tipped = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('[data-tip]') : null);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function TooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const hideNow = useRef<() => void>(() => undefined);

  useEffect(() => {
    let timer = 0;
    let cur: HTMLElement | null = null;
    let pending: HTMLElement | null = null;
    // clicked or dismissed with Escape: no tip again until the pointer leaves it
    let dismissed: HTMLElement | null = null;
    // the element's own aria-describedby, put back when its tip goes
    let own: string | null = null;
    let lastHide = -Infinity;
    const watch = new MutationObserver(() => {
      if (!cur) return;
      if (!cur.dataset.tip) hide();
      else setShown({ el: cur, ...read(cur) });
    });

    const show = (el: HTMLElement) => {
      clearTimeout(timer);
      pending = null;
      if (!el.isConnected || !el.dataset.tip) return;
      if (cur && cur !== el) release(cur);
      if (cur !== el) {
        cur = el;
        own = el.getAttribute('aria-describedby');
        el.setAttribute('aria-describedby', own ? `${own} ${ID}` : ID);
        watch.disconnect();
        watch.observe(el, { attributes: true, attributeFilter: ['data-tip', 'data-tip-title', 'data-tip-key', 'data-tip-note'] });
      }
      setShown({ el, ...read(el) });
    };
    const release = (el: HTMLElement) => {
      if (own) el.setAttribute('aria-describedby', own);
      else el.removeAttribute('aria-describedby');
      own = null;
    };
    const hide = () => {
      clearTimeout(timer);
      pending = null;
      watch.disconnect();
      if (cur) {
        release(cur);
        cur = null;
        lastHide = performance.now();
        setShown(null);
      }
    };
    hideNow.current = hide;

    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = tipped(e.target);
      if (!el || el === cur || el === pending || el === dismissed) return;
      clearTimeout(timer);
      if (cur || performance.now() - lastHide < WARM) show(el);
      else {
        pending = el;
        timer = window.setTimeout(() => show(el), DELAY);
      }
    };
    const out = (e: PointerEvent) => {
      const el = tipped(e.target);
      if (!el) return;
      const to = e.relatedTarget;
      if (to instanceof Node && el.contains(to)) return;
      if (el === dismissed) dismissed = null;
      if (el === pending) {
        clearTimeout(timer);
        pending = null;
      }
      if (el === cur) hide();
    };
    const down = (e: PointerEvent) => {
      dismissed = tipped(e.target);
      hide();
    };
    const focusIn = (e: FocusEvent) => {
      const el = tipped(e.target);
      if (!el || el === dismissed || !(e.target instanceof Element)) return;
      // the keyboard's focus only: a click focuses too, and that hides the tip
      let keyboard = false;
      try {
        keyboard = e.target.matches(':focus-visible');
      } catch {
        keyboard = false;
      }
      if (keyboard) show(el);
    };
    const focusOut = (e: FocusEvent) => {
      if (tipped(e.target) === cur) hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && cur) {
        dismissed = cur;
        hide();
      }
    };
    const away = () => hide();
    // scrolling what holds the element (not some other box on the page)
    const scrolled = (e: Event) => {
      if (cur && (e.target === document || (e.target instanceof Node && e.target.contains(cur)))) hide();
    };

    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerout', out, true);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('focusin', focusIn, true);
    document.addEventListener('focusout', focusOut, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', scrolled, { capture: true, passive: true });
    document.addEventListener('visibilitychange', away);
    window.addEventListener('resize', away);
    return () => {
      hide();
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerout', out, true);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('focusin', focusIn, true);
      document.removeEventListener('focusout', focusOut, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', scrolled, true);
      document.removeEventListener('visibilitychange', away);
      window.removeEventListener('resize', away);
    };
  }, []);

  // above the element (below it when there's no room), kept on screen; the
  // tags over the scene move with the people, so their tips follow them
  useLayoutEffect(() => {
    if (!shown) return;
    let raf = 0;
    const place = () => {
      const t = box.current;
      if (!t) return;
      const r = shown.el.getBoundingClientRect();
      if (!shown.el.isConnected || (r.width === 0 && r.height === 0)) {
        hideNow.current();
        return;
      }
      const w = t.offsetWidth;
      const h = t.offsetHeight;
      const gap = 8;
      const below = r.top - gap - h < 6 && r.bottom + gap + h <= innerHeight - 6;
      const top = below ? r.bottom + gap : Math.max(6, r.top - gap - h);
      const cx = r.left + r.width / 2;
      const left = clamp(cx - w / 2, 8, innerWidth - w - 8);
      t.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      t.style.setProperty('--arrow-x', `${Math.round(clamp(cx - left, 12, w - 12))}px`);
      t.dataset.side = below ? 'below' : 'above';
      t.style.visibility = 'visible';
    };
    place();
    if (shown.el.closest('.labels')) {
      const loop = () => {
        place();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  if (!shown) return null;
  return createPortal(
    <div id={ID} role="tooltip" className="tip" ref={box} style={{ visibility: 'hidden' }}>
      {shown.title && (
        <span className="tip-title">
          {shown.title}
          {shown.key && <kbd>{shown.key}</kbd>}
        </span>
      )}
      {shown.text && <span className="tip-text">{shown.text}</span>}
      {shown.note && <span className="tip-note">{shown.note}</span>}
      {!shown.title && shown.key && (
        <span className="tip-text">
          Key <kbd>{shown.key}</kbd>
        </span>
      )}
    </div>,
    document.body,
  );
}
