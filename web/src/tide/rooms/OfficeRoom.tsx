import type { CatalogItem, Placed } from '../types';
import { Desks } from './office-desks';
import { OFFICE_CATALOG, OFFICE_DEFAULT } from './office-items';
import { OfficeLights, Pendants } from './office-lights';
import { Lounge } from './office-lounge';
import { Doorway, Windows } from './office-openings';
import { Reception, WAIT_BULBS } from './office-reception';
import { Ceiling, Floors, shellMats, Walls } from './office-shell';
import { Bookcase } from './office-shelves';

// The Office theme: a cozy loft office late at night, seen from the front
// (the fourth wall is open). The sessions are chibi office workers at their
// desks (drawn by the people's code); this is the room around them: bare
// brick under arched steel windows onto the city, a herringbone oak floor,
// a long oak bench desk at the front and a built-in desk along the back wall,
// office chairs, banker's and anglepoise lamps, the reception on the right
// with its two waiting lamps, the lounge in the back left corner (a velvet
// sofa, a leather club chair, a coffee table on a rug), a built-in bookcase,
// the door to the stair landing, and one fixed set of lights.

export function OfficeRoom() {
  const m = shellMats();
  return (
    <group>
      <Walls m={m} />
      <Floors m={m} />
      <Ceiling m={m}>
        <Pendants />
      </Ceiling>
      <Windows />
      <Doorway />
      <Desks />
      <Reception />
      <Lounge />
      <Bookcase />
      <OfficeLights />
    </group>
  );
}

/** Things that can be added to the office (kinds are prefixed o-). */
export const OFFICE_ITEMS: CatalogItem[] = OFFICE_CATALOG;

/** Where they start out: all in the wide shot, clear of the stations, the walkways and the lounge paths. */
export const OFFICE_LAYOUT: Placed[] = OFFICE_DEFAULT;

/** The two waiting lamps' bulbs over the reception, one material each (raise emissiveIntensity when someone waits). */
export { WAIT_BULBS };
