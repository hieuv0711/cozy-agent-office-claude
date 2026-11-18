import { useEffect, useRef, useState } from 'react';
import { audio, embedUrl, parseSpotify, parseYouTube, SPOTIFY_WORDS, spotifyEmbedUrl, useAudioState, YtController, type Bus, type SpotifyRef, type YtRef } from '../audio';
import { saveJSON } from '../lib/store';
import { tip } from './Tooltip';

// The music corner of the lower rail. Sound stays off until the user starts it
// (browsers need a click before audio). Sources: the lofi generator made here
// (offline), your own YouTube video or playlist, your own Spotify song, album or
// playlist (both need internet; their players stay visible, YouTube's because it
// requires it, Spotify's because you play it with its own buttons), or off.
// Volumes are per bus and remembered.

const ICONS = {
  play: 'M4 2.5l8 4.5-8 4.5z',
  pause: 'M3.5 2.5h2.6v9H3.5zM7.9 2.5h2.6v9H7.9z',
  next: 'M2.5 2.5l6.5 4.5-6.5 4.5zM9.6 2.5h1.9v9H9.6z',
  note: 'M11 1.5v7.4a2.1 2.1 0 1 1-1.5-2V4.1L5.9 5v5.2a2.1 2.1 0 1 1-1.5-2V3.7z',
};

function Glyph({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function Sliders() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
      <path d="M1.5 3.5h7M11 3.5h1.5M1.5 7h2M6 7h6.5M1.5 10.5h8M12 10.5h.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M9.5 2v3M4.5 5.5v3M10.5 9v3" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

/** A link you pasted: a YouTube one (`ref`) or a Spotify one (`sp`). The newest of each kind plays. */
interface Saved {
  url: string;
  ref?: YtRef;
  sp?: SpotifyRef;
}

/**
 * The links you pasted, newest first. Read as a list whatever shape was saved
 * (an older reader turned it into an object), keeping only links that parse.
 */
function savedLinks(): Saved[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem('ao-yt-links') || '[]');
    const list: unknown[] = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];
    return list.filter((l): l is Saved => !!l && typeof l === 'object' && typeof (l as Saved).url === 'string' && !!((l as Saved).ref || (l as Saved).sp)).slice(0, 6);
  } catch {
    return [];
  }
}

/** The room's sounds: the weather and the street (the ambience) and the office's chimes (sound effects) share one level. */
const ROOM_BUSES: Bus[] = ['ambience', 'sfx'];

