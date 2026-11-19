# Changelog

Each version goes out to npm, the VS Code Marketplace and Open VSX together, under the same number.
Its GitHub release carries the `.vsix`.

## 0.1.1 (2026-11-19)

Fixes from a pass over every view at five window sizes, in a VS Code panel and in an editor tab.

- The caption bar shows a waiting session's whole question, under its name and time. Long project
  names end in "…" instead of squeezing the question, and the yellow button keeps them inside it.
- In a short, wide VS Code panel, the camera moves in so the people fill the view. Name tags stay
  whole and no longer lie on top of each other.
- On a phone or in a narrow window, the details card opens as a sheet over the lower part of the
  window instead of being squeezed into the room.
- The top bar drops a whole count when there isn't room, instead of cutting one in half.
- Sunny weather seen from above no longer makes the white characters and chef hats glow.
- In Customize, a picture that is still being drawn glows softly instead of showing an empty square.
- While a past session plays in the room, the caption bar is headed "Replay" instead of "Now".
- The Team view has a single line under its heading instead of two.

## 0.1.0 (2026-11-18)

The first public version.

- Each Claude Code session on this computer becomes a little person in a cozy 3D room: a loft
  office, a ramen kitchen or a toy workshop. Every theme has its own places and its own way to
  finish a turn.
- They act out the session's current tool. A session waiting for you stands under a yellow lamp
  with a "?". Idle sessions take a break and then nap. Subagents work beside them as small helpers.
- The weather (clear, sunny, rain or snow) changes the light, the view and what everyone wears.
- Customize: add plants, lamps, toys and more. Each theme keeps its own arrangement.
- History is a diary of past sessions with request-by-request replays. Recap is a digest in plain
  words. Team shows a session and its helpers as lanes.
- Live captions, a lofi generator or your own YouTube or Spotify music, and a focus timer.
- Run it in the browser with `npx cozy-agent-office-claude`, or as a panel in VS Code and Cursor.
