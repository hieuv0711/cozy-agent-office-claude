import { useSyncExternalStore } from 'react';
import { audio, type AudioState } from './engine';

/** Re-renders when the audio state changes (play/pause, track, volumes, mute, break, unlock). */
export function useAudioState(): AudioState {
  return useSyncExternalStore(audio.subscribe, audio.getState, audio.getState);
}
