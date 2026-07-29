# Raw CDP escape hatch

When the built-in `browser_*` tools can't express it, open your **own** WebSocket to the browser endpoint. The harness's transport is owned by it — tapping its event stream steals events (e.g. dialog detection). A separate WS lets you listen to events (service worker console) without interference.

`scripts/raw-ws.js` is the canonical client + targets-listing diagnostic. `scripts/sw-inspect.js` inlines the same client to listen to the service worker.

## WS URL discovery
Order: `params.wsUrl` → `BU_CDP_WS` env → `~/.config/<browser>/DevToolsActivePort` (line 1 = port, line 2 = path → `ws://127.0.0.1:<port><path>`).

**HTTP `/json` may be disabled** even when the WS endpoint is live — Chrome toggles remote debugging via `chrome://inspect` sometimes disables the HTTP endpoint. Don't `curl /json/version`; read the `DevToolsActivePort` file or hit the WS directly.

## The `.result` gotcha
Every CDP response is the **whole message** `{ id, result, error }`. Read `res.result.targetInfos`, **not** `res.targetInfos`. Forgetting the `.result` wrapper silently returns `undefined`/`[]` and makes you think "no target found" when the target is right there. The packaged client's `send()` resolves with the whole message on purpose — wrap it or read `.result` explicitly.

## High-value raw-CDP techniques

### 1. Inspect an MV3 service worker (see sw-inspect.js)
`Target.getTargets` → find `type === 'service_worker'` → `Target.attachToTarget` → `Runtime.enable` + `Log.enable` → drain `Runtime.consoleAPICalled` / `Log.entryAdded` / `Runtime.exceptionThrown` (filter by `sessionId === sid`).
**CDP does not replay past exceptions** — enable before reproducing, then trigger the action and wait. See [mv3-gotchas.md](mv3-gotchas.md).

### 2. Activate a tab without moving the harness focus (see activate-target-for-popup.js)
`Target.activateTarget({ targetId })` (browser-level) makes a tab the browser's active tab **without** `browser_switch_tab`, which would re-attach the harness and change what a popup reads as "current tab". Pair with `Target.attachToTarget` + `Runtime.evaluate` in the popup's session to test toolbar popups that capture the active tab.

### 3. Evaluate in a non-active target
`Target.attachToTarget({ targetId, flatten:true })` → `sessionId` → `Runtime.evaluate({ expression, returnByValue, awaitPromise })` on that session. CDP `Runtime.evaluate` does **not** change the browser's active tab, so you can drive a background tab/popup without shifting focus.
