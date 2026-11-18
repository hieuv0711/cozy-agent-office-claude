---
name: Agent Office
description: Every running Claude Code session as a character in a small 3D place, captioned like an anime film still.
colors:
  ink: "#0e1018"
  ink-2: "#141722"
  ink-3: "#1c2030"
  stage: "#0b0d14"
  term: "#07080c"
  outline: "#05060a"
  paper: "#f6f1e4"
  paper-lift: "#fffaf0"
  paper-2: "#dcd6c8"
  muted: "#b4ae9f"
  faint: "#8c8778"
  caption-unlit: "rgba(246, 241, 228, 0.45)"
  rule: "rgba(246, 241, 228, 0.13)"
  rule-2: "rgba(246, 241, 228, 0.26)"
  yellow: "#ffd84a"
  yellow-lift: "#ffe27a"
  coral: "#f27d6b"
  sage: "#8fd19e"
  blue: "#a9b8f0"
  peach: "#f2b483"
  slot-1: "#3987e5"
  slot-2: "#d95926"
  slot-3: "#199e70"
  slot-4: "#9085e9"
  slot-5: "#d55181"
  slot-other: "#7a7568"
  plan-grey: "#9a9488"
  ramp-0: "rgba(255, 255, 255, 0.05)"
  ramp-1: "#3d3b36"
  ramp-2: "#625e55"
  ramp-3: "#8c877a"
  ramp-4: "#bdb7a8"
  ramp-5: "#f6f1e4"
  speaker-1: "#7fb8e8"
  speaker-2: "#ef9a85"
  speaker-3: "#93cf9b"
  speaker-4: "#b8a4ef"
  speaker-5: "#ec8fb6"
  speaker-6: "#5fc4b8"
  speaker-7: "#f2b483"
  speaker-8: "#8fa2f2"
  speaker-9: "#a6dcc0"
  speaker-10: "#d79be0"
typography:
  display:
    fontFamily: "'Shippori Mincho B1', 'Hiragino Mincho ProN', 'Yu Mincho', serif"
    fontSize: "76px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0em"
  headline:
    fontFamily: "'Shippori Mincho B1', 'Hiragino Mincho ProN', 'Yu Mincho', serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0em"
  title:
    fontFamily: "'Shippori Mincho B1', 'Hiragino Mincho ProN', 'Yu Mincho', serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "0em"
  caption:
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', ui-rounded, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.3
  narration:
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', ui-rounded, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.5
  speaker:
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', ui-rounded, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1.25
  body:
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', ui-rounded, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
  nav:
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', ui-rounded, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
  control:
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', ui-rounded, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
  control-dense:
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', ui-rounded, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 700
  control-strong:
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', ui-rounded, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 800
  label:
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', ui-rounded, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 800
  stamp:
    fontFamily: "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', ui-rounded, system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 800
    lineHeight: 1.6
    letterSpacing: "0.08em"
  numeral:
    fontFamily: "'M PLUS 1 Code', ui-monospace, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "tnum"
  numeral-large:
    fontFamily: "'M PLUS 1 Code', ui-monospace, Menlo, monospace"
    fontSize: "24px"
    fontWeight: 600
    fontFeature: "tnum"
  tag:
    fontFamily: "'M PLUS 1 Code', ui-monospace, Menlo, monospace"
    fontSize: "10.5px"
    fontWeight: 600
    letterSpacing: "0.03em"
rounded:
  none: "0px"
  hairline: "1px"
  sm: "2px"
  chart: "4px"
spacing:
  xs: "4px"
  cell: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  rail-top:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.muted}"
    height: "56px"
    padding: "0 24px"
  rail-lower:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    height: "140px"
    padding: "0 24px"
  view-tab:
    textColor: "{colors.muted}"
    typography: "{typography.nav}"
    padding: "0 14px"
  view-tab-active:
    textColor: "{colors.paper}"
  caption-line:
    textColor: "{colors.paper}"
    typography: "{typography.caption}"
    padding: "0 6px"
  caption-line-unsung:
    textColor: "{colors.caption-unlit}"
    typography: "{typography.caption}"
  caption-line-waiting:
    textColor: "{colors.yellow}"
    typography: "{typography.caption}"
  caption-speaker:
    typography: "{typography.speaker}"
  scene-card:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "16px"
    width: "328px"
  scene-card-tab:
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    height: "40px"
    padding: "0 6px"
  scene-card-tab-active:
    textColor: "{colors.paper}"
  button:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "34px"
  button-hover:
    backgroundColor: "{colors.ink-3}"
  button-primary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.paper-lift}"
  button-answer:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.control-strong}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "34px"
  button-answer-hover:
    backgroundColor: "{colors.yellow-lift}"
  waiting-count:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.control-strong}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-ghost:
    textColor: "{colors.paper-2}"
    typography: "{typography.control-dense}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "32px"
  segment:
    textColor: "{colors.muted}"
    typography: "{typography.control-dense}"
    padding: "0 10px"
    height: "30px"
  segment-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  filter-chip:
    textColor: "{colors.paper-2}"
    typography: "{typography.control-dense}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "28px"
  filter-chip-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  input-search:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  select:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  stamp-live:
    textColor: "{colors.paper}"
    typography: "{typography.stamp}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
  stamp-ended:
    textColor: "{colors.muted}"
    typography: "{typography.stamp}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
  stamp-kept:
    textColor: "{colors.faint}"
    typography: "{typography.stamp}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
  timeline-tag:
    textColor: "{colors.paper}"
    typography: "{typography.tag}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  episode-card:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.display}"
  calendar-cell:
    rounded: "{rounded.sm}"
    size: "15px"
  mini-window:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    width: "340px"
    height: "460px"
    padding: "12px 14px"
---

