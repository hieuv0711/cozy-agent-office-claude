import type { CrewTheme } from '../crew/Crew';
import { PASS_BULBS } from '../rooms/ramen-counter';
import { busyAct, KITCHEN_KIT, PLATE_S } from './acts';
import { Dining, dining, diningWalkways } from './Dining';
import { KITCHEN_PLAN } from './plan';
import { StationProps as KitchenStation } from './Station';

// The ramen kitchen's cast: cooks. Editing chops, a command stirs the pot, a
// read is an order ticket, the web is the recipe book; while a session thinks,
// its cook keeps busy (tastes, shakes out noodles, wipes down). A command that
// runs on takes its cook to the big broth pots on the back line. When a turn
// ends, the cook plates the dish and carries it round to the customer who came
// in for it (there's no waiter: only cooks work here). Apprentices whisk at the
// back line.

const BACK_Z = -4.83;

export const KITCHEN_THEME: CrewTheme = {
  id: 'kitchen',
  plan: KITCHEN_PLAN,
  kit: KITCHEN_KIT,
  outfit: 'chef',
  helperOutfit: 'chef',
  workAct: (s) => {
    const cat = s.now?.cat;
    if (cat === 'run') return 'stir';
    if (cat === 'edit') return 'chop';
    if (cat === 'read') return 'read';
    if (cat === 'web') return 'book';
    return 'think';
  },
  busy: (act, t, seed) => (act === 'think' ? busyAct(t, seed) : act),
  idleAct: (napping) => (napping ? 'nap' : 'mug'),
  dozeAct: 'doze',
  places: [
    { id: 'pot-left', x: -6.4, z: BACK_Z, yaw: Math.PI, act: 'ladle' },
    { id: 'pot-right', x: 6.4, z: BACK_Z, yaw: Math.PI, act: 'ladle' },
  ],
  // a command that keeps running: off to the big broth pot on their side
  tripFor: (s, st) => (s.now?.cat === 'run' ? { places: st.x < 0 ? ['pot-left', 'pot-right'] : ['pot-right', 'pot-left'], after: 6000 } : null),
  // the end of a turn: plate the dish at the station, then carry it round to
  // the customer who came in for it (or leave it on the ledge to go)
  finish: {
    steps: [
      { act: 'plate', seconds: PLATE_S, done: (station, sid) => void dining.order(sid, station) },
      { place: (sid) => dining.servePlace(sid), act: 'serve', carry: 'carry', seconds: 1.8, done: (_station, sid) => dining.served(sid) },
    ],
  },
  helperSpots: [
    { id: 'prep-left', x: -2.0, z: BACK_Z, yaw: Math.PI, act: 'whisk' },
    { id: 'prep-right', x: 2.0, z: BACK_Z, yaw: Math.PI, act: 'whisk' },
  ],
  helperAct: () => 'whisk',
  Station: KitchenStation,
  Extras: Dining,
  walkways: diningWalkways(KITCHEN_PLAN.aisleZ),
  bulbs: PASS_BULBS,
  leftText: 'Went home',
};
