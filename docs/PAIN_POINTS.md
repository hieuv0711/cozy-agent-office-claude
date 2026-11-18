# What users actually complain about

Pixel Agents (github.com/pixel-agents-hq/pixel-agents, 10.2k stars, MIT) and the tools around it.
Collected on 13 Nov 2026 from the GitHub tracker, Reddit, Hacker News and the two extension
marketplaces. Every point links to the original post.

## Where the voices come from

| Source | What was read |
|---|---|
| Pixel Agents GitHub | All 100 issues (97 filed by outside users), 337 pull requests (64 community PRs still open), 25 discussions, with reaction and comment counts |
| Reddit | Launch threads: r/ClaudeCode (850 upvotes, 70 comments), r/vibecoding (247 upvotes), r/SideProject (39 comments), read through an archive because reddit.com blocks automated reads |
| Hacker News | Show HN threads for agents-observe, Outworked, a Claude Code dashboard, Sniffly, Pulse, claude-devtools and agent-of-empires |
| Marketplaces | VS Code Marketplace (97k installs, 6 reviews, 4.3 average) and Open VSX (1 review) |
| Claude Code tracker | The most upvoted related requests in anthropics/claude-code |

## Ranked by how many users raised it

Counts are from the Pixel Agents tracker. "Voices" = distinct outside people who opened or commented.

