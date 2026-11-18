import { useEffect, useState } from 'react';
import { WORLDS, worldUi } from '../office/world';

// When the place changes, an episode title card holds the frame, the way an
// anime cuts between scenes. It stays until the new place has drawn (at least
// 1.4 s), then fades. Skipped when motion is reduced.
export function EpisodeCard() {
  const { id, card, drawn } = worldUi.use((w) => w);
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');
  useEffect(() => {
    if (!card) return;
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setPhase('in');
  }, [card]);
  useEffect(() => {
    if (phase !== 'in') return;
    const ready = drawn >= card;
    const t = window.setTimeout(() => setPhase('out'), ready ? Math.max(0, card + 1400 - Date.now()) : 8000);
    return () => window.clearTimeout(t);
  }, [phase, drawn, card]);
  useEffect(() => {
    if (phase !== 'out') return;
    const t = window.setTimeout(() => setPhase('hidden'), 700);
    return () => window.clearTimeout(t);
  }, [phase]);
  if (phase === 'hidden') return null;
  const w = WORLDS[id];
  return (
    <div className={`episode ${phase}`} aria-hidden="true">
      <span className="title-card">{w.name}</span>
      <span className="ep-line">{w.episode}</span>
    </div>
  );
}
