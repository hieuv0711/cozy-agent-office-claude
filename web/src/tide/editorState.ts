import { createStore } from '../lib/store';

// Customise mode: on or off, the selected item, and the item being placed
// (picked in the palette, waiting for a click on the scene). Kept apart from
// the 3D code so the top bar can switch it on without loading the scene.

export interface EditorState {
  editing: boolean;
  /** The placed item that is selected (its id). */
  selected: string | null;
  /** An item picked from the palette, following the pointer until it is put down. */
  placing: { kind: string; seed: number } | null;
  /** Why the spot under the pointer won't take the item (someone's work spot, a walkway), if it won't. */
  blocked: 'walkway' | 'workspot' | null;
}

export const editor = createStore<EditorState>({ editing: false, selected: null, placing: null, blocked: null });

// The click that ends a drag or a placement also reaches the scene as a click
// on nothing; it must not undo the selection it just made.
let lastTouch = 0;
export const touch = () => {
  lastTouch = performance.now();
};
export const touchedRecently = () => performance.now() - lastTouch < 350;

export function setEditing(on: boolean) {
  editor.set({ editing: on, selected: null, placing: null, blocked: null });
}
