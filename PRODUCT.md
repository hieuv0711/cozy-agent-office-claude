# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who run several Claude Code sessions at once on their own Mac, typically three to six, plus the
subagents, teammates and workflow agents those sessions start. Agent Office is released as open source,
so this means anyone running Claude Code, not only its author.

Two real situations:

- **Second screen, always on.** The window stays open all day next to the editor and gets a glance
  between tasks. A session waiting for its user has to catch the eye from across the desk.
- **Shared on a stream or a call.** An audience watches it, so the place itself has to be worth looking at.

The job, in the users' words: "At a glance I need to know who is working, who is waiting for me, what
each one is doing and what it is costing. Later I want to see what happened."

## Product Purpose

Every running Claude Code session becomes a character living in a small 3D place. What each one is
doing, its context window, tokens, estimated cost, timeline and subagents sit one click away. Past
sessions stay searchable and replayable, and a daily recap shows what the agents did per day and project.

Success: a session that needs its user is noticed within seconds; the place is calm enough to leave on
all day; History and Recap answer "what happened, and what did it cost".

## Positioning

Other agent visualizers (Pixel Agents and similar) put agents in an office. Agent Office goes beyond the
office: a restaurant, a park and other places, where each agent's real work (reading, editing, running
commands, asking for help, sending out helpers) becomes an activity that belongs to that place.

Status comes from Claude Code's own live-session registry and transcripts, not hooks or timers, and every
kind of agent is drawn.

## Operating Context

- Started with `npm start`; opened at http://127.0.0.1:4777 in a desktop browser (Chrome on macOS today).
- Reads `~/.claude/projects/**/*.jsonl` transcripts and the `~/.claude/sessions/<pid>.json` live registry;
  keeps its own history cache in `~/.agent-office`.
- Users are busy coding: the window is glanced at, not studied, except when it is shared on stream.
- Every Claude Code session on the author's machine runs in Apple Terminal on its own tty.

## Capabilities and Constraints

- Read-only toward Claude Code: never installs hooks and never changes Claude Code's settings.
- Local only: the server binds 127.0.0.1 and checks the Host header. Works offline. The only outside
  network use is an opt-in YouTube or Spotify player for music.
- Views: Office (live 3D place), Team view (one session as swim lanes), detail panel (Overview,
  Timeline, Subagents, Tokens), History (search, filters, activity calendar, replay), Recap (per day and
  per project).
- Cost is an estimate at API list prices; tokens are counted once per API message.
- Approved and not built yet: lofi visuals, built-in lofi music plus YouTube, event sounds, Pomodoro
  clock, room editor, jump to a session's terminal, a mini always-on-top window.
- Undecided: which places beyond the office ship first and how many; Linux and Windows support.

## Brand Commitments

- Name: Agent Office (working name).
- Calm lofi feel, in the user's words "more lofi chill vibe", modelled on the Lofi Girl stream: a calm
  place where things keep gently moving. Sound stays off until the user starts it.

## Evidence on Hand

- Real local data from the author's own sessions (about 110 sessions with real token and cost numbers).
  It is private: screenshots for the public release need synthetic or approved data.
- `docs/PAIN_POINTS.md`: what users of existing tools complain about, with sources.
- `docs/screens/`: screenshots of the current build.
- No users, testimonials, benchmarks or press exist yet. Do not invent them.

## Product Principles

1. Nothing to install into Claude Code; trust comes from reading its own files.
2. Readable from across the room: who is working and who is waiting is never in doubt.
3. Every agent counts and every number is honest; estimates say they are estimates.
4. A place worth leaving on: calm, alive, never nagging.
5. The place is the overview; the detail is one click away.

## Accessibility & Inclusion

- Status is never shown by colour alone.
- Ambient motion respects reduced-motion settings; sound is opt-in.
