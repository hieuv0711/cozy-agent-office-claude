import type { CrewTheme } from '../crew/Crew';
import { addFinished } from '../crew/signals';
import { WAIT_BULBS } from '../rooms/WorkshopRoom';
import { shopBusy, WORKSHOP_KIT } from './acts';
import { Bench } from './Bench';
import { WorkshopExtras } from './Extras';
import { WORKSHOP_PLAN } from './plan';

// The toy workshop's cast: toymakers at the bench. Editing saws a plank, a
// command hammers the toy together, a read is the blueprint, the web is a dig
// through the parts tray; while a session thinks, its maker keeps busy (turns
// a toy over, sands, measures). A command that runs on takes them to the lathe
// or the drill press on the back wall; a longer search, to browse the shelves.
// At the end of a turn they carry the finished toy to the shop counter, where
// the day's toys wait to be collected. Apprentices paint at the paint table.

const BACK_Z = -4.82;

export const WORKSHOP_THEME: CrewTheme = {
  id: 'workshop',
  plan: WORKSHOP_PLAN,
  kit: WORKSHOP_KIT,
  outfit: 'maker',
  helperOutfit: 'maker',
  workAct: (s) => {
    const cat = s.now?.cat;
    if (cat === 'run') return 'hammer';
    if (cat === 'edit') return 'saw';
    if (cat === 'read') return 'blueprint';
    if (cat === 'web') return 'rummage';
    return 'think';
  },
  busy: (act, t, seed) => (act === 'think' ? shopBusy(t, seed) : act),
  idleAct: (napping) => (napping ? 'nap' : 'mug'),
  dozeAct: 'doze',
  places: [
    { id: 'lathe', x: -6.75, z: BACK_Z, yaw: Math.PI, act: 'lathe' },
    { id: 'drill', x: 6.55, z: BACK_Z, yaw: Math.PI, act: 'drill' },
    { id: 'shelves-a', x: 11.62, z: -4.55, yaw: Math.PI / 2, act: 'browse', aisleX: 11.2 },
    { id: 'shelves-b', x: 11.62, z: -3.45, yaw: Math.PI / 2, act: 'browse', aisleX: 11.2 },
    { id: 'counter', x: 9.75, z: -1.6, yaw: 0, act: 'settoy' },
  ],
  tripFor: (s, st) => {
    const cat = s.now?.cat;
    if (cat === 'run') return { places: st.x < 0 ? ['lathe', 'drill'] : ['drill', 'lathe'], after: 4000 };
    if (cat === 'web') return { places: ['shelves-a', 'shelves-b'], after: 3000 };
    return null;
  },
  finish: { steps: [{ place: ['counter'], act: 'settoy', carry: 'carrytoy', seconds: 1.6, done: (_station, _sid, color) => addFinished('workshop', color) }] },
  helperSpots: [
    { id: 'paint-left', x: -2.1, z: BACK_Z, yaw: Math.PI, act: 'paint' },
    { id: 'paint-right', x: 2.0, z: BACK_Z, yaw: Math.PI, act: 'paint' },
  ],
  helperAct: () => 'paint',
  Station: Bench,
  Extras: WorkshopExtras,
  bulbs: WAIT_BULBS,
  leftText: 'Went home',
};