# Design System: Agent Office

Every running Claude Code session is a character in a small 3D place. Click one to see what it is
doing, its context window, tokens, estimated cost, timeline and subagents. Past sessions stay
browsable and replayable, and a daily recap shows what the agents did.

- Product truth: [../PRODUCT.md](../PRODUCT.md). Direction contract for the app shell: [../.impeccable/surfaces/web-src-app-tsx.md](../.impeccable/surfaces/web-src-app-tsx.md).
- User pain points behind it: [PAIN_POINTS.md](PAIN_POINTS.md)
- Earlier visual design (the lo-fi night office mock, superseded by Fansub Night): https://claude.ai/artifact/3X5pFxxr1XFKzQoxRkE3HG
- The working build is this folder (`npm start`, then http://127.0.0.1:4777).

The eight sections below are the visual system, recorded from the built app (`web/src`). The sections after
Do's and Don'ts keep this file's product and engineering notes.

## Overview

**Creative North Star: "Fansub Night"**

Agents, captioned. The place plays like an anime film still at night, and every busy session says what it is doing as a live subtitle in the letterbox under the picture. The frame is letterbox ink and the type is subtitle white. One fansub yellow is kept for a session waiting for its user, so it reads from across the desk. Everything else stays quiet enough to leave on all day.

The interface is a film frame, not a dashboard. Two ink rails hold the picture, and sections are divided by hairlines on the ink ground instead of being boxed in cards. Corners are square, and a faint film grain sits over everything. Type does the work colour does elsewhere: compressed Shippori Mincho title cards, M PLUS Rounded 1c for anything said, M PLUS 1 Code for the figures. Text drawn over the picture is outlined like a subtitle, never boxed.

The density is for glancing: at most three caption lines, waiting first. Detail sits one click away in a 328 px scene card over the picture. Confirmed rejections, in the user's answers: a corporate dashboard, a hacker or neon-cyberpunk look, and the category default of a dark glass dashboard with neon accents and cards wrapped around a canvas.

**Key Characteristics:**
- A letterbox frame: 56 px top rail, 140 px lower rail, the 3D place filling the middle.
- One yellow, one meaning: waiting for you.
- Subtitle type with a dark outline over the picture; no boxes, no glass, no glowing chrome.
- Three type voices: Mincho titles, rounded gothic speech, code numerals.
- Square corners (2 px on controls), hairline rules, an 8 px cell.
- Charts use a validated five-slot palette; names use a separate set of speaker pastels.
- Three places (Night office, ramen bar, park), each graded like a film still and opened by an episode title card.

## Colors

Near-monochrome warm subtitle white on blue-black ink, with one reserved yellow, four small status hues, and two separate data sets: speaker pastels for names, validated slots for charts.

### Primary
- **Subtitle White** (#f6f1e4): the text ink and the only "active" colour. Current tabs get a 2 px underline in it; pressed segments, filter chips and the primary button fill with it and turn their text to ink; the focus ring is a 2 px outline of it. 16.8:1 on ink.

### Secondary
- **Fansub Yellow** (#ffd84a): a session waiting for its user, and nothing else. It colours the waiting caption line, the "N waiting for you" count, the "Answer in terminal" button (ink on yellow, 13.7:1), the scene card's Needs-you block, waiting rows in the mini window, and the "Asks you" activity in charts. In the 3D place it lights the spinning "!" over a waiting character, that character's screen alert and the help-spot lamp. Hover lifts the yellow buttons to #ffe27a.

### Tertiary
- **Coral** (#f27d6b): failed and error. Failed helpers and subagents, deleted lines, "Reconnecting…", a context window at 60% or more, failed lane segments and error or interrupt marks.
- **Sage** (#8fd19e): done and added. Finished helpers and subagents, added lines, background-task marks on lanes, the Pomodoro break.
- **Helper Blue** (#a9b8f0): subagent helpers. Their chips over the place and the "+N bots" counts.
- **Peach** (#f2b483): running long, and warnings. A caption timer past 1.5× the usual time, compaction marks, notes from the terminal jump.

### Neutral
- **Letterbox Ink** (#0e1018): the rails, the scene card, pages, the episode card and the mini window.
- **Raised Ink** (#141722) and **Lifted Ink** (#1c2030): input and secondary-button fills, and their hover.
- **Stage Ink** (#0b0d14): behind the 3D canvas. **Terminal Ink** (#07080c): terminal output blocks in Team view.
- **Outline Ink** (#05060a): the stroke painted under subtitle type.
- **Paper 2** (#dcd6c8, 13.1:1): secondary text, sub-lines under names, timers, legend text.
- **Muted Paper** (#b4ae9f, 8.6:1): labels, inactive tabs and segments, counts.
- **Faint Paper** (#8c8778, 5.3:1): meta lines, axis ticks, placeholders, the idle status.
- **Unsung Caption** (subtitle white at 45%, 4.1:1): the part of a caption the karaoke fill has not reached.
- **Rule** (subtitle white at 13%) and **Strong Rule** (at 26%): hairlines. Strong rules for input borders, page section tops and History day headers.

### Data: chart slots
Five validated categorical slots, all within OKLCH lightness 62 to 67% so no series jumps forward: **Slot 1 Blue** (#3987e5), **Slot 2 Orange** (#d95926), **Slot 3 Green** (#199e70), **Slot 4 Violet** (#9085e9), **Slot 5 Rose** (#d55181), and **Other** (#7a7568). Each slot is 4.8 to 6.1:1 on ink; Other is 4.1:1.
- Recap projects: slots 1 to 5 in all-time project order, with the largest project at the bottom of each stack; every other project folds into Other.
- Token mix: cache read slot 1, cache write slot 2, output slot 3, input slot 4.
- Activity (Team lanes, timeline tags): read and search slot 1, run a command slot 2, web slot 3, subagents slot 4, edit and write slot 5. "Asks you" is Fansub Yellow. MCP tools and other tools take Other; Plan takes a lighter warm grey (#9a9488).

### Data: sequential ramp
Paper on ink, brighter means more: empty (white at 5%), then #3d3b36, #625e55, #8c877a, #bdb7a8 and #f6f1e4. It draws the History activity calendar (estimated cost per day, stepped at the 20th, 45th, 70th and 90th percentiles).

### Data: speaker colours
Ten light pastels, assigned to a session by a hash of its id, used for names only: #7fb8e8, #ef9a85, #93cf9b, #b8a4ef, #ec8fb6, #5fc4b8, #f2b483, #8fa2f2, #a6dcc0 and #d79be0, each 7.8 to 12.3:1 on ink. They colour the speaker name in captions, the name over a character, the session name in the scene card and mini window, the swatch in the Everyone list, and the desk name plate in the place. None is yellow.

### Named Rules
**The One Yellow Rule.** Lit Fansub Yellow (#ffd84a) means a session is waiting for you, in the interface and in the place. It is never a highlight, a brand accent, a warning or a decoration; a waiting session wears it everywhere it appears, and nothing else does.

**The Two Palettes Rule.** Speaker pastels name sessions; the validated slots draw chart series. The pastels fail the dataviz checks as series (colour-blind separation, chroma, lightness band), so they never fill a bar, and slots never colour a name.

**The Fixed Slot Rule.** Series take slots 1 to 5 in that order and never cycle; the sixth thing and everything after it is Other.

## Typography

**Display Font:** Shippori Mincho B1 800 (with Hiragino Mincho ProN, Yu Mincho, serif)
**Body Font:** M PLUS Rounded 1c 500, 700 and 800 (with Hiragino Maru Gothic ProN, ui-rounded, system-ui, sans-serif)
**Label/Mono Font:** M PLUS 1 Code 400 and 600 (with ui-monospace, Menlo, monospace)

All three are bundled with the app through Fontsource; nothing loads from the network.

**Character:** An anime episode card above, a fansub below. Heavy Mincho pressed narrow for every title, a soft rounded gothic at heavy weights for everything said, and a narrow code face for the figures so they line up.

### Hierarchy
- **Display** (800, 76px, 1): the episode title card when the place changes. Compressed.
- **Headline** (800, 34px, 1.1): page titles (Team view, History, Recap). Compressed.
- **Title** (800, 28px, 1.08): the scene card's session title, balanced. The same voice sets the wordmark at 27px, the rail's "Now" at 24px and the mini window's "Now" at 22px.
- **Caption** (800, 22px, 1.3): the live subtitle line, up to 640px wide; 18px for quiet lines and in windows under 760px.
- **Narration** (800, 22px, 1.5, max 62ch): Recap tells the period as one sentence; 18px and 70ch for the small variant.
- **Speaker** (800, 15px, 1.25): a session's name in captions and over its character.
- **Body** (14px, 1.5): the CSS asks for the regular weight; the lightest bundled cut, 500, is what renders.
- **Nav and Control** (700; 14px for the view tabs, 13px for buttons, card tabs and selects, 12.5px for dense controls such as segments, filter chips and camera buttons). The yellow actions use 800.
- **Label** (800, 13px, Muted Paper): card and section headings, in sentence case.
- **Stamp** (800, 10.5px, 0.08em, uppercase): end-state stamps only.
- **Numeral** (M PLUS 1 Code 400, 12px, tabular figures): every figure read as data, meaning times, costs, tokens, tallies, IDs and chart ticks. A count inside a phrase or label ("6 sessions · 1 idle", "38 tool calls", "a 25-minute focus") stays in the phrase's rounded face. 600 weight at 24px for the scene card's cost, 18px for History stats and 15px for caption timers.
- **Tag** (M PLUS 1 Code 600, 10.5px, 0.03em): timeline activity tags such as READ, EDIT and RUN.

### Named Rules
**The Three Voices Rule.** Mincho titles, rounded speech, code figures. A figure read as data set in the rounded face, or a title set in anything but the compressed Mincho, is off-system.

**The Compressed Title Rule.** Title cards are Shippori Mincho B1 800 squeezed to 82% width (scaleX 0.82 from the left edge, with the box widened to 121.9% to compensate) at zero tracking. Titles are compressed, never letter-spaced.

**The Outlined Subtitle Rule.** Any text drawn over the picture is subtitle type: heavy weight and an Outline Ink stroke painted under the fill (5px on caption text and empty-place messages, 4px on names, 3px on sub-lines, timers and helper chips). It never sits in a box or a pill.

## Layout

The app is one column the height of the window, framed like a letterboxed film. A 56px top rail and a 140px lower rail, both Letterbox Ink with a hairline toward the picture, hold the 3D place, which fills the middle edge to edge. The scene card floats over the picture's right side, 16px in from the top, right and bottom. Team view, History and Recap replace the picture with a page: 16px top and 24px side and bottom padding, 16px gaps, and a page head (compressed headline and its controls) over a hairline. Team view is lanes beside a 360px column, History a 380px list beside the report, Recap a single column with a two-up grid under the chart.

- **Top rail:** wordmark in a 168px slot, view tabs, then the counts pushed right, the place switcher, the Mood control, Alerts and Pop out. 24px side padding and gaps.
- **Lower rail:** three columns (230px, flexible, auto) with 24px gaps: "Now" with the music corner and Pomodoro line on the left, up to three centred captions, then the yellow Answer button and the camera bar on the right.
- **Spacing:** an 8px cell (`--cell`). Steps of 4, 8, 12, 16 and 24 carry most padding and gaps; rails and pages use 24px sides, the scene card and floating panels 16px or 14px. Dense controls step down to 6px and 10px paddings at 28 to 30px tall.
- **At 1100px and below:** the lower rail stacks into one centred column and drops the "Now" label; page grids go to one column; the scene card widens to min(368px, 100% minus 32px); the page may scroll.
- **At 760px and below:** the top rail wraps, with the view tabs on their own 40px row; the wordmark drops to 23px; captions wrap to two lines at 18px; the scene card fills the width with an 8px inset.
- **At 600px and below:** tags over characters show names only.
- **Stream mode** (S): after 2.5s without the mouse moving, the top rail and the rail's tools fade out over 0.8s and the cursor hides. Captions stay, the scene card closes, and only waiting or selected characters keep their tags.
- **`?bare`:** only the 3D place, with no rails, tags, card or grain (for screenshots).

### Named Rules
**The Letterbox Rule.** The picture is never boxed into a card. Chrome lives in the two rails and in layers floating over the picture.

## Elevation & Depth

The frame is flat; the picture is deep. Rails, pages and sections are flat Letterbox Ink divided by hairlines, with no shadows. Layers that float over the picture (scene card, sound panel, YouTube player, replay bar, tooltips) take one soft, dark, ambient shadow. Atmosphere lives in the picture. The 3D place has soft shadows, fog in its horizon colour, bloom on lamps, screens and signs (intensity 0.85, luminance threshold 0.86, smoothing 0.18, mipmap blur) and a vignette (offset 0.28, darkness 0.55). A CSS radial vignette darkens the stage edges (clear to 62%, then Outline Ink at 50%). A film grain covers the whole app: fractal-noise SVG on a 180px tile at 5% opacity, above everything, ignoring the pointer. Each place is colour-graded in CSS like a film still (see The places). The one gradient on chrome is a mask: the scene card's scroll area ends in a 28px fade instead of a cut line.

### Shadow Vocabulary
- **Floating card** (`box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45)`): the scene card.
- **Floating panel** (`box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5)`): the sound panel.
- **Player** (`box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5)`): the YouTube player.
- **Floating bar** (`box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45)`): the replay bar.
- **Tooltip** (`box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5)`): chart and calendar tooltips.

Indicators drawn with box-shadow are not elevation: the 2px tab underline (inset, Subtitle White), today's calendar ring (inset 1.5px, white at 60%) and the search-match mark (an inset stroke under the lower half of the text, white at 24%, like a highlighter).

### Named Rules
**The Flat Frame Rule.** Rails, pages and sections never cast shadows. Only layers floating over the picture do, and only the soft ambient ones above: no offset shadows, no coloured shadows.

**The Lamplight Rule.** Glow is light inside the place (lamps, lanterns, screens, signs, the waiting "!"), made by bloom. Interface chrome never glows.

## Shapes

Square, ruled and stamped. Surfaces (rails, the scene card, page sections, list rows, the mini window) have square corners. Controls (buttons, inputs, selects, chips, segments, pills, tags, stamps, tooltips, calendar cells) take 2px, barely softened. Chart marks take 1px on legend swatches and lane segments; the top segment of a stacked bar takes 4px on its top corners, and sparkline bars 2px. The only circles are the 8px status dots; the idle dot is a hollow 2px ring.

Lines are 1px hairlines almost everywhere, with a 1px dashed hairline between key and value rows. Stamp borders, failed-segment outlines and the today ring are 1.5px. Focus outlines, tab underlines and selection outlines are 2px. Stamps tilt −3°. Icons are inline SVG at 12 to 14px, in currentColor: strokes of 1.6 to 1.8px with square caps, or solid fills.

### Named Rules
**The Square Corner Rule.** 0 for anything that holds content, 2px for anything you press, a circle only for a status dot.

## Components

### Top rail (navigation)
- **Style:** 56px of Letterbox Ink with a hairline below. The wordmark is a 27px title card.
- **View tabs:** Office, Team, History, Recap, at 14px 700 in Muted Paper, full rail height with 14px side padding. Hover turns them Subtitle White; the current view is Subtitle White with a 2px inset underline.
- **Counts:** "5 working", "1 idle", "3 helpers" in Muted Paper 13px 700, with the numerals in Code 600 Subtitle White. While anyone waits, a yellow "N waiting for you" button (32px, ink 800) sits among them and jumps to the next waiting session. "Reconnecting…" is Coral.
- **Right side:** the place switcher (a 32px select), the Mood segmented control (Dusk, Night, Rain), and "Alerts on/off" and "Pop out" as ghost buttons.

### Buttons
- **Shape:** 2px corners.
- **Secondary (default):** Raised Ink fill, Strong Rule border, Subtitle White text, 34px tall, 12px side padding, 13px 700. Hover turns the fill to Lifted Ink.
- **Primary:** Subtitle White fill and border with ink text; hover lifts it to #fffaf0. Used for "Back to live", "Open its terminal" and replay Play.
- **Answer (yellow):** Fansub Yellow with ink text at 13px 800, 34px tall, 14px padding, up to 340px with an ellipsis. It exists only while a session waits: "Answer in terminal · name" brings that session's Terminal tab forward ("Go to name" for a session without a terminal). Hover is #ffe27a.
- **Ghost:** transparent with a Rule border, Paper 2 text, 32px tall. Hover turns the border Strong Rule and the text Subtitle White; pressed gets a Subtitle White border.
- **Text actions:** underlined text with a Strong Rule underline that turns Subtitle White on hover ("Start a 25-minute focus", "+2 more speaking", "Break now").
- **Focus:** a 2px Subtitle White outline with a 2px offset, on every control.

### Segmented controls, chips and pills
- **Segmented:** a Rule-bordered strip of 30px buttons with 10px padding at 12.5px 700 in Muted Paper, split by hairlines. Pressed fills Subtitle White with ink text. Used for Mood, Recap period, replay speed, Team window, music source and the timeline filters.
- **Filter chips:** 28px, 10px padding, Rule border, Paper 2 text, with an optional count in Code 11px Faint Paper. Hover gets a Strong Rule border; pressed fills Subtitle White with ink text and an ink count.
- **Pills:** the status in the scene card head, 12px 800 in the status colour with a 1px outline in the same colour and an 8px status dot.

### Inputs
- **Search:** 40px tall (34px in the timeline and the sound panel), Raised Ink fill, Strong Rule border, 2px corners, 12px padding, 14px text, Faint Paper placeholder. Focus turns the border Subtitle White, with no glow.
- **Select:** 34px (32px for the place switcher), Raised Ink, Strong Rule border, 13px 700.
- **Date range:** 28px fields in Code 12px; the picker icon is recoloured to subtitle white at 75%.
- **Ranges and checkboxes:** native, with a Subtitle White accent.

### The caption rail (signature)
- **Style:** 140px of Letterbox Ink with a hairline above, in three columns.
- **Left:** "Now" as a 24px title card over "N sessions · N helpers · N idle" in Muted Paper 12px 700; clicking it opens "Everyone here" in the scene card (underlined while open). The music corner and the Pomodoro line sit under it.
- **Captions:** up to three lines, centred, announced politely to screen readers. Waiting sessions come first (longest waiting first), then working sessions by most recent activity. Each line is the speaker's name (Speaker type in that session's speaker colour), what it is doing (Caption type) and the elapsed time (Code 600 15px in Paper 2), all outlined. A name longer than about 14 characters' width ends in "…", so it never squeezes what is being said. A waiting line is entirely Fansub Yellow and states the ask: "Can I run build.sh?", "Has a question for you", "Wants you to approve a plan". It takes two rows: the name and time small on top, then the ask at the caption column's full width, a little smaller (down to 18px) in a narrow column, so a laptop shows the whole question. So that the rail still holds them, a waiting line counts as a line and a half: one waiting and two working, or two waiting. Speakers beyond what fits add "+N more speaking"; with nobody speaking the rail says "All quiet. N idle." in Muted Paper. The yellow "Go to …" button ends a long name in "…" inside the button.
- **Karaoke fill:** a running line's text is drawn twice, an unsung copy at 45% white and a lit copy clipped from the right. The lit part grows with the elapsed time over that session's usual time for that kind of call (at least 2s; thinking at least 20s; helpers by their usual time). Without history it uses a rough default (read 3s, edit 4s, run 25s, web 10s, subagent 90s, MCP 8s, plan 20s, other 6s, thinking 12s) and says so in its tooltip. A new line starts at its current fill (empty for a call that has just begun), and the clip eases between the once-a-second updates on a 0.9s linear transition. A full line rests lit; past 1.5× the usual time only the timer turns Peach.
- **Right:** the yellow Answer button while anyone waits, any note from the terminal jump in Peach 12px, and the camera bar: zoom (minus, a 96px slider, plus), presets Wide, Cozy, Top, Window and Desk cam (keys 1 to 5), Follow (F) and Stream (S). Its buttons are 30px at 12.5px 700; pressed fills Subtitle White.
- **Narrow windows:** at 760px and below captions wrap to two lines, and because a two-line caption cannot wipe left to right, it is shown fully lit (the karaoke copy is dropped).

### Tags over characters
- **Style:** subtitle type with no box. The name is 15px 800 in the speaker colour; the current action under it is 12.5px 700 Paper 2, up to 250px with an ellipsis; helper chips are 11.5px 800 Helper Blue (Sage when done, Coral when failed), with a mono count when there are many.
- **States:** selected gets a 2px underline 5px below the name; waiting turns both lines yellow; a leaving character's tag drops to 55% opacity.
- **Behaviour:** tags never overlap; the lower one stays and the other slides up (0.25s). Under 600px only names show.

### The scene card
- **Style:** detail over the picture, top right, 328px wide. Letterbox Ink, a Rule border, square corners and the floating-card shadow.
- **Head** (16px padding): the session title as a 28px title card, balanced; a Code 12px line with the session number (S-007), the speaker-coloured name, project and branch; a ghost close button with a 12px stroked X. Under it, the status pill, model, duration, tool calls and subagent count in Muted Paper 12.5px.
- **Tabs:** Overview, Timeline, Subagents (with count), Tokens: 40px, 13px 700, Muted Paper, and Subtitle White with a 2px inset underline when selected.
- **Body:** 16px side padding, sections divided by hairlines and headed in Label type, ending in the 28px fade. Key and value rows are 13px, label in Muted Paper and value in Code Subtitle White, with a dashed hairline between rows. Bars are 6px on Rule; the context bar is Subtitle White and turns Coral at 60%. The cost is Code 600 at 24px. Quotes are 13.5px Paper 2, kept to 160px tall. Changed files are Code 12px rows with additions in Sage and removals in Coral, the path cut from the left.
- **Needs you:** the Now block of a waiting session (heading, ask and time waited) is all Fansub Yellow.
- **Everyone here:** with no selection, the card lists Needs you (yellow heading), Working and Idle, each row with an 8 by 12px speaker swatch, the action and the cost, then live totals.

### Stamps
- **Style:** end states are stamped so nothing silently disappears. 10.5px 800 uppercase at 0.08em, a 1.5px border in the text colour, 2px corners, tilted −3°.
- **Variants:** Live in Subtitle White, Ended in Muted Paper, Kept in Faint Paper (Claude Code deleted the transcript; this summary was kept).

### Timeline tags
- **Style:** Code 600 10.5px, 2px corners, 1px by 6px padding. A tool tag carries its identity on a tint: the activity's slot colour at 22% alpha under Subtitle White text; a failed tool is Coral at 28%.
- **Known drift, not part of the system:** the non-tool tags (YOU, TASK, CMD, SAID, DONE, FAILED, COMPACT, ERROR, STOP) still use colours from the old purple theme, including a yellow COMPACT tag. Don't copy them.

### Charts
- **Recap daily stack:** SVG drawn at 1:1 width so its 11px Code ticks stay 11px; 240px tall; gridlines white at 8%, baseline at 24%; bars up to 44px wide with a 2px gap between stacked segments; only the top segment gets 4px top corners. Hovering tints the day's column (white at 5%) and shows a tooltip beside the bar that lists the segments top-down, with Other's members; clicking opens that day in History.
- **Ranked bars:** a 120px label, an 8px bar on Rule and a 56px value. Recap's single-day project costs use slot colours; "Most used tools" uses Paper 2.
- **Token mix:** a 12px strip of four slot colours with 2px gaps, over key and value rows with 9px swatches.
- **Team lanes:** a 210px label, a 24px track on white at 4% and a 150px end column. Segments take activity colours with 3px insets; a failed one gets a 1.5px Coral outline. Marks are 2px: prompts Paper 2, compaction a dashed Peach line, errors and interrupts Coral, background tasks finished Sage, and a Subtitle White playhead.
- **Activity calendar:** 12 weeks of 15px cells with 3px gaps and 2px corners on the sequential ramp. Today gets a 1.5px inner ring at 60% white; a selected range gets a 2px Subtitle White outline; future days stay empty. Click a day to filter History; shift-click another for a range.
- **Tooltips:** Letterbox Ink, a Strong Rule border, 2px corners, 8 by 10px padding, 12px text and the tooltip shadow, with values right-aligned in Code.

### Episode title card
- **Behaviour:** when the place changes, an ink card covers the stage. The place name is a 76px compressed title card, centred, with "Episode 1", "Episode 2" or "Episode 3" under it in 20px 800 Paper 2 with a 4px outline. It fades in over 0.35s, holds until the new place has drawn and at least 1.4s have passed, then fades out over 0.6s (cubic-bezier(0.16, 1, 0.3, 1)). It is skipped entirely when reduced motion is set.

### The places
All three places share one floor plan: eight work spots, a lounge corner, a help spot and a door, so placement, walking and tags work the same everywhere. Everything is low-poly and generated in code.

| Place | Work spot | Lounge | Help spot | Around it |
|---|---|---|---|---|
| Night office (Episode 1) | desks with monitors; agents sit | sofa, beanbags, rug, a sleeping cat, floor lamp | help desk with a light strip and a bell | a lit floor near the top of a tower, lower rooftops dropping into haze, a skyline all around; string lights, a crescent-moon sign, the city through the window |
| The ramen bar (Episode 2) | stoves; agents stand in chef hats | staff table with tea | the pass, with a bell and a lamp | a night street: asphalt, sidewalk, dashed centre line and crosswalk, utility poles with sagging wires, street lamps with warm pools of light, a vending machine, low houses; slow-breathing paper lanterns, steaming stock pots |
| The park (Episode 3) | picnic tables with laptops; agents sit | the big tree, a bench and blankets | a kiosk with a bell and a lamp | late autumn: grass to the horizon, groves in green, orange, rust and gold, a low skyline; fireflies after dusk, leaves always falling |

- **Moods** (top rail): Dusk (sky from #1b1a3f at the top to a rose horizon #e48f97, a few stars), Night (#04071a to #26345f, many stars), Rain (#121826 to #3a4458, no stars, rain streaking the office window). Fog takes the horizon colour so ground meets sky softly.
- **Grade:** each place's canvas is graded like a film still: office saturate 0.88, sepia 0.14, hue −8°; ramen 0.92, 0.10, −4°; park 0.90, 0.12, −6°.
- **Music:** string lights and the moon sign pulse a little brighter on each kick when music plays.

What each state looks like:

| In Claude Code | In the place | In the frame |
|---|---|---|
| Working (`busy`) | at its work spot, typing, stirring or on a laptop; its screen scrolls code | a caption line with the karaoke fill; the tag shows the tool and its target |
| Working, no tool running | thought bubbles rise; the tag says "Thinking…" | a "Thinking…" caption filling against its usual thinking time |
| Waiting for you (`waiting`, or a pending AskUserQuestion, plan approval or permission) | walks to the help spot and waves; a yellow "!" spins overhead; its screen shows the yellow alert; the help-spot light turns yellow and pulses | its caption moves to the top in yellow and states the ask; the yellow count and Answer buttons appear; the tab title reads "(N) needs you"; an optional desktop alert |
| Idle (`idle`) | stays at its spot, then after 45 s goes to the lounge | no caption; counted in "N idle" |
| A subagent starts | a helper bot appears, orbiting the character on a sagging leash | the helper count; a helper chip under the tag |
| Workflow agents | bots too; beyond 9 per character, a "+N more" tag | the helper count |
| Session ends (process gone) | walks out of the door | stamped Ended in History |
| New session starts | walks in through the door to a free spot | |

### Music corner
- **Style:** in the lower rail under "Now". Sound stays off until clicked: "Start the music" is a 30px button with a Strong Rule border and a note glyph. Once started, a row holds play or pause, the track title (12.5px 800) over its tempo and key in Code 10.5px Faint Paper, next, and a sliders button.
- **Sound panel:** opens above the button; 340px of Letterbox Ink with a Strong Rule border, 14px padding and the floating-panel shadow. It holds the source (Made here, YouTube, Spotify, Off), "Your own music": a field for a YouTube video or playlist or a Spotify song, album or playlist, with the last six links, volume sliders for Music and Room sounds, and Mute everything. "Your music" beside "Start the music" opens it at the field.
- **YouTube player:** stays visible at 356 by 200px (YouTube's minimum), bottom left above the rail, black with a Strong Rule border.
- **Spotify player:** Spotify's own compact player, 356 by 152px with rounded corners, in the same place. It is played and skipped with its own buttons (no Spotify script runs on the page), so the rail's play and skip buttons are greyed out while it is the source.

### Pomodoro
- **Style:** a line of text, not a widget. At rest, "Start a 25-minute focus" as an underlined text action, with today's rounds. Running, "Focus" in Subtitle White 800 (or "Break" in Sage), the time left in Code 13px, then "Break now" or "End break" and "Stop".
- **In the place:** the wall clock shows the real time and fills a ring around its face during a focus round or break; clicking the clock starts or stops a round.

### Mini window
- **Style:** "Pop out" opens a 340 by 460px always-on-top window (Chrome's Document Picture-in-Picture) that carries the page's styles. A 22px "Now" title card over "N sessions · N waiting for you"; then rows of name (13px 800, speaker colour), action (15px 800) and elapsed time (Code 12px), separated by hairlines.
- **States:** waiting rows come first and are all yellow; idle rows drop to Faint Paper at 13px. Clicking a row brings that session's Terminal tab forward. The window title counts waiting sessions.

### Named Rules
**The Karaoke Rule.** A running caption fills once, left to right, against how long that kind of call usually takes in that session, then rests lit. Running long is said by the timer turning Peach, never by the line flashing or turning another colour.

**The Stamp Rule.** End states are stamped (Live, Ended, Kept) so nothing silently disappears from History.

## Do's and Don'ts

### Do:
- **Do** reserve Fansub Yellow (#ffd84a) for waiting, and show a waiting session in yellow everywhere it appears: caption, count, Answer button, scene card, mini window and the place.
- **Do** set every figure read as data (times, costs, tokens, tallies, IDs, chart ticks) in M PLUS 1 Code with tabular figures.
- **Do** outline text that sits over the picture with Outline Ink (#05060a) painted under the fill: 5px for captions, 4px for names, 3px for secondary lines.
- **Do** divide sections with 1px hairlines on the ink ground (subtitle white at 13%, 26% for section tops) instead of boxing them.
- **Do** keep corners square: 0 on surfaces, 2px on controls, 4px only on the top of a chart bar.
- **Do** give every status a word and a position, not only a colour: waiting lines come first and state the ask, pills and stamps spell the state, the idle dot is hollow.
- **Do** assign chart series from slots 1 to 5 in order and fold the rest into Other (#7a7568); draw sequential data on the paper-on-ink ramp.
- **Do** honour reduced motion: transitions and animations stop and the episode card is skipped.

### Don't:
- **Don't** use yellow for highlights, warnings, compaction, focus or decoration.
- **Don't** put glass, glow, gradient fills or neon on interface chrome; bloom belongs to the lamps inside the picture.
- **Don't** colour chart series with the speaker pastels, or names with the chart slots.
- **Don't** box captions or tags in pills or panels, and don't wrap the picture in a card.
- **Don't** build a corporate dashboard (rows of big-number tiles) or a hacker or neon-cyberpunk look; Recap tells the period as one narration sentence instead.
- **Don't** letter-space titles to fit; compress the Mincho to 82% instead.
- **Don't** add a second accent colour for selected or active states; active is Subtitle White, as an underline, a fill or an outline.

## The job

"I run 3 to 6 Claude Code sessions, plus their subagents and workflows. At a glance I need to know
who is working, who is waiting for me, what each one is doing and what it is costing. Later I want
to see what happened."

## Principles (from the research)

1. **Nothing to install into Claude Code.** No hooks, no settings changes. Users punished Pixel Agents
   for editing `settings.json` (1-star review), and hooks block every tool call.
2. **Status you can trust.** Use Claude Code's own live-session file, not guesses from timers.
3. **Every agent counts.** Agent-tool subagents, teammates and Workflow agents are all drawn.
4. **Honest numbers.** Count each API message once; label cost as an estimate at list prices.
5. **History on disk.** Survives restarts and Claude Code's 30-day transcript cleanup.
6. **Keep the joy.** The coworker feeling is the thing users love; the data sits one click away.

## Views

How each view looks is in Components above; this is what each one holds.

### Office
The live place: one of three places (Night office, The ramen bar, The park) in one of three moods (Dusk,
Night, Rain). Every character has an always-on tag: the session name Claude Code shows, the tool it is
running and the file or command. Drag to orbit, scroll to zoom; + and − zoom, 0 resets, 1 to 5 pick a
camera preset, F follows the selected agent, S toggles stream mode, Esc closes. The lower rail captions
every busy session; "Alerts" turns on desktop notifications for waiting sessions; "Pop out" opens the
mini window.

### Scene card (click a character, a bot, a tag or a caption)
- **Overview**: what it is doing now and for how long; context window used (input + cache read + cache
  write of the newest turn, against the model's window); tokens; estimated cost split into main agent
  and subagents (plus Claude Code's own cost record when there is one); last prompt; files changed;
  "Open its terminal", "Copy resume command" and "Copy transcript path".
- **Timeline**: newest first, one row per prompt, tool call, message, notification or compaction, with a
  search box. Filters: all, prompts, tools, subagents, errors and loops. A file read three or more times
  is flagged as a possible loop. Click a subagent's name to see only its rows.
- **Subagents**: each one with type, task, status (running, done, failed), what it is doing now, tool
  calls, tokens, cost, model and what it returned. Workflow runs are grouped with their phases.
- **Tokens**: token mix, context after each turn, main vs subagents, cost by model, and how we count.

Without a selection, "Now" in the lower rail opens "Everyone here": needs you, working, idle.

### Team view
One session as swim lanes over time: the main agent on top, every subagent below, coloured by kind of
work (read and search, edit and write, run a command, subagents, web, asks you). Windows: 15 min,
1 hour, 4 hours, all. Side cards: what is running now with its last output, and what the latest
finished subagent handed back (tokens spent inside it vs about how many it added to the main context).

### History
All sessions, newest first, grouped by day, searchable by title, prompt, folder or branch, with filters
and a 12-week activity calendar. Empty sessions are hidden. Each report: what you asked, how it ended,
duration, prompts, tool calls, subagents, tokens, cost, tools used, files changed, pull requests.
**Replay** plays the session back at 10× to 600×, skipping quiet stretches; "Watch in the office"
replays it with the characters and bots. Sessions whose transcript Claude Code has deleted stay listed,
stamped "Kept".

### Recap
What the agents did per period (Today, Yesterday, This week, Last 7 days, This month, Last 30 days): one
narration sentence (agent time, sessions, tokens, estimated cost, prompts answered, lines changed),
estimated cost per day stacked by project (click a day to open it in History), a projects table, the
most used tools and cost by model.

## Architecture

```
 Claude Code (any terminal, editor, headless)          Agent Office (this folder)
 ───────────────────────────────────────────          ─────────────────────────────────────────────
 ~/.claude/sessions/<pid>.json  ── every 1 s ──▶  live.mjs    registry + pid check → status, who is in
 ~/.claude/projects/<dir>/<id>.jsonl ─ new bytes ▶  jsonl.mjs   incremental reader (skips big blobs)
   <id>/subagents/agent-*.jsonl + .meta.json        model.mjs   agents, tool calls, tokens, timeline,
   <id>/subagents/workflows/<run>/agent-*.jsonl                 subagents, workflow runs, files
   <id>/subagents/workflows/<run>/journal.jsonl     pricing.mjs list prices, context windows
   <id>/workflows/<run>.json                        store.mjs   discovery, LRU, ~/.agent-office/cache
                                                    index.mjs   HTTP + server-sent events, 127.0.0.1
                                                         │
                                                         ▼
                                          Browser: React 19 + react-three-fiber 9 + drei
                                          office/   3D places (Room, worlds/, Environment, Desk,
                                                    Person, Bot, labels)
                                          panels/   caption rail, scene card, team view, history,
                                                    recap, music, mini window
```

- **API**: `GET /api/office` (live snapshot), `/api/stream` (server-sent events), `/api/session/:id`
  (detail; `events`, `agent`, `from`, `to`), `/api/history` (`q`, `empty`), `/api/meta`.
- **No dependencies on the server.** It runs on the Node that is already installed (20.12 here).

## How each number is computed

| Number | Source and rule |
|---|---|
| Status | `status` and `waitingFor` in `~/.claude/sessions/<pid>.json`; process alive (`kill -0`, and `ps` to catch reused pids); a pending AskUserQuestion or ExitPlanMode also means "needs you" |
| Current tool | Newest `tool_use` without a matching `tool_result` (joined on the tool_use id) |
| Tokens | `message.usage` per API message, deduplicated by `message.id`, keeping the largest value of each field. Claude Code writes one line per content block and repeats the usage on each; streamed lines can carry partial output counts. Summing every line would report 2.5 to 4 times too many output tokens on this machine |
| Context window | input + cache read + cache write of the newest main-agent message, against 1M for current models (200K for older ones, unless the model id ends in `[1m]`) |
| Cost | Tokens × API list price per model and cache type (5-minute and 1-hour writes priced separately), web searches at $10 per 1,000, fast mode ×2. Checked against Claude Code's own `cost-state` records: within 0 to 7%, ours slightly lower (Claude Code also spends tokens on background calls that never reach the transcripts) |
| Subagent status | Done when its meta file says finished, its completion notification arrived, the parent got its result, or its Workflow journal has a result; failed when the notification says so |
| Headless runs | A transcript changing in the last 2 minutes with no live-session entry; leaves after 10 quiet minutes |

## Safety and privacy

- Read-only on `~/.claude`; never reads the `<pid>.*.key` files next to the session files.
- Listens on 127.0.0.1 only and refuses requests whose Host header is not its own (blocks DNS
  rebinding). GET and HEAD only. Content Security Policy on the page.
- No network calls except the opt-in YouTube or Spotify music players; fonts are bundled.
- Our own data lives in `~/.agent-office/` (outside iCloud): one JSON summary and report per session.

## Performance

- Live sessions are read incrementally, only new bytes, once a second.
- Lines that are never needed (`api-request-blob`, up to 1.6 MB each) are skipped before parsing.
- First full index of 108 sessions (4 GB of transcripts) took about 30 s in the background; after
  that a report opens in about 0.05 s from cache.
- Each 3D place is a few hundred meshes, all generated in code (no downloaded models, so no licence
  questions), with bloom, a vignette and soft shadows.

## Known limits and next steps

- Claude Code only. The most requested thing in the research is Codex, Copilot and OpenCode support;
  the transcript reader is its own module, so adapters can be added.
- Undocumented internals: the live-session file, the subagent folder layout and `cost-state` can change
  with any Claude Code release.
- Context percentage assumes the model's full window; Claude Code may compact earlier.
- Up to 8 work spots; more sessions stand at overflow spots. Up to 9 bots per character, then "+N".
- Not done yet: answering a permission prompt from the office ("Answer in terminal" only brings the
  Terminal tab forward), plan-level usage bars (needs a status line wrapper, which means editing
  settings), rename agents in the UI, phone layout polish.
