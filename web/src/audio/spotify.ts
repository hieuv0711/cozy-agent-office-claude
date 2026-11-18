/**
 * Spotify as a music source: a song, an album, a playlist, an artist, a podcast or an episode,
 * played in Spotify's own embedded player. No Spotify script runs on this page, so you play,
 * pause and skip with that player's own buttons. Spotify plays whole songs when you're signed in
 * to Spotify in this browser, and 30-second previews when you're not (its rule, not ours).
 */

export type SpotifyKind = 'track' | 'album' | 'playlist' | 'artist' | 'show' | 'episode';

export interface SpotifyRef {
  kind: SpotifyKind;
  id: string;
}

const KINDS: readonly SpotifyKind[] = ['track', 'album', 'playlist', 'artist', 'show', 'episode'];
const ID = /^[A-Za-z0-9]{22}$/;
const EMBED_ORIGIN = 'https://open.spotify.com';

/** What a link is, in words: "a playlist". */
export const SPOTIFY_WORDS: Record<SpotifyKind, string> = { track: 'a song', album: 'an album', playlist: 'a playlist', artist: 'an artist', show: 'a podcast', episode: 'a podcast episode' };

const isKind = (x: string): x is SpotifyKind => (KINDS as readonly string[]).includes(x);

/**
 * Accepts open.spotify.com links (with ?si=, an /intl-xx/ part, /embed/, or an old
 * /user/<name>/playlist/ path), links without a scheme, and spotify: URIs.
 */
export function parseSpotify(url: string): SpotifyRef | null {
  const raw = (url || '').trim();
  if (!raw) return null;
  const uri = /^spotify:([a-z]+):([A-Za-z0-9]{22})$/.exec(raw);
  if (uri) return isKind(uri[1]) ? { kind: uri[1], id: uri[2] } : null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.hostname.toLowerCase() !== 'open.spotify.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const at = parts.findIndex((p) => isKind(p));
  if (at < 0) return null;
  const kind = parts[at] as SpotifyKind;
  const id = parts[at + 1];
  return id && ID.test(id) ? { kind, id } : null;
}

/** The embedded player's address (dark, Spotify's compact layout). */
export function spotifyEmbedUrl(ref: SpotifyRef): string {
  return `${EMBED_ORIGIN}/embed/${ref.kind}/${encodeURIComponent(ref.id)}?utm_source=generator&theme=0`;
}
