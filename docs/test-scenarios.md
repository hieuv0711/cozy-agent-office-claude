# Test Scenarios: Agent Office 3D

**Source**: feature description of the app (themes, people, weather, camera, customize, History,
Recap, Team, caption rail, layout, speed, edge cases), November 2026.
**Total scenarios**: 110
**Coverage**: happy paths, edge cases, error handling, security and privacy, performance,
accessibility.
**Automation**: every scenario has a Playwright test in `tests/e2e/`, named after its ID
(for example `PE-09`). Run them with `npm run test:e2e`.

How to read the IDs: SH app shell, PE people, WX weather, CA camera, SE selection, CU customize, FU furniture people use,
HI History, RE Recap, TE Team, RA caption rail, LA layout, PF speed, AX accessibility,
ED edge cases and errors, SC security and privacy.

Unless a scenario says otherwise, it runs on the built app at `http://127.0.0.1:4777` with
`?demo&test`. `demo` gives seven made-up sessions (four loop through a working day), and `test` turns
on the read-only test hooks (`window.__crew`, `__dining`, `__ao`).

---

## 1. App shell

### SH-01: Open the app
**Tests**: the app opens and shows the 3D place with everyone in it
**Preconditions**: server running; fresh browser profile
**User role**: developer with Claude Code sessions

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/?demo&test` | Top bar shows "Agent Office", the tabs, the theme picker, Customize, Alerts, Pop out |
| 2 | Wait for the scene | A title card shows the theme's name, then fades once the room has drawn |
| 3 | Look at the stage | The room is drawn (canvas not blank), seven people, each with a name tag |

**Postconditions**: no errors in the console
**Priority**: Critical

---

### SH-02: Switch views with the tabs and the address
**Tests**: tabs, hash routes, browser history
**Preconditions**: SH-01
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Team, History, Recap, then the scene tab | Each view opens; the address becomes `#team`, `#history`, `#recap`, `#office` |
| 2 | Open `/#history` directly | History opens |
| 3 | Press the browser's Back button | The previous view comes back |

**Postconditions**: the scene is drawn again when you return to it
**Priority**: High

---

### SH-03: Choose a theme
**Tests**: theme picker, tab name, saved choice
**Preconditions**: SH-01
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Pick "Kitchen" | The kitchen opens; the scene tab says "Kitchen"; everyone is a cook |
| 2 | Pick "Toy workshop" | The workshop opens; the tab says "Workshop"; everyone is a toymaker |
| 3 | Reload the page without `?world` | The last theme opens again |

**Postconditions**: the choice is saved in the browser
**Priority**: Critical

---

### SH-04: Address parameters
**Tests**: `?world=`, `?weather=`, `?demo`
**Preconditions**: a saved theme and weather that differ from the parameters
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `/?demo&world=workshop&weather=snow` | The workshop opens in snow, whatever was saved |
| 2 | Open `/?world=nowhere` | Falls back to the theme you last used (the night office if none), no error |
| 3 | Open without `demo` | Real sessions are shown (or the empty sentence if none run) |

**Postconditions**: none
**Priority**: High

---

### SH-05: Counts and the tab title
**Tests**: top-bar counts, browser tab title
**Preconditions**: demo (1 waiting, some working, some idle, 2 helpers)
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Read the top bar | "N working", "1 waiting for you" (highlighted yellow), "N idle", "2 helpers"; the numbers match the sessions |
| 2 | Read the browser tab | "(1) needs you · Agent Office" |
| 3 | Wait until a demo session changes state | The counts follow within a few seconds |

**Postconditions**: none
**Priority**: High

---

### SH-06: Alerts switch
**Tests**: desktop notification switch
**Preconditions**: notification permission can be granted
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Alerts off" | Permission is asked; the button reads "Alerts on" and is pressed |
| 2 | Reload | Still "Alerts on" |
| 3 | A session starts waiting | A desktop notification names the session and why it waits |
| 4 | Click "Alerts on" | Reads "Alerts off" |

**Postconditions**: no notification after switching off
**Priority**: Medium

---

### SH-07: Pop out
**Tests**: the small always-on-top window
**Preconditions**: Chrome with Document Picture-in-Picture
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Pop out" | A small window opens listing everyone's status |
| 2 | Close it | The main page carries on |

