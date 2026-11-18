import type { CrewTheme } from '../crew/Crew';
import { addFinished } from '../crew/signals';
import { WAIT_BULBS } from '../rooms/OfficeRoom';
import { OFFICE_KIT, officeBusy } from './acts';
import { Desk } from './Desk';
import { OfficeExtras } from './Extras';
import { OFFICE_PLAN } from './plan';

// The night office's cast: people at their desks. Editing types, a command is
// watched as it runs, a read is a printout, the web is a phone call; while a
// session thinks, its person keeps busy (chin on hand, notes, a sip of coffee).
// Things that take a while send them across the room: a long command to the
// printer by the door, a long think to the task board or the espresso machine,
// planning to the board. At the end of a turn they walk over and move their
// note to "done". Interns help at the back desk, or at any free desk.

const BOARD_X = 11.95;

export const OFFICE_THEME: CrewTheme = {
  id: 'office',
  plan: OFFICE_PLAN,
  kit: OFFICE_KIT,
  outfit: 'office',
  helperOutfit: 'office',
  workAct: (s) => {
    const cat = s.now?.cat;
    if (cat === 'run') return 'watch';
    if (cat === 'edit') return 'type';
    if (cat === 'read') return 'paper';
    if (cat === 'web') return 'phone';
    return 'think';
  },
  busy: (act, t, seed) => (act === 'think' ? officeBusy(t, seed) : act),
  idleAct: (napping) => (napping ? 'nap' : 'mug'),
  dozeAct: 'deskdoze',
  places: [
    { id: 'printer', x: 8.15, z: -5.1, yaw: Math.PI, act: 'printwait' },
    { id: 'coffee', x: -8.02, z: -5.15, yaw: Math.PI, act: 'coffee' },
    { id: 'board-a', x: BOARD_X, z: -3.55, yaw: Math.PI / 2, act: 'note', aisleX: 11.3 },
    { id: 'board-b', x: BOARD_X, z: -4.45, yaw: Math.PI / 2, act: 'sketch', aisleX: 11.3 },
  ],
  tripFor: (s) => {
    const cat = s.now?.cat;
    if (cat === 'run') return { places: ['printer'], after: 4000 };
    if (cat === 'plan') return { places: ['board-b', 'board-a'], after: 1500 };
    if (!s.now) return { places: ['board-b', 'coffee'], after: 7000 };
    return null;
  },
  finish: { steps: [{ place: ['board-a', 'board-b'], act: 'note', seconds: 2.6, done: (_station, _sid, color) => addFinished('office', color) }] },
  helperSpots: [
    { id: 'intern-left', x: -2.0, z: -4.75, yaw: Math.PI, act: 'clipboard' },
    { id: 'intern-right', x: 2.0, z: -4.75, yaw: Math.PI, act: 'clipboard' },
  ],
  helperAct: () => 'type',
  Station: Desk,
  Extras: OfficeExtras,
  bulbs: WAIT_BULBS,
  leftText: 'Went home',
};
