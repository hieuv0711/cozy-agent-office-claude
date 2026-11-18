/**
 * YouTube as a music source, without loading YouTube's iframe_api script: we parse links, build a
 * youtube-nocookie embed URL, and drive the player over its postMessage "widget" protocol.
 * No audio code here: YouTube audio plays inside a cross-origin iframe we cannot analyse.
 */

export interface YtRef {
  videoId?: string;
  listId?: string;
}

export interface YtState {
  state: number; // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
  title?: string;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/; // PL…, UU…, RD…, OLAK5uy_…
const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const TRUSTED_ORIGIN = /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com$/;

/**
 * Accepts youtube.com/watch?v=, youtu.be/, /live/, /embed/, /shorts/, playlist?list=, &list=,
 * music.youtube.com, m.youtube.com, links without a scheme, and a bare 11-character video id.
 */
export function parseYouTube(url: string): YtRef | null {
  const raw = (url || '').trim();
  if (!raw) return null;
  if (VIDEO_ID.test(raw)) return { videoId: raw };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(?:www|m|music)\./, '');
  const list = u.searchParams.get('list');
  let videoId: string | undefined;
  if (host === 'youtu.be') {
    videoId = u.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch' || parts.length === 0) videoId = u.searchParams.get('v') ?? undefined;
    else if (['embed', 'live', 'shorts', 'v', 'e'].includes(parts[0]) && parts[1] !== 'videoseries') videoId = parts[1];
  } else {
    return null;
  }
  const ref: YtRef = {};
  if (videoId && VIDEO_ID.test(videoId)) ref.videoId = videoId;
  if (list && LIST_ID.test(list)) ref.listId = list;
  return ref.videoId || ref.listId ? ref : null;
}

/** Embed URL for the iframe (`origin` is the page's origin, required for the JS API to answer). */
export function embedUrl(ref: YtRef, origin: string): string {
  const q = new URLSearchParams({ enablejsapi: '1', autoplay: '1', playsinline: '1', rel: '0', modestbranding: '1', origin });
  if (ref.listId) q.set('list', ref.listId);
  const path = ref.videoId ? encodeURIComponent(ref.videoId) : 'videoseries';
  return `${EMBED_ORIGIN}/embed/${path}?${q.toString()}`;
}

let nextId = 1;

export class YtController {
  private readonly id = `ao-yt-${nextId++}`;
  private readonly fns = new Set<(s: YtState) => void>();
  private state = -1;
  private title: string | undefined;
  private heard = false;
  private retry: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(private readonly iframe: HTMLIFrameElement) {
    window.addEventListener('message', this.onMessage);
    iframe.addEventListener('load', this.onLoad);
    this.onLoad(); // in case the frame is already loaded; harmless if it is not
  }

  play(): void {
    this.command('playVideo');
  }
  pause(): void {
    this.command('pauseVideo');
  }
  next(): void {
    this.command('nextVideo');
  }
  prev(): void {
    this.command('previousVideo');
  }
  setVolume(v0to100: number): void {
    const v = Number.isFinite(v0to100) ? Math.round(Math.min(100, Math.max(0, v0to100))) : 0;
    this.command('setVolume', [v]);
  }
  mute(): void {
    this.command('mute');
  }
  unMute(): void {
    this.command('unMute');
  }

  /** Called with the player state (and video title once known) whenever either changes. */
  onState(fn: (s: YtState) => void): () => void {
    this.fns.add(fn);
    return () => {
      this.fns.delete(fn);
    };
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('message', this.onMessage);
    this.iframe.removeEventListener('load', this.onLoad);
    this.stopRetry();
    this.fns.clear();
  }

  private post(msg: Record<string, unknown>): void {
    const w = this.iframe.contentWindow;
    if (!w || this.disposed) return;
    try {
      w.postMessage(JSON.stringify(msg), EMBED_ORIGIN);
    } catch {
      /* frame not ready */
    }
  }

  private command(func: string, args: unknown[] = []): void {
    this.post({ event: 'command', func, args, id: this.id, channel: 'widget' });
  }

  private stopRetry(): void {
    if (this.retry) clearInterval(this.retry);
    this.retry = null;
  }

  /** The player only reports after it hears "listening", and may not be ready at load: repeat briefly. */
  private readonly onLoad = (): void => {
    this.heard = false;
    this.stopRetry();
    let tries = 0;
    const ping = (): void => {
      if (this.heard || this.disposed || tries++ > 40) {
        this.stopRetry();
        return;
      }
      this.post({ event: 'listening', id: this.id, channel: 'widget' });
    };
    ping();
    this.retry = setInterval(ping, 250);
  };

  private readonly onMessage = (e: MessageEvent): void => {
    if (e.source !== this.iframe.contentWindow || !TRUSTED_ORIGIN.test(e.origin)) return;
    let data: unknown = e.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    if (!data || typeof data !== 'object') return;
    const msg = data as { event?: unknown; info?: unknown };
    this.heard = true;
    this.stopRetry();
    let state = this.state;
    let title = this.title;
    if (msg.event === 'onStateChange' && typeof msg.info === 'number') {
      state = msg.info;
    } else if ((msg.event === 'infoDelivery' || msg.event === 'initialDelivery') && msg.info && typeof msg.info === 'object') {
      const info = msg.info as { playerState?: unknown; videoData?: { title?: unknown } };
      if (typeof info.playerState === 'number') state = info.playerState;
      const t = info.videoData?.title;
      if (typeof t === 'string' && t) title = t;
    } else {
      return;
    }
    if (state === this.state && title === this.title) return;
    this.state = state;
    this.title = title;
    const s: YtState = { state, title };
    for (const fn of [...this.fns]) fn(s);
  };
}