export function MusicPlayer() {
  const st = useAudioState();
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Saved[]>(savedLinks);
  const [input, setInput] = useState('');
  const [err, setErr] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const ctl = useRef<YtController | null>(null);
  const ytItem = links.find((l) => l.ref) || null;
  const spItem = links.find((l) => l.sp) || null;
  const yt = st.source === 'youtube' && ytItem?.ref ? { url: ytItem.url, ref: ytItem.ref } : null;
  const sp = st.source === 'spotify' && spItem?.sp ? spItem.sp : null;
  // Spotify plays from its own buttons: ours can't reach into its player
  const theirs = st.source === 'spotify';

  useEffect(() => {
    if (!yt || !frame.current) return;
    const c = new YtController(frame.current);
    ctl.current = c;
    const off = c.onState((s) => {
      if (s.title) setYtTitle(s.title);
    });
    return () => {
      off();
      c.dispose();
      ctl.current = null;
    };
  }, [yt?.url]);

  useEffect(() => {
    ctl.current?.setVolume((st.muted ? 0 : st.volumes.music * st.volumes.master) * 100);
  }, [st.volumes, st.muted, yt?.url]);

  const start = async () => {
    await audio.unlock();
    audio.play();
  };
  // your own music, straight from the start: sound on, the settings open at the link box
  const own = async () => {
    await audio.unlock();
    setOpen(true);
    window.setTimeout(() => field.current?.focus(), 0);
  };
  const toggle = () => {
    if (st.playing) {
      audio.pause();
      ctl.current?.pause();
    } else {
      audio.play();
      ctl.current?.play();
    }
  };
  const next = () => (st.source === 'youtube' ? ctl.current?.next() : audio.next());
  const load = (raw: string) => {
    const ref = parseYouTube(raw);
    const spot = ref ? null : parseSpotify(raw);
    if (!ref && !spot) {
      setErr('That isn’t a YouTube or Spotify link. Copy the link from the Share button of a video, song, album or playlist.');
      return;
    }
    const item: Saved = ref ? { url: raw.trim(), ref } : { url: raw.trim(), sp: spot! };
    const list = [item, ...links.filter((l) => l.url !== item.url)].slice(0, 6);
    setLinks(list);
    saveJSON('ao-yt-links', list);
    setYtTitle('');
    setErr('');
    setInput('');
    audio.setSource(ref ? 'youtube' : 'spotify');
    audio.play();
  };

  const title = st.source === 'youtube' ? ytTitle || 'YouTube' : st.source === 'spotify' ? 'Spotify' : st.source === 'off' ? 'Music off' : st.track ? st.track.title : 'Lofi radio';
  const detail = st.source === 'generator' && st.track ? `${st.track.bpm} BPM · ${st.track.key}` : st.source === 'youtube' ? 'from YouTube' : sp ? `${SPOTIFY_WORDS[sp.kind]}, its own buttons` : '';

  return (
    <div className="music">
      {!st.unlocked ? (
        <div className="music-start-row">
          <button
            type="button"
            className="music-start"
            onClick={start}
            {...tip('Lofi music made right here, offline. Browsers need one click before a page may play sound.', 'Start the music')}
          >
            <Glyph d={ICONS.note} />
            Start the music
          </button>
          <button type="button" className="linkish music-own" onClick={own} {...tip('Paste a YouTube video or playlist, or a Spotify song, album or playlist, and it plays here instead.', 'Your own music')}>
            Your music
          </button>
        </div>
      ) : (
        <div className="music-row">
          <button
            type="button"
            className="cb"
            onClick={toggle}
            aria-label={st.playing ? 'Pause music' : 'Play music'}
            disabled={st.source === 'off' || theirs}
            {...tip(st.source === 'off' ? 'The music is off: pick a source in the sound settings' : theirs ? 'Spotify plays and pauses with its own buttons, in its player' : st.playing ? 'Pause the music' : 'Play the music')}
          >
            <Glyph d={st.playing ? ICONS.pause : ICONS.play} />
          </button>
          <span className="music-title" {...tip(detail ? `${title} · ${detail}` : title, 'Playing')}>
            <b>{title}</b>
            {detail && <small>{detail}</small>}
          </span>
          <button type="button" className="cb" onClick={next} aria-label="Next track" disabled={st.source === 'off' || theirs} {...tip(theirs ? 'Spotify skips with its own buttons, in its player' : st.source === 'youtube' ? 'The next video in the playlist' : 'A new track')}>
            <Glyph d={ICONS.next} />
          </button>
          <button
            type="button"
            className="cb"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="Sound settings"
            {...tip('Your own YouTube or Spotify music, the music source, how loud the music and the room are, and mute', 'Sound settings')}
          >
            <Sliders />
          </button>
        </div>
      )}
      {open && st.unlocked && (
        <div className="sound-panel" role="dialog" aria-label="Sound settings">
          <div className="seg" role="group" aria-label="Music source">
            {(
              [
                ['generator', 'Made here', null],
                ['youtube', 'YouTube', ytItem],
                ['spotify', 'Spotify', spItem],
                ['off', 'Off', null],
              ] as const
            ).map(([s, label, item]) => {
              const needs = (s === 'youtube' || s === 'spotify') && !item;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={st.source === s}
                  disabled={needs}
                  {...(needs ? tip(`Paste a ${label} link below first`) : {})}
                  onClick={() => {
                    audio.setSource(s);
                    if (s !== 'off') audio.play();
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="note">“Made here” is a lofi generator that runs on this computer, offline, a new track every few minutes.</p>
          <h3 className="sound-h">Your own music</h3>
          <form
            className="yt-form"
            onSubmit={(e) => {
              e.preventDefault();
              load(input);
            }}
          >
            <input ref={field} className="search" placeholder="A YouTube or Spotify link" aria-label="Music link" value={input} onChange={(e) => setInput(e.target.value)} />
            <button type="submit" className="btn">
              Play
            </button>
          </form>
          <p className="note">A YouTube video or playlist, or a Spotify song, album or playlist: the link from its Share button.</p>
          {err && <p className="note err">{err}</p>}
          {links.length > 0 && (
            <ul className="yt-links" aria-label="Your recent links">
              {links.map((l) => (
                <li key={l.url}>
                  <button type="button" className="linkish" onClick={() => load(l.url)} {...tip(l.url, l.sp ? `Spotify: ${SPOTIFY_WORDS[l.sp.kind]}` : l.ref?.listId ? 'YouTube: a playlist' : 'YouTube: a video')}>
                    <span className="yt-kind">{l.sp ? 'Spotify' : 'YouTube'}</span>
                    {l.url.replace(/^https?:\/\/(www\.|open\.)?/, '')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="note">Both need internet. Spotify plays whole songs when you’re signed in to Spotify in this browser (otherwise 30-second previews), and you play and skip it with its own buttons. Their sound can’t be analysed here, so the room’s lights pulse to a steady tempo instead of the beat.</p>
          <label className="vol">
            <span>Music</span>
            <input type="range" min={0} max={1} step={0.01} value={st.volumes.music} onChange={(e) => audio.setVolume('music', Number(e.target.value))} />
          </label>
          {/* the same setting as the Room sounds switch by the weather: on or off, and how loud */}
          <div className="vol room-vol">
            <span>Room sounds</span>
            <span className="vol-pair">
              <input type="checkbox" aria-label="Room sounds on" checked={st.roomSounds} onChange={(e) => audio.setRoomSounds(e.target.checked)} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                aria-label="Room sounds volume"
                value={st.volumes.ambience}
                disabled={!st.roomSounds}
                onChange={(e) => {
                  for (const b of ROOM_BUSES) audio.setVolume(b, Number(e.target.value));
                }}
              />
            </span>
          </div>
          <p className="note">Room sounds are the rain, the wind, the street, typing and the small chimes when someone comes, goes or needs you. The focus timer’s bell rings either way.</p>
          <label className="vol">
            <span>Mute everything</span>
            <input type="checkbox" checked={st.muted} onChange={(e) => audio.setMuted(e.target.checked)} />
          </label>
        </div>
      )}
      {sp && (
        <div className="tv tv-spotify">
          <iframe key={`${sp.kind}:${sp.id}`} src={spotifyEmbedUrl(sp)} title="Spotify music player" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" width={356} height={152} />
        </div>
      )}
      {yt && (
        <div className="tv">
          <iframe
            ref={frame}
            key={yt.url}
            src={embedUrl(yt.ref, location.origin)}
            title="YouTube music player"
            allow="autoplay; encrypted-media; picture-in-picture"
            width={356}
            height={200}
          />
        </div>
      )}
    </div>
  );
}
