import { audio, useAudioState } from '../audio';
import { cameraCmd, cameraUi, PRESETS } from '../office/camera';
import { WORLD_WORDS, worldUi } from '../office/world';
import { tip } from './Tooltip';

/** What each camera view shows, for its tooltip. */
const VIEW_TIP: Record<string, string> = {
  wide: 'The whole room, straight on. 0 also brings it back.',
  cozy: 'Closer in, on the people at work',
  top: 'Looking down from above, with the ceiling out of the way',
  window: 'From one side of the room, at an angle',
  desk: 'Close up on the selected person, from the front',
};

function Sign({ plus }: { plus?: boolean }) {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
      <path d={plus ? 'M2 6h8M6 2v8' : 'M2 6h8'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    </svg>
  );
}

/** A speaker, with sound waves when on and a small cross when off. */
function Speaker({ on }: { on: boolean }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
      <path d="M1.8 5h2.5l3.3-2.7v9.4L4.3 9H1.8z" fill="currentColor" />
      {on ? (
        <path d="M9.3 4.7a3.2 3.2 0 0 1 0 4.6M10.9 3.2a5.3 5.3 0 0 1 0 7.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M9.4 5.1l2.9 3.8M12.3 5.1l-2.9 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}

export function CameraBar({ hasSelection }: { hasSelection: boolean }) {
  const world = worldUi.use((w) => w.id);
  const zoom = cameraUi.use((s) => s.zoom);
  const follow = cameraUi.use((s) => s.follow);
  const stream = cameraUi.use((s) => s.stream);
  const preset = cameraUi.use((s) => s.preset);
  const roomSounds = useAudioState().roomSounds;
  return (
    <div className="camera-bar" role="toolbar" aria-label="Camera and sound">
      <div className="zoom">
        <button type="button" className="cb" onClick={() => cameraCmd({ type: 'zoomBy', delta: -0.08 })} aria-label="Zoom out" {...tip('Move the camera back', 'Zoom out', '−')}>
          <Sign />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={zoom}
          aria-label="Zoom"
          {...tip('Drag to bring the camera in or out. The mouse wheel works too.', 'Zoom')}
          onChange={(e) => cameraCmd({ type: 'zoomTo', value: Number(e.target.value) })}
        />
        <button type="button" className="cb" onClick={() => cameraCmd({ type: 'zoomBy', delta: 0.08 })} aria-label="Zoom in" {...tip('Bring the camera closer', 'Zoom in', '+')}>
          <Sign plus />
        </button>
      </div>
      <div className="presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="cb"
            aria-pressed={preset === p.id}
            disabled={p.id === 'desk' && !hasSelection}
            {...tip(p.id === 'desk' && !hasSelection ? `Select a ${WORLD_WORDS[world].who} first (click them or their name tag), then look at them close up` : VIEW_TIP[p.id], p.label, p.key)}
            onClick={() => cameraCmd({ type: 'preset', preset: p.id })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="cb sound-toggle"
        aria-pressed={roomSounds}
        {...tip(
          roomSounds
            ? 'The rain, the wind, the street, typing, and a small chime when someone comes, goes or needs you. Click to turn them off. The music has its own switch.'
            : 'Click to hear the rain, the wind, the street and the room again. The music has its own switch.',
          roomSounds ? 'Room sounds are on' : 'Room sounds are off',
        )}
        onClick={() => audio.setRoomSounds(!roomSounds)}
      >
        <Speaker on={roomSounds} />
        Room sounds
      </button>
      <button
        type="button"
        className="cb"
        aria-pressed={follow}
        disabled={!hasSelection && !follow}
        {...tip(
          follow ? 'The camera keeps the selected person in view as they move. Click to stop.' : hasSelection ? 'Keep the selected person in view as they walk about' : `Select a ${WORLD_WORDS[world].who} first, then the camera keeps them in view`,
          'Follow',
          'F',
        )}
        onClick={() => cameraUi.set({ follow: !follow })}
      >
        Follow
      </button>
      <button
        type="button"
        className="cb stream-btn"
        aria-pressed={stream}
        {...tip(
          stream ? 'Back to the usual view, with every control' : 'For a second screen or a stream: the camera drifts slowly, the controls rest, and the captions stay',
          stream ? 'Exit stream mode' : 'Stream mode',
          'S',
        )}
        onClick={() => cameraUi.set({ stream: !stream })}
      >
        {stream ? 'Exit stream' : 'Stream'}
      </button>
    </div>
  );
}