| # | Pain point | Kind | Issues (open) | Reactions | Comments | Open community PRs | Voices |
|---|---|---|---|---|---|---|---|
| 1 | Only Claude Code: wants Copilot, Codex, OpenCode, Cursor, Zed, Antigravity | Wish | 11 (7) + 8 discussions | 128 + 27 upvotes | 25 | 22 | 31 |
| 2 | Agents not detected, or stuck on "idle" while working | Complaint | 15 (4) + 2 discussions | 0 | 35 (#7 alone: 26) | 1 | 24 |
| 3 | Only works inside VS Code terminals; cannot adopt sessions already running, tmux, remote | Complaint / wish | 15 (6) | 37 | 19 | 3 | 23 |
| 4 | Subagents and agent teams missing, or crowding the parent | Complaint | 10 (6) + 1 discussion | 12 | 26 | 2 | 19 |
| 5 | Labels: every agent shows the same folder name, labels only on hover, labels overlap | Complaint | 5 (4) + 1 discussion | 3 + 5 upvotes | 4 | 5 | 9 |
| 6 | History, replay, memory across sessions | Wish | 4 (2) + 1 discussion | 3 + 3 upvotes | 6 | 0 | 7 |
| 7 | Tokens, usage and cost per agent | Wish | 2 (1) + 1 discussion | 5 + 1 upvote | 1 | 1 | 3 |
| 8 | Trust: it edits ~/.claude/settings.json and installs hooks | Complaint | 4 (3) + 1-star review | 2 | 1 | 0 | 4 |
| 9 | Ended sessions never leave; "Using …" labels stick | Complaint | 3 (2) | 1 | 2 | 2 | 3 |
| 10 | "Needs you" is easy to miss | Wish | 3 (1) + 1 discussion | 2 | 1 | 0 | 4 |

My reading of it: the loudest demand is "just work with whatever I run" (rows 1 to 3) and status you can trust.
Tokens and history are quieter on the tracker but come up in Hacker News threads, in competing tools, and in
Claude Code's own tracker. People love the feeling of coworkers in a room; nobody asked for 3D specifically.

## What users said

Paraphrased, with a link to each original. One short direct quote is kept where the wording matters.

**Losing track of who is doing what**
- With several agents running, a commenter loses track of which one is working on what, and asks to see the file each agent is editing. (u/dayner_dev, r/ClaudeCode, 22 Feb 2026) [link](https://www.reddit.com/r/ClaudeCode/comments/1rbs0gx/i_built_a_vs_code_extension_that_turns_your/o6tm9eh/)
- Running 3 to 4 sessions, a developer could not tell which one is thinking, idle or waiting, nor how full each context window is, so they built a dashboard. (Stargx, Hacker News, 9 Mar 2026) [link](https://news.ycombinator.com/item?id=47314376)
- A reply in the same thread calls managing multiple sessions a real pain point. (bbtc3453, Hacker News) [link](https://news.ycombinator.com/item?id=47321965)
- Another builder made a session board specifically to see which session is blocked on them. (Pixel Agents discussion #415) [link](https://github.com/pixel-agents-hq/pixel-agents/discussions/415)

**Status that is wrong**
- The character stays "idle" while the session is clearly working. (u/th3luckiest, r/ClaudeCode) [link](https://www.reddit.com/r/ClaudeCode/comments/1rbs0gx/i_built_a_vs_code_extension_that_turns_your/o6x9qsa/)
- No characters appear at all while Claude Code is running. (u/ozitolama, r/ClaudeCode) [link](https://www.reddit.com/r/ClaudeCode/comments/1rbs0gx/i_built_a_vs_code_extension_that_turns_your/o6ud9kl/)
- Issue #7 "Agents don't respond to claude code" collected 26 comments, most of them reporting the same problem. [link](https://github.com/pixel-agents-hq/pixel-agents/issues/7)

**Tied to VS Code**
- It only picks up agents started in the editor's own terminal, not a separate terminal app. (u/UnlockHomes, r/ClaudeCode) [link](https://www.reddit.com/r/ClaudeCode/comments/1rbs0gx/i_built_a_vs_code_extension_that_turns_your/o6yhcno/)
- Asks for a version that does not need VS Code. (u/Rakn, r/ClaudeCode) [link](https://www.reddit.com/r/ClaudeCode/comments/1rbs0gx/i_built_a_vs_code_extension_that_turns_your/o8osza4/)

**Subagents**
- With ten free chairs, subagents still bunch up around their parent like a crowd. (pranav-js, issue #380) [link](https://github.com/pixel-agents-hq/pixel-agents/issues/380)
- A 5-star review says agents launched together by one terminal ("party mode") never showed up. (VS Code Marketplace, v1.1.1)
- Agents started by the Workflow tool are not drawn at all. (issue #429) [link](https://github.com/pixel-agents-hq/pixel-agents/issues/429)

**Trust and hooks**
- A 1-star review (VS Code Marketplace, 4 Aug 2026, v1.4.0): "Overwrote my Claude Code config including my permission rules." The reviewer also objects to hooks on 14 events running before every tool call.
- The author of agents-observe found Claude Code hooks block, and slow things down badly when many plugins use them. (simple10, Hacker News, 1 Apr 2026) [link](https://news.ycombinator.com/item?id=47602986)

**Tokens and cost**
- Finds it absurd to need third-party tools just to see how much usage is left. (khoury, Hacker News, 17 Feb 2026) [link](https://news.ycombinator.com/item?id=47045125)
- Suggests showing cost and tokens per git branch. (PanMan, Hacker News, Sniffly thread) [link](https://news.ycombinator.com/item?id=45083978)
- Issue #111 "Token counter" has been open since March with a maintainer go-ahead and no code. [link](https://github.com/pixel-agents-hq/pixel-agents/issues/111)
- In Claude Code's own tracker: a request to expose token usage and cost to hooks has 35 upvotes and is open [link](https://github.com/anthropics/claude-code/issues/11008); one user reports a deep-research workflow that spawned 111 agents and used up a whole 5-hour quota [link](https://github.com/anthropics/claude-code/issues/69213)

**History and loops**
- Wants a timeline that flags when an agent re-reads a file it already read, as the clearest sign of a stuck loop. (warwickmcintosh, Hacker News, 26 Mar 2026) [link](https://news.ycombinator.com/item?id=47529156)
- Issue #23 asks for session replay; #40 for browsing and resuming past sessions. [link](https://github.com/pixel-agents-hq/pixel-agents/issues/40)

**What they love (keep it)**
- Little coworkers in a room are easier to follow than a pile of terminals. (u/Otherwise_Wave9374, r/ClaudeCode, 35 upvotes) [link](https://www.reddit.com/r/ClaudeCode/comments/1rbs0gx/i_built_a_vs_code_extension_that_turns_your/o6t2ntk/)
- An Open VSX reviewer says the visualization makes everything click. (5 stars)
- One user wants it partly to feel less alone while the agents work. (tomiduss, issue #6) [link](https://github.com/pixel-agents-hq/pixel-agents/issues/6)

## What this build does about each

| Pain point | In Agent Office 3D |
|---|---|
| Only works in VS Code / cannot adopt running sessions / tmux | Reads Claude Code's own files. Any terminal, tmux, editor panel or headless run shows up, including sessions started before the app |
| Wrong "idle" status | Status comes from Claude Code's live-session file (busy, idle, waiting, plus the reason), checked against the process |
| Trust: edits settings, installs hooks | Installs nothing into Claude Code, never writes to ~/.claude, listens on 127.0.0.1 only |
| Ended sessions never leave | When the process ends, the character walks out of the door |
| Labels: same name, hover only, overlap | Always-on tags with Claude Code's session name, the current tool and file; overlapping tags move apart |
| Subagents missing or crowding | Every Agent-tool subagent, teammate and Workflow agent becomes a helper bot orbiting its parent, never taking a chair |
| "Needs you" easy to miss | The agent walks to the help desk and waves; the tab title shows a count; optional desktop alert |
| Tokens and cost | Per agent and per session, each message counted once; matches Claude Code's own cost record within 0 to 7% on this Mac |
| History and loops | Timeline per agent with a "read N times" loop hint; Team view lanes; History with replay that survives restarts and Claude Code's 30-day cleanup |
| Only Claude Code | Not addressed. It is the biggest ask; the reader is a separate module so a Codex or OpenCode adapter can be added later |

## Not covered

- X/Twitter, YouTube and Discord were not searched. Reddit search pages were blocked, so only the launch threads found through an archive were read.
- Reaction counts are small on most issues; the counts above say where people spoke up, not how many people want something.