**Postconditions**: none
**Priority**: Medium (the button is hidden where the browser can't do this)

---

### SH-08: Title card
**Tests**: the card between themes
**Preconditions**: motion not reduced
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Change theme | A title card with the theme's name and episode covers the change |
| 2 | Wait | It fades within about 2 s of the new room drawing |

**Postconditions**: none
**Priority**: Low

---

### SH-09: npx, and the editor panel
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | `npx cozy-agent-office-claude --version`, `--help`, `--port nope`, `--frobnicate` | The version; the options; "The port must be a whole number from 1 to 65535"; "Unknown option" (exit 2) |
| 2 | Run it with `--port 4791 --no-open` | It says it serves http://127.0.0.1:4791/; `/api/meta` names the package and version; the page refuses to be framed (`frame-ancestors 'none'`, `X-Frame-Options: DENY`) |
| 3 | Run it as the VS Code / Cursor extension does (`AGENT_OFFICE_EMBED=vscode`) | The page may be framed by the editor's webview (`frame-ancestors vscode-webview:`), and still lets in only YouTube's and Spotify's players |

The servers keep their notes in a folder of their own and are stopped by their own process. The extension itself (`vscode/`, packed with `npm run build:vscode`) was tried in VS Code 1.146 in a profile of its own (`code --extensions-dir … --user-data-dir … --install-extension …vsix`): the bottom panel and the editor tab both draw the room. A fresh Cursor profile stops at Cursor's sign-in, so try it there in your own Cursor ("Install from VSIX…").

**Tests**: the npx command · **Preconditions**: a built app (`dist/`), Claude Code data on the machine · **User role**: user · **Priority**: High

---

### SH-10: The room alone, in the editor's panel
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `?embed=panel` in a 1100 × 320 pane (the extension's bottom panel) | The room fills the pane with its name tags; no top bar, no captions; a small bar: "4 working", "1 waiting", "2 idle", More |
| 2 | Click someone's tag | No card opens over the room |
| 3 | Click More, then Room only | The whole app (top bar with the Weather choice, the captions); then the room alone again |
| 4 | Open `?embed=tab` (an editor tab), then the plain address | The whole app with a Room only button; in the browser, no such button |

**Tests**: the editor panel · **Preconditions**: SH-01 (`?demo`) · **User role**: user · **Priority**: Medium

---

## 2. People

### PE-01: Everyone gets a person
**Tests**: one person and one tag per session
**Preconditions**: demo
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Count the name tags | One per session (7) |
| 2 | Read a working session's tag | Its name, and under it what it is doing ("Edit OrderList.tsx", "Thinking…") |
| 3 | Read the tag of a session with helpers | "+2" after the name |

**Postconditions**: none
**Priority**: Critical

---

### PE-02: Working people act out their tool
**Tests**: the act for each tool kind, per theme
**Preconditions**: demo; each theme in turn
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Watch a session that edits | Office: types; Kitchen: chops; Workshop: saws |
| 2 | Watch one that runs a command | Office: watches the screen; Kitchen: stirs; Workshop: hammers |
| 3 | Watch one that reads | Office: reads a printout; Kitchen: an order ticket; Workshop: the blueprint |
| 4 | Watch one that searches the web | Office: phone call; Kitchen: recipe book; Workshop: digs in the parts tray |

**Postconditions**: none
**Priority**: High

---

### PE-03: Thinking keeps them busy
**Tests**: "thinking" never looks idle
**Preconditions**: a session thinking for 30 s or more
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Watch the person for 30 s | They change small jobs every few seconds (Office: chin on hand, notes, a sip; Kitchen: taste, strain, wipe; Workshop: turn a toy over, sand, measure) |

**Postconditions**: none
**Priority**: Medium

---

### PE-04: A long command sends them to the machine
**Tests**: trips for long commands
**Preconditions**: a session running one command for more than about 5 s
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Office | They walk to the printer by the door; it prints a page every 1.5 s while they wait |
| 2 | Workshop | They walk to the lathe (it spins up) or the drill press, whichever is on their side and free |
| 3 | Kitchen | They walk to a big broth pot on the back line and ladle |
| 4 | The command ends | They walk back to their own spot |

**Postconditions**: the machine stops (lathe spins down, printer stops)
**Priority**: High

---

### PE-05: Planning, long thinking, long searching
**Tests**: other trips
**Preconditions**: demo
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Office: a session plans | They sketch on the task board |
| 2 | Office: a session thinks for a long time | They go to the board or make an espresso |
| 3 | Workshop: a long web search | They browse the shelves |

**Postconditions**: they come back when the task changes
**Priority**: Medium

---

### PE-06: One person per place
**Tests**: places are not shared
**Preconditions**: two sessions want the same place
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Two sessions run long commands on the same side | One takes the near machine, the other the free one (or stays at their spot) |
| 2 | Watch | Two people never stand on the same spot |

**Postconditions**: none
**Priority**: Medium

---

### PE-07: Office end of turn
**Tests**: the task board
**Preconditions**: office; a session finishes a turn (working, then idle)
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Watch the board | A note per working session in "Doing", a yellow one per waiting session |
| 2 | A session finishes | Its person walks to the board and moves a note to "Done" |
| 3 | Reload | Today's "Done" notes are still there |

**Postconditions**: a new day starts with an empty "Done"
**Priority**: High

---

### PE-08: Workshop end of turn
**Tests**: toys delivered to the counter
**Preconditions**: workshop; a session finishes a turn
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | A session finishes | Its toymaker carries a toy to the shop counter and sets it down |
| 2 | Look at the counter | Up to four of today's newest toys wait there |

**Postconditions**: none
**Priority**: High

---

### PE-09: Kitchen end of turn: the cook serves a customer
**Tests**: plating and serving, with no waiter
**Preconditions**: kitchen; a session finishes a turn; a table seat is free
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | A session finishes | Its cook plates a bowl at their station |
| 2 | Watch the street door | A customer comes in and sits at a free table |
| 3 | Watch the cook | The cook carries the bowl to that customer and sets it down |
| 4 | Watch the customer | They eat, and after one to two minutes they leave by the street door |

**Postconditions**: the cook goes back to their spot (or to sit down, idle)
**Priority**: Critical

---

### PE-10: Kitchen: only the cooks until a dish is ready
**Tests**: no one who isn't an agent stands around
**Preconditions**: kitchen; nobody has finished a turn since the page opened
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open the kitchen | Only cooks (sessions) and their apprentices (helpers); no waiter, no customers |
| 2 | A customer comes in (PE-09) | They wear outdoor clothes (coat, hat or umbrella), clearly not a cook's whites |
| 3 | All seats are taken when a dish is ready | The bowl waits on the pass for a while, then is taken away |

**Postconditions**: none
**Priority**: High

---

### PE-11: Waiting for you
**Tests**: the waiting line
**Preconditions**: a session needs you (permission prompt or question)
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Watch | The person walks to a waiting spot, under a lamp that turns yellow |
| 2 | Look at them | A yellow "?" over their head; their tag says why ("Permission prompt: Bash") |
| 3 | Look at the rail | "Go to <name>" button; the caption is yellow |
| 4 | A second session waits | They take the second lamp; a third waits beside them |

**Postconditions**: when answered, they walk back to work and the lamp dims
**Priority**: Critical

---

### PE-12: Idle
**Tests**: seats, mugs, naps, dozing
**Preconditions**: idle sessions
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | A session goes idle | Its person sits in the idle corner with a mug |
| 2 | After 2.5 minutes idle | They nap ("Zz") |
| 3 | More idle sessions than seats | The extra ones doze at their own work spot |

**Postconditions**: none
**Priority**: High

---

### PE-13: Coming and going
**Tests**: arrivals and departures
**Preconditions**: a session starts or ends while the page is open
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | A session starts | A person comes in through the door and walks to a free spot |
| 2 | A session ends | Its tag says "Went home"; the person walks out the door and fades |

**Postconditions**: the spot is free again
**Priority**: High

---

### PE-14: Helpers
**Tests**: running subagents
**Preconditions**: a session with running subagents
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Watch | Up to three small helpers per session walk from their person to the theme's helper spots (Office: back desk; Kitchen: back line; Workshop: paint table), else to free work spots |
| 2 | A subagent finishes | Its helper leaves |

**Postconditions**: none
**Priority**: High

---

### PE-15: Choose how the people are drawn
**Tests**: the People choice, saved
**Preconditions**: SH-01
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open the top bar's "People" choice | Two: Little bots (the default) and Ink toon |
| 2 | Pick each in turn | Everyone is drawn that way: bots with a screen for a face, or cel-shaded ink people |
| 3 | Reload | The last one picked is kept |
| 4 | A browser that had the old Classic people saved opens the app | The little bots, and the choice shows Little bots |

**Postconditions**: none
**Priority**: Medium

---

### PE-16: Both styles dress for the weather
**Tests**: the wardrobe in each style
**Preconditions**: PE-15; the kitchen
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | In both styles, Rain | Every cook wears a rain jacket with its hood, and keeps the work hat |
| 2 | In both styles, Snow | Every cook wears a knitted scarf |

**Postconditions**: none
**Priority**: Medium

---

### PE-17: A helper says what it is doing
**Tests**: helper tags and their tooltips (`helperTitle`, `helperOf`, `helperTip` in lib/session.ts)
**Preconditions**: `?demo` (web-shop-81 has an Explorer on a search and a Planner)
**User role**: user

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Look at the helpers' tags | Each shows its task ("Find where orders are loaded"), or a teammate's name; none says just "Helper", "Explorer" or "Planner". Under it, whose helper it is: "Explorer for web-shop-81" |
| 2 | Rest the pointer on the Explorer's tag | Its tooltip: the task, "Explorer for web-shop-81", "Now: Grep useOrders", when it started and how many steps so far, and what an Explorer does |
| 3 | Rest on the Planner's tag | "Planner for web-shop-81", "Now: thinking" |
| 4 | Rest on the "+2" on web-shop-81's tag | It says two helpers are working on parts of its task |

**Postconditions**: none
**Priority**: Medium

---

### PE-18: A line points from each helper to its session
**Tests**: the lines between tags (tide/Labels.tsx)
**Preconditions**: a session waiting on two running helpers (an Explore and a Plan), sitting away from them; another session with none
**User role**: user

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Look at the room | The helpers' tags say "Explorer for lk-lead" and "Planner for lk-lead". A faint dotted line runs from each to lk-lead's tag; none for the session without helpers |
| 2 | Point at lk-lead's tag | Both lines light up, each from the top of a helper's tag to the edge of lk-lead's, and the helpers' tags brighten |
| 3 | Point at its "+2" | The tooltip says the lines join them to this tag. (lk-lead is idle, so pointing at its tag opens a second line, "Idle 48 s", below the name; the name and its "+2" stay where they are, under the pointer) |
| 4 | Move away, then point at a helper's tag | The lines go faint, then light again, and lk-lead's tag brightens |
| 5 | Select lk-lead, and move the pointer away | Its lines stay lit while it is selected |

Tags that touch get no line (their "for" line says it). At phone widths the helpers' tags and the lines are left out.

**Postconditions**: none
**Priority**: Medium

---

## 3. Weather

### WX-01: Switch the weather
**Tests**: the switch, saving, all themes
**Preconditions**: SH-01
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Pick Clear, Sunny, Rain, Snow in the top bar's Weather choice | It shows the one picked; there is no Storm any more |
| 2 | Reload | The weather is still the last one picked |
| 3 | Change theme | Same weather in the new theme |
| 4 | Open with a storm saved by an older version, or with `?weather=storm` | Rain (and it is saved as rain) |

**Postconditions**: none
**Priority**: Critical

---

### WX-02: The whole picture changes
**Tests**: weather is not only in the windows
**Preconditions**: SH-01
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Sunny | The sun comes in through the windows (patches of light on the floor and tops, soft beams); the room is brighter and warmer; nothing falls; the glass is dry |
| 2 | Rain | Rain falls across the whole view; drops run down the edges of the view; the room is cooler and dimmer |
| 3 | Snow | Snow drifts across the view; frost in the corners; snow on the sills; brighter, cooler light |
| 4 | Look at the middle of the view | Clear enough to see everyone |

**Postconditions**: none
**Priority**: High

---

### WX-03: A sunny day
**Tests**: sunshine in every theme
**Preconditions**: Sunny
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Look out of the windows, in each theme | A daytime view: blue sky, a few clouds, the buildings in sunlight, no lit windows or street lamps |
| 2 | Look at the floor and the furniture | Patches of sun shaped like the windows (with their bars), soft beams from each window, a little dust in the light |
| 3 | Look at the room | Brighter, warm daylight |
| 4 | Watch for a few seconds | The light holds steady (nothing flashes) |
| 5 | Click Clear | The sun goes in within a few seconds and the night is back in the windows |

**Postconditions**: none
**Priority**: High

---

### WX-04: People dress for the weather
**Tests**: clothes follow the weather
**Preconditions**: each theme in turn
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Rain | Everyone (helpers too) wears a rain jacket in their own colour over their clothes; cooks keep their hats |
| 2 | Snow | Everyone wears a knitted scarf in their colour; people without a work hat wear a beanie |
| 3 | Sunny | Their usual clothes and hats: no rain jacket, scarf or beanie |
| 4 | Clear | Back to their usual clothes |
| 5 | Kitchen customers coming in | Rain: rain jacket and umbrella; Snow: coat, scarf and beanie; Clear: a jacket; Sunny: a shirt, sunglasses and a straw hat |

**Postconditions**: the change happens without a reload
**Priority**: High

---

### WX-05: People react to the weather
**Tests**: behaviour, not only clothes
**Preconditions**: demo
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Snow, idle people | They hold a hot drink in both hands, steaming |
| 2 | Sunny | An iced drink instead |
| 3 | Clear | Back to the usual mug |

**Postconditions**: none
**Priority**: Medium

---

### WX-06: Back to clear
**Tests**: weather fades out
**Preconditions**: Rain
**User role**: developer

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Clear | The rain stops within about 3 s and the glass dries within about 8 s |

**Postconditions**: nothing left falling
**Priority**: Medium

---

## 4. Camera

### CA-01: Shots by button and by key
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Wide, Close, From above, Side | The camera moves; the clicked shot is pressed |
| 2 | Press 1, 2, 3, 4; then 0 | Same shots; 0 goes back to Wide |

**Tests**: presets · **Preconditions**: SH-01 · **User role**: developer · **Priority**: High

---

### CA-02: Zoom
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click + and − | The view zooms; the slider follows |
| 2 | Drag the slider; press + and − keys | Same |

**Tests**: zoom · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Medium

---

### CA-03: Close-up
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | With nobody selected | Close-up is disabled |
| 2 | Select someone, click Close-up (or press 5) | The camera frames that person from the front |

**Tests**: close-up · **Preconditions**: SH-01 · **User role**: developer · **Priority**: High

---

### CA-04: Follow
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select someone, click Follow (or press F) | Pressed; the camera keeps them in view as they walk |
| 2 | Click again | Released |

**Tests**: follow · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Medium

---

### CA-05: Stream mode
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Stream (or press S) | The interface hides; the camera drifts between shots |
| 2 | Click "Exit stream" or press Esc | Everything comes back |

**Tests**: stream · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Medium

---

### CA-06: The camera stays in front of the room
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Drag far left, right, up, down; zoom far out | It stops before going round a wall, below the floor, or far away |

**Tests**: limits · **Preconditions**: SH-01 · **User role**: developer · **Priority**: High

---

### CA-07: Each theme remembers its angle
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Drag the office view to an angle; switch to the kitchen | The kitchen opens at its own angle |
| 2 | Back to the office, or reload | The office angle you left is back |

**Tests**: saved angle · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Medium

---

### CA-08: Tall windows
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open on a phone-shaped window | The shot pulls back so the whole room fits |

**Tests**: portrait fit · **Preconditions**: 390×844 window · **User role**: developer · **Priority**: Low

---

## 5. Selecting someone

### SE-01: Select by name tag
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click a name tag | A card opens with the session's title; a ring under the person |
| 2 | The session has helpers | Its helpers' tags appear |

**Tests**: selection · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Critical

---

### SE-02: Card tabs
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Overview, Timeline, Subagents, Tokens | Each opens its section |

**Tests**: detail card · **Preconditions**: SE-01 · **User role**: developer · **Priority**: High

---

### SE-03: Close the card
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Press Esc | The card closes |
| 2 | Select again, click empty floor | The card closes |

**Tests**: closing · **Preconditions**: SE-01 · **User role**: developer · **Priority**: High

---

### SE-04: Double-click to focus
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Double-click a person | They are selected and the camera moves in on them |

**Tests**: focus · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Low

---

### SE-05: People can't be picked while customizing
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open Customize, click a person | Nothing is selected |

**Tests**: modes · **Preconditions**: CU-01 · **User role**: developer · **Priority**: Low

---

## 6. Customize

### CU-01: Open and close
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Customize | A panel "Around the office" with picture tiles; the button reads "Customizing" |
| 2 | Click Done | The panel closes |

**Tests**: panel · **Preconditions**: SH-01 · **User role**: developer · **Priority**: High

---

### CU-02: Place on the floor
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Pick a floor item (Monstera), click open floor | It stands there and is selected |

**Tests**: placing · **Preconditions**: CU-01 · **User role**: developer · **Priority**: Critical

---

### CU-03: Where things may go
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Pick a wall item, click the floor | Not placed |
| 2 | Click a wall | Placed flat on the wall |
| 3 | Pick a small item, click a work spot (a desk where someone works) | Not placed |

**Tests**: surfaces · **Preconditions**: CU-01 · **User role**: developer · **Priority**: High

---

### CU-04: Edit a placed item
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Turn left, Turn right | It turns |
| 2 | Bigger, Smaller | It grows and shrinks |
| 3 | Duplicate | A copy appears beside it |
| 4 | Remove | It is gone |

**Tests**: editing · **Preconditions**: CU-02 · **User role**: developer · **Priority**: High

---

### CU-05: Reset the theme
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Reset theme" | It asks "Click again to reset" |
| 2 | Click again | The theme's own layout is back |

**Tests**: reset · **Preconditions**: CU-02 · **User role**: developer · **Priority**: Medium

---

### CU-06: Saved per theme
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Place an item in the office, reload | It is still there |
| 2 | Open the kitchen | The office item is not in the kitchen |

**Tests**: saving · **Preconditions**: CU-02 · **User role**: developer · **Priority**: High

---

### CU-07: Shortcut keys are off while customizing
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | In Customize, press 3 and S | The camera doesn't jump; stream doesn't start |

**Tests**: modes · **Preconditions**: CU-01 · **User role**: developer · **Priority**: Low

---

### FU-01: Breaks at what you add
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Put a water cooler on the office's open floor; one session idle | The cooler becomes a place people use (`window.__walkmap`), with a spot in front of it |
| 2 | Wait | The idle person sits down first, then walks over and drinks at the cooler |
| 3 | Wait 15 s | They go back to a seat |

**Tests**: furniture people use · **Preconditions**: a saved layout with only the cooler · **User role**: developer · **Priority**: High

---

### FU-02: A stool is one more seat
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Put a stool in the kitchen's front corner; five sessions idle (the staff table seats four) | The stool is a seat |
| 2 | Wait | Four sit at the staff table with a mug, the fifth on the stool |

**Tests**: extra seats · **Preconditions**: `?breaks=0` · **User role**: developer · **Priority**: Medium

---

### FU-03: Work sends them to the right thing
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Put a bookshelf in the office; a session keeps reading files | After about 6 s of reading, the worker walks to the bookshelf and browses |
| 2 | The session starts editing | Back to their desk |

**Tests**: work trips to furniture · **Preconditions**: none · **User role**: developer · **Priority**: Medium

---

### FU-04: Walkways stay clear
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Customize: pick a water cooler, point at the aisle between the desks | It won't go there; the panel says "People walk here: keep the way clear." A click adds nothing |
| 2 | Point at the open floor in front of the desks, click, Done | It goes down, and people can use it |

**Tests**: placement rules · **Preconditions**: CU-01 · **User role**: developer · **Priority**: High

---

### FU-05: The way to everything goes round everything
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open each theme with its own things | Every way from the aisle to a thing people use is clear of furniture on the walk map; each theme has more than two such things |

**Tests**: walk map, routes · **Preconditions**: none · **User role**: developer · **Priority**: Medium

---

## 7. History

Unless a scenario says otherwise, History runs on the made-up history `?demo` brings
(`web/src/panels/history-demo.ts`): a few weeks of sessions in six projects, with helpers, failed
steps and their reasons, waits for an answer, one empty session, two kept after cleanup, and the
seven sessions the scene shows still running. No real project shows.

### HI-01: The diary opens
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open History while the server is slow | "Opening the diary…" over a few grey placeholder cards, then the sessions |
| 2 | Look at the days | A page per day (Today, Yesterday, then dates), newest first, each with its number of sessions |
| 3 | Read a card | What was asked, the project, how it ended and how long it worked, in words; no money or token figures |

**Tests**: diary · **Preconditions**: a made-up, slow server answer for step 1 · **User role**: developer · **Priority**: Critical

---

### HI-02: Search
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Press "/" | The search box takes the focus |
| 2 | Type two words | Only sessions with both stay; a hint says how the search works |
| 3 | Type a file name only found inside a session's steps | That session, with the matching line and the word marked |
| 4 | Type nonsense, then press Escape | "Nothing in the diary mentions “…”." with a suggestion; Escape clears it |

**Tests**: search · **Preconditions**: HI-01 · **User role**: developer · **Priority**: High

---

### HI-03: Filters
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | When: Today, then Last 30 days | Only today's page, then more |
| 2 | Project: one of them (listed A to Z) | Only that project's sessions |
| 3 | Show: Still running, With failed steps, Kept after cleanup | The seven running ones; only sessions where a step failed, each saying how many; the two kept ones |
| 4 | When: Pick dates…, then Clear filters | A custom range in words; then everything again |

**Tests**: filters · **Preconditions**: HI-01 · **User role**: developer · **Priority**: Medium

---

### HI-04: Read one session
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open a session | What you asked, how it ended, the session in short (and where the main agent's time went), what went wrong, the replay, the helpers it sent, what it changed and read |
| 2 | Open "Numbers" | Tokens, estimated cost, tool calls, cost by model and tools appear (folded away before; no costs outside it) |

**Tests**: session page · **Preconditions**: HI-01 · **User role**: developer · **Priority**: High

---

### HI-05: The replay, one request at a time
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Look at the replay | "The three things you asked, one by one…"; a strip with a block per request (sized by how long it worked, quiet stretches squeezed out), waits for you in yellow, a red edge where a step failed; each block's tooltip says which request, when, what you asked and its facts |
| 2 | Read the cards | One per request: its number and time, how long it worked, chips for its helpers, its waits for you and failed steps, "Finished"; what you asked; one bar and a few words for how its time went ("Mostly thinking, then running commands"); what it said. "18 min later" between them |
| 3 | Look at the first, open, card | Its own timeline: the main agent and the helper it sent, named by its task with its kind under it ("Find how the billing report gets its rows", "Explorer"); a key with only the kinds in it; its steps |
| 4 | Point at a failed block | The step in words, its kind, when, how long it took, and why it failed |

The whole-session chart with three tracks per agent is gone.

**Tests**: replay · **Preconditions**: HI-04 · **User role**: user · **Priority**: High

---

### HI-06: Replay controls
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Replay | It plays; the button reads Pause; the playhead moves; "1 of 3 · 08:36:12" and the step showing are named above the strip |
| 2 | Pause; pick Slow, Normal, Fast | It stops; the pace is pressed (each request takes about 50, 25 or 10 seconds to watch, however long it took) |
| 3 | Click the third block, then the second card's header | The replay goes to the start of that request, and its card opens |
| 4 | Drag along the strip | The playhead follows |
| 5 | With the strip focused: Home, →, →, Page Down, End, Space | Start, the next steps, the next request ("Request 2 of 3, …"), the end; Space plays and pauses |

**Tests**: replay · **Preconditions**: HI-04 · **User role**: user · **Priority**: High

---

### HI-07: Step by step
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click a step in the open card's list | The playhead goes there; that step is marked as now |
| 2 | Play | The marked step follows the playhead (and the open card follows it from one request to the next) |
| 3 | Back in the first request, tick "Include what the helpers did" | The helpers' own steps join, named after their helper |

**Tests**: steps · **Preconditions**: HI-04 · **User role**: user · **Priority**: Medium

---

### HI-08: What went wrong
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Look at cards where steps failed | "▲ ended on a failed step" only when its last step failed; nothing for failed steps along the way |
| 2 | Show: With failed steps | Every card says how many failed ("▲ two steps failed") |
| 3 | Open one; click "See what went wrong" | The failed steps, each with the reason it gave |
| 4 | Click "Show in the replay" | The playhead is on that step; its reason shows above the chart |

**Tests**: failures · **Preconditions**: HI-04 · **User role**: developer · **Priority**: High

---

### HI-09: Watch it in the room, then back
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Watch in the room" | The room acts out the session: one person, no card; the top bar says "Watching a replay". A replay bar: the title, "Request 1 of 3 · 08:36" with what you asked, "Now" and the step in words, Previous / Pause / Next, the strip of requests, Slow / Normal / Fast |
| 2 | Pause; Next; Previous | Request 2 of 3 with its words; back to request 1 |
| 3 | Click "Back to live", then History | Live sessions and the counts are back; History opens on the same session, its replay where you left it ("2 of 3") |

**Tests**: replay in the room · **Preconditions**: HI-04 · **User role**: user · **Priority**: High

---

### HI-10: The last six weeks
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Look above the diary | A column per day for six weeks, as tall as that day's agent time; a coral dot under days where a step failed |
| 2 | Pick today, then pick it again | Only today's page; then every day |
| 3 | Arrow keys on the strip | The focus moves day by day and says what happened that day |

**Tests**: activity strip · **Preconditions**: HI-01 · **User role**: developer · **Priority**: Medium

---

### HI-11: Empty sessions
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Read the note under the list | "one empty session is hidden (nothing was asked or done). Show them" |
| 2 | Show them, then Hide them | It appears, then hides |

**Tests**: empty sessions · **Preconditions**: HI-01 · **User role**: developer · **Priority**: Low

---

### HI-12: History can't be read
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | The server answers History with an error | "Couldn't read the history: …"; the rest of the app works |

**Tests**: errors · **Preconditions**: mocked `/api/history` error, without `demo` · **User role**: developer · **Priority**: Medium

---

### HI-13: A long session over three days
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open "Move the notes app to the new sync engine" (23 requests, Monday evening to Wednesday) | 23 blocks on the strip, each new day named where it starts ("Mon 26 Oct 20:24") |
| 2 | Look at the cards | The first three and the latest six; "Show the 14 requests in between" |
| 3 | Click the 13th block | Its card opens: "six helpers", "two steps failed", and a lane for each helper by its task |
| 4 | Show them all | 23 cards; the night between days reads as the next day's date and time |

**Tests**: replay at scale · **Preconditions**: `?demo` · **User role**: user · **Priority**: High

---

## 8. Recap

### RE-01: Periods
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Today, Yesterday, This week, Last 7 days, This month | Each shows its digest, words first |
| 2 | Open "Numbers" | Counts appear (folded away before), with the cost of each model as a button |

**Tests**: digest · **Preconditions**: `?demo` · **User role**: developer · **Priority**: High

---

### RE-02: Nothing yet
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | A period with no sessions | "Nothing yet today: no sessions so far." (or the week's, month's) |

**Tests**: empty · **Preconditions**: mocked empty recap, without `demo` · **User role**: developer · **Priority**: Medium

---

### RE-03: Recap can't be read
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | The server answers Recap with an error | An error sentence; the app keeps working |

**Tests**: errors · **Preconditions**: mocked `/api/recap` error, without `demo` · **User role**: developer · **Priority**: Medium

---

### RE-04: Cost by model, opened
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | In Numbers, click a model | A dialog: what it did in words, the same total as the list (with the API-price note), what its tokens were and what each kind cost, a column per day, main agents against each kind of helper, its projects and sessions |
| 2 | Escape; open a model only helpers used | It closes; the next one says only helpers used it, by kind |
| 3 | Click a project; then a session | History for that project and period; then that session's page |

**Tests**: cost by model · **Preconditions**: `?demo` · **User role**: developer · **Priority**: Medium

---

## 9. Team

### TE-01: Team view
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open Team | "Team view" with a session picker |
| 2 | Pick a session; change the time window | "Who did what, and when", "Running now", "Returned to the main agent" follow |

**Tests**: team · **Preconditions**: a live session with subagents · **User role**: developer · **Priority**: Medium

---

### TE-02: No live sessions
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open Team with nothing running | "No live sessions. Open one from History to see its team." |

**Tests**: empty · **Preconditions**: mocked empty office · **User role**: developer · **Priority**: Low

---

## 10. Caption rail

### RA-01: Live captions
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Read the rail | A caption per active session (name, what it does, how long); waiting ones in yellow |
| 2 | More than fit | "+N more speaking" |
| 3 | Click "Now" | Every session is listed |

**Tests**: captions · **Preconditions**: demo · **User role**: developer · **Priority**: High

---

### RA-02: Go to a waiting session
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Go to <name>" | Its terminal comes to the front (real sessions; an error shows under the rail if macOS refuses); a session without a terminal (and every demo session) turns the camera to them, and the button's tooltip says why |

**Tests**: focus terminal · **Preconditions**: a waiting session · **User role**: developer · **Priority**: Medium

---

### RA-03: Music
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Start the music" | The player shows and plays |
| 2 | Stop it | Quiet |

**Tests**: music · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Low

---

### RA-04: Focus timer
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Start a 25-minute focus" | "Focus 25:00" counting down, with "Break now" and "Stop" |
| 2 | Break now | A break starts |
| 3 | Stop | The timer is gone |

**Tests**: focus · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Medium

---

### RA-05: Focus length
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Change length" next to "Start a 25-minute focus" | A small panel: Focus 15, 25, 45 or 60 min, or any whole number of minutes from 1 to 180 typed in; Break 5, 10 or 15 min; the current lengths pressed |
| 2 | Pick 45 min | The button reads "Start a 45-minute focus" |
| 3 | Type 90; then 0, 181 or 2.5 | 90 is used; the others are refused with a short note, and 90 stays |
| 4 | Pick a 10-minute break, then press Escape | The panel closes and the keyboard is back on "Change length" |
| 5 | Reload | The same lengths |
| 6 | Start a focus, open "Length" and pick 15 min | The running round now ends 15 minutes after it started |

**Tests**: focus length · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Medium

---

### RA-06: Room sounds
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Toy workshop on a clear night, nobody working; start the music, then pause it | Quiet ("Room sounds", next to the weather, is on); a new "needs you" chimes |
| 2 | Rain | The rain is heard |
| 3 | Click "Room sounds" | It turns off: the rain fades out, and a new "needs you" makes no chime |
| 4 | Play the music | The music still plays (it has its own switch) |
| 5 | Open Sound settings | The same "Room sounds" setting, off, with its volume greyed out; tick it and the rain is back, and the Room sounds switch by the camera buttons is on again |
| 6 | Turn it off and reload | Still off (it starts on) |

**Tests**: room sounds · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Medium

---

### RA-07: Your own music
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Before the music starts, click "Your music" beside "Start the music" | Sound settings open with the cursor in "Your own music"; the sources are Made here, YouTube, Spotify and Off (Spotify greyed out until a Spotify link is given) |
| 2 | Paste a link that is neither | "That isn't a YouTube or Spotify link…" |
| 3 | Paste a Spotify playlist link (with its `?si=`) | Spotify's own player appears, Spotify is the source, and the rail's play and skip buttons are greyed out (Spotify uses its own) |
| 4 | Paste a YouTube playlist link | YouTube's player instead, playing the playlist |
| 5 | Pick Spotify as the source again | Its player is back; both links are kept to pick again |

The players are stood in for by blank pages, so the test never goes to the internet. A server from before 17 Nov 2026 refuses Spotify's frame until it is restarted.

**Tests**: music links · **Preconditions**: SH-01 (`?demo`) · **User role**: user · **Priority**: Medium

---

## 11. Layout

### LA-01: Wide screens
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open at 2560×1344, 1440×900, 1280×800 | One-row top bar, nothing cut off (below 1380 px it leaves out the helpers count, which the rail shows), the Weather choice and the camera buttons visible, no sideways scroll |

**Tests**: layout · **Preconditions**: SH-01 · **User role**: developer · **Priority**: High

---

### LA-02: 800 px wide
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open at 800×900; visit each view | The top bar wraps into rows; no overlap; no sideways scroll |

**Tests**: layout · **Preconditions**: SH-01 · **User role**: developer · **Priority**: High

---

### LA-03: Phone
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open at 390×844; visit each view | Usable, readable, no sideways scroll |

**Tests**: layout · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Medium

---

### LA-04: Long names
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | A session has a 120-character name | Its tag is cut short with "…" (no wider than about 260 px); the card shows the whole name |

**Tests**: tags · **Preconditions**: mocked session · **User role**: developer · **Priority**: Medium

---

## 12. Speed

### PF-01: Smooth everywhere
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | At 2560×1344, each theme in each weather (Clear, Sunny, Rain, Snow), measure 6 s | About 60 frames a second (median frame ≤ 18 ms) |

**Tests**: frame rate · **Preconditions**: GPU headless Chrome · **User role**: developer · **Priority**: Critical

---

### PF-02: First open after an update
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Clear the site's saved data; open each theme | First frame within 6 s |

**Tests**: loading · **Preconditions**: empty browser storage · **User role**: developer · **Priority**: High

---

### PF-03: Later opens
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open each theme a second time | First frame within 2 s; no freeze longer than 1 s |

**Tests**: loading · **Preconditions**: PF-02 · **User role**: developer · **Priority**: Critical

---

### PF-04: Saved pieces equal fresh ones
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open each theme with `?cachecheck` | Every saved texture and model matches a fresh build (`window.__cacheCheck.bad` is empty) |

**Tests**: saved scene · **Preconditions**: PF-02 · **User role**: developer · **Priority**: High

---

### PF-05: Switching themes
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Switch between the three themes | Each draws within 1.5 s |

**Tests**: switching · **Preconditions**: PF-03 · **User role**: developer · **Priority**: Medium

---

### PF-06: A busy machine
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Slow the CPU 4×; watch 15 s | It stays usable; the picture may soften (resolution adapts), clicks still answer |

**Tests**: adaptive quality · **Preconditions**: CPU throttling · **User role**: developer · **Priority**: Medium

---

### PF-07: Back to the room at once
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open the office, then History | The room stops drawing while History is shown (the frame count holds still), and the room's clock stands still |
| 2 | Back to the office | The same room is shown at once: no rebuild, no title card, no frame longer than 100 ms |
| 3 | Read the room's clock | It carries on from where it stopped, not from 0 (people's steps, breaks and poses are timed by it) |

**Tests**: the room kept between tabs · **Preconditions**: PF-03 · **User role**: developer · **Priority**: High

---

### PF-08: Saved pieces outlive an update
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Build twice without touching the scene's code | Both builds print the same scene assets fingerprint, so the saved pieces are used after the update |
| 2 | Change a room's or a person's code, build | The fingerprint changes: the pieces are built afresh once |

**Tests**: asset cache version · **Preconditions**: none · **User role**: developer · **Priority**: Medium

---

## 13. Accessibility

### AX-01: Reduced motion
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open with reduced motion | No title card; the light holds steady (nothing flashes in any weather) |

**Tests**: motion · **Preconditions**: `prefers-reduced-motion: reduce` · **User role**: developer · **Priority**: High

---

### AX-02: Keyboard and labels
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Tab through the top bar and camera bar | Every control is reachable and named; toggles report pressed or not |
| 2 | Read the rail | It is a live region |

**Tests**: keyboard · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Medium

---

### AX-03: Tooltips on the controls
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Rest the pointer on Close | After about a third of a second a tooltip shows above it: "Close" in bold with its key, 2, and what that view shows. The button is described by it (`aria-describedby`) |
| 2 | Move on to Room sounds, then Stream | Each tip shows at once; Room sounds says whether they are on; Stream shows its key, S, and stays inside the window |
| 3 | Move away; click Side while its tip shows | Away: the tip goes and the description with it. A click hides it, and it stays hidden while the pointer rests there |
| 4 | Tab from Wide to Close, then press Escape | The tip shows as focus arrives; Escape puts it away |
| 5 | Pick Rain, then rest on the Weather choice | "Weather: rain" and what rain does to the room and the people |
| 6 | Rest on the idle count | It says what idle means |

History, Recap, the card, the Team view and Customize use the same tooltip (HI-04 points at a helper in History).
Only the popped-out window keeps the browser's own, since it is a window of its own.

**Tests**: tooltips · **Preconditions**: SH-01 (`?demo`) · **User role**: user · **Priority**: Medium

---

## 14. Edge cases and errors

### ED-01: No sessions
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | The server reports no sessions | The room draws, nobody in it, and "No Claude Code session is running. Start one in any terminal and …" |

**Tests**: empty · **Preconditions**: mocked empty office · **User role**: developer · **Priority**: High

---

### ED-02: More sessions than work spots
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | The server reports 20 sessions | Everyone gets a person and a tag; extras squeeze in beside the work spots; counts say 20; no errors |

**Tests**: overflow · **Preconditions**: mocked office · **User role**: developer · **Priority**: High

---

### ED-03: Server down, then back
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | The server stops answering | "Reconnecting…" in the top bar; the scene keeps running |
| 2 | It answers again | The note goes; the people follow the sessions again |

**Tests**: connection · **Preconditions**: mocked network failure · **User role**: developer · **Priority**: High

---

### ED-04: A selected session ends
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select a session, then it ends | No crash; the person walks out; the card closes or says it ended |

**Tests**: selection · **Preconditions**: mocked office that drops a session · **User role**: developer · **Priority**: Medium

---

### ED-05: Fast switching
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Switch theme and weather ten times quickly | It ends in the last choice, with no errors |

**Tests**: robustness · **Preconditions**: SH-01 · **User role**: developer · **Priority**: Medium

---

### ED-06: Browser storage unavailable
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open with site storage blocked | The scene still opens (built fresh, nothing saved) |

**Tests**: saved scene · **Preconditions**: IndexedDB unavailable · **User role**: developer · **Priority**: Medium

---

### ED-07: Odd data
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | A session with no current tool, no subagents and an unknown tool kind | It is shown thinking; no errors |

**Tests**: robustness · **Preconditions**: mocked office · **User role**: developer · **Priority**: Low

---

## 15. Security and privacy

### SC-01: Only this machine can open it
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Request the app on this Mac's network address instead of 127.0.0.1 | Refused |

**Tests**: binding · **Preconditions**: server running · **User role**: someone else on the network · **Priority**: Critical

---

### SC-02: No requests to other sites
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Use every view for a minute (music off) | Every request goes to 127.0.0.1 (plus `data:` and `blob:`) |

**Tests**: privacy · **Preconditions**: SH-01 · **User role**: developer · **Priority**: High

---

### SC-03: Demo shows nothing real
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open the scene with `?demo` | None of the real sessions' names or projects appear |

**Tests**: privacy · **Preconditions**: real sessions running · **User role**: developer sharing a screenshot · **Priority**: High

---

## Coverage Matrix

| Requirement | Happy Path | Edge Cases | Error Handling | Notes |
|------------|-----------|-----------|---------------|-------|
| App shell | SH-01..03, SH-05..10 | SH-04 (unknown theme) | ED-03 | SH-06 needs notification permission |
| People | PE-01..05, PE-07..09, PE-11..18 | PE-06, PE-10, ED-02, ED-07 | ED-04 | Watched through `window.__crew`; drawn as little bots unless `?people=` says otherwise |
| Kitchen serving | PE-09 | PE-10 (all seats taken) | | Watched through `window.__dining` |
| Weather | WX-01..05 | WX-01 (an old saved storm), WX-06, ED-05 | | AX-01: the light holds steady |
| Camera | CA-01..05, CA-07 | CA-06, CA-08 | | `window.__ao.controls` for limits |
| Selection | SE-01..04 | SE-05 | ED-04 | |
| Customize | CU-01, CU-02, CU-04..06 | CU-03, CU-07 | | |
| Furniture people use | FU-01..03 | FU-04 (walkways), FU-05 | | Item places in `window.__walkmap` |
| History | HI-01..10, HI-13 | HI-11 (empty sessions) | HI-12 | The made-up history `?demo` brings; HI-01's slow answer and HI-12's error are mocked |
| Recap | RE-01, RE-04 | RE-02 | RE-03 | `?demo`; RE-02 and RE-03 are mocked, without `demo` |
| Team | TE-01 | TE-02 | | |
| Caption rail | RA-01, RA-03..07 | RA-05 (lengths out of range), RA-07 (a link that is neither) | RA-02 (demo note) | Room sounds are tapped where they leave the mixer; music players stood in for by blank pages |
| Layout | LA-01 | LA-02..04 | | |
| Speed | PF-01..03, PF-05, PF-07 | PF-06, PF-08 | | PF-04 checks the saved scene |
| Accessibility | AX-01..03 | | | AX-03: the one tooltip (panels/Tooltip.tsx) |
| Edge cases and errors | ED-01 (no sessions) | ED-02, ED-05, ED-07 | ED-03, ED-04, ED-06 | Made-up office data (`tests/e2e/support/mock.ts`) |
| Security and privacy | SC-01..03 | | | |

## Test Data Requirements

- **Demo sessions** (`?demo`): seven made-up sessions. One waits for you, four loop through a
  working day (edit, long command, search, plan, think, finish), two are idle. One has two
  subagents, one runs a team.
- **Made-up history** (`?demo`, `web/src/panels/history-demo.ts`): what History and Recap show
  (a few weeks of sessions in six projects; no real project shows).
- **Mocked server answers** (Playwright `page.route`): an empty office; 20 sessions; seven waiting;
  a 120-character name; a session with no current tool and an unknown tool kind; an office that
  drops a selected session; a slow `/api/history` (HI-01); errors (500) for `/api/history` and
  `/api/recap`; an empty recap; `/api/focus` answers (RA-02); a server that stops answering (the
  page's event stream is a stand-in the test drives, since `page.route` can't stream).
- **Real data**: TE-01 (the sessions running on this Mac), SH-04's last step (without `demo`),
  SC-03 (to compare against), and SE-02's second test and ED-04 (one real session's detail). The
  checks don't depend on what's in it. Screenshots of real data stay on this Mac.
- **Test hooks** (`?test`, read only): `window.__crew` (each person's act, place, clothes),
  `window.__dining` (customers, bowls), `window.__ao` (scene, camera, controls, renderer),
  `window.__walkmap` (the places people use), `window.__assets` (saving the scene);
  `?cachecheck` adds `window.__cacheCheck`; `?breaks=0` keeps idle people in their seats;
  `?people=bots|toon` picks how people are drawn (little bots by default).
- **Environment**: Google Chrome, headless, with the GPU (`--use-angle=metal`; the software
  renderer can't draw the scene); the built app served by `npm start` on 127.0.0.1:4777.
  Safari and Firefox aren't covered (the app is used in Chrome; Pop out needs Chrome).
