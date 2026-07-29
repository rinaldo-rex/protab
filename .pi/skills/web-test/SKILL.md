---
name: web-test
description: Test web apps and Chrome extensions against the user's real Chrome via the browser_* tools. Use when the user asks to test a web app, exercise a user flow, reproduce or verify a browser bug, emulate a quickstart/end-to-end against a live browser, or load and drive an unpacked Chrome extension. Covers ref-first interaction, hover/drag-drop workarounds, MV3 service-worker inspection, and bug-evidence capture.
---

# Web & browser testing (real Chrome)

Drive the user's **real Chrome** (not headless) through the `browser_*` tools to reproduce user flows and gather bug evidence. No sandbox, no mocks — if auth is needed, stop and ask.

## Core loop

1. **Connect** — `browser_setup` (idempotent). If a browser tool says "not initialized", call it and retry.
2. **Observe first** — `browser_snapshot` → note `[eN]` refs + `@(x,y)`. Use `browser_execute_js` for values and `getBoundingClientRect()` coords.
3. **Act ref-first** — `browser_click({ref})`, `browser_fill({ref,value})`, `browser_press_key(...)`. Read the appended **"Page changes"** diff to confirm the action landed.
4. **Evidence** — `browser_console({sinceSeq})` + `browser_network_requests({sinceMs})` after each action; `browser_screenshot` only when pixels matter.
5. **Clean up** — `browser_close_tab` for every tab you opened.

## Rules of thumb

- Refs survive re-renders; coordinates don't. Re-read `getBoundingClientRect()` before every hover or coord-based click.
- "Nothing happened" → reach for console + network **immediately**. If the page console is clean, the cause is often in the MV3 service worker (see [mv3-gotchas.md](references/mv3-gotchas.md)).
- Undrivable **writes** (native file pickers, Chrome keyboard *commands*, drag-drop into React DnD) → ask the user to do that one step; keep automation for everything else. State the dead-ends you tried so they aren't repeated.
- Separate bugs from test artifacts: the harness rewrites owned-tab titles with a `🟢` prefix; React DnD ignores synthetic CDP drags; CSP may differ on real origins. Don't file these as defects.
- Breadth before depth: walk the whole journey once, then dig into failures. Don't tunnel on one bug.

## Reference files (read on demand)

- [extension-loading.md](references/extension-loading.md) — Load unpacked (manual) + verify via `chrome.developerPrivate`
- [hard-interactions.md](references/hard-interactions.md) — hover, drag-drop, context menus, file pickers, Chrome commands
- [raw-cdp.md](references/raw-cdp.md) — open your own WebSocket; the `.result` response-shape gotcha
- [mv3-gotchas.md](references/mv3-gotchas.md) — SW recycling, stuck dialogs, reading the SW console
- [methodology.md](references/methodology.md) — breadth-first, source-aided testing, evidence per bug
- [field-insights.md](references/field-insights.md) — the war stories that taught the rules above

## Packaged scripts

Invoke with `browser_run_script({ path: '<skill-dir>/scripts/<file>.js', params: {...} })`, where `<skill-dir>` is the directory holding this `SKILL.md` (it's inside the project, so the path is allowed). Each script is self-contained and returns `{ content: [{ type: 'text', text }] }`.

- `scripts/verify-extension.js` — confirm an unpacked extension loaded; return its id+state. params: `{ name }`
- `scripts/hover.js` — move the real mouse to coords to set hover state. params: `{ x, y, repeats? }`
- `scripts/sw-inspect.js` — attach to the MV3 service worker, enable Runtime/Log, optionally trigger an action on the page, drain its console + exceptions. params: `{ wsUrl?, swUrlContains?, triggerExpr?, waitMs? }`
- `scripts/activate-target-for-popup.js` — activate a real tab without shifting harness focus, then eval in a popup's session (for testing toolbar popups that read the active tab). params: `{ targetId, popupTargetId, evalExpr }`
- `scripts/raw-ws.js` — canonical raw-CDP client + targets-listing diagnostic. Copy its client factory when writing custom raw-CDP scripts. params: `{ wsUrl? }`

Each script has a layman header comment explaining why it exists, when to use it, and the gotchas it encodes.
