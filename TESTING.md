# Testing web & browser apps with pi-browser-harness

A practical guide — distilled from driving a real Chrome (tabs, extensions, popups, and MV3 service workers) through the `browser_*` tools. The goal: reproduce user flows against a **live browser**, not a mocked headless shell, and gather evidence (DOM state, console, network, screenshots) you can attach to bug reports.

## 1. Mindset

- **You drive the user's real Chrome.** No sandbox, no headless. If auth is needed, stop and ask.
- **Read-first, mutate-second.** Snapshot the page → identify refs → act → read the diff. Never guess selectors or coordinates.
- **Breadth before depth.** Walk the whole user journey once; then dig into failures. Don't tunnel on one bug for 20 minutes.
- **Surface the easy path early.** Some flows (native file pickers, Chrome keyboard *commands*, drag-drop into React DnD) are hard or impossible to drive via CDP. When you hit one, tell the user "this step is easiest done by hand" instead of building a fragile raw-CDP workaround. Keep automated coverage for everything else.
- **Separate bugs from test artifacts.** A harness that rewrites `document.title`, a CSP that only fires on real origins, or React DnD ignoring synthetic drags are *your* limitations, not the app's. Label them as such.

## 2. Prerequisites & connection

- Requires Node 22+ and the `pi-browser-harness` extension loaded into the pi agent.
- The daemon does **not** auto-start. Call `browser_setup` once per session — it spawns the daemon, connects to Chrome, and opens a test tab. Idempotent.
- If a `browser_*` call errors with *"Browser harness not initialized"*, call `browser_setup` and retry.
- The daemon socket lives at `/tmp/pi-browser-daemon.sock`. The Chrome DevTools WebSocket is discovered from `~/.config/<browser>/DevToolsActivePort` (or `BU_CDP_WS` / `BU_CDP_PORTS`). HTTP `/json` may be **disabled** even when the WS endpoint is live — don't assume you can `curl /json/version`; the WS URL still works.

## 3. Tool hierarchy — pick the cheapest one

| You want to… | Use |
|---|---|
| Understand page structure / what's clickable | `browser_snapshot` (AX tree + `[eN]` refs + `@(x,y)`) |
| Read one element's value/attr/coords | `browser_execute_js` (`el.innerText`, `getBoundingClientRect()`) |
| See the page visually (layout/colors) | `browser_screenshot` — **last resort**, pixels only |
| Inspect network / API calls | `browser_network_requests` |
| Read JS errors / CSP / console | `browser_console` |
| Click / fill / type / select / focus / key | `browser_click` · `browser_fill` · `browser_type` · `browser_select_option` · `browser_focus` · `browser_press_key` |
| Open URLs / manage tabs | `browser_navigate` · `browser_new_tab` · `browser_open_urls` · `browser_list_tabs` · `browser_switch_tab` |
| Wait for render / load | `browser_wait_for` (selector/text) · `browser_wait_for_load` · `browser_wait` |
| Anything the built-ins can't express | `browser_run_script` (raw CDP + Node) |

Observation tools run in parallel; mutations serialize. Issue independent reads in one turn.

## 4. Loading a Chrome extension under test

1. Build it (`npm run build` → `dist/`).
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked → select the `dist/` directory.** This native folder picker cannot be driven reliably via CDP — just ask the user to do this one step.
4. Verify the load from the page via the internal API (the `chrome://extensions` page exposes `chrome.developerPrivate`):

```js
// browser_execute_js
return new Promise((resolve) => {
  chrome.developerPrivate.getExtensionsInfo((items) => {
    const ext = (items || []).find(i => i.name === 'Protab');
    resolve(JSON.stringify(ext ? {id: ext.id, version: ext.version, enabled: ext.enabled, location: ext.location} : 'NOT FOUND'));
  });
});
```

The returned `id` is what you use to open extension pages: `chrome-extension://<id>/workspace.html`, `popup.html`, etc.

> Don't waste time on `developerPrivate.loadUnpacked({path})` — the API rejects `path` and always opens the native picker. `loadDirectory` takes a `DirectoryEntry`, not a path. Manual load is the path of least resistance.

## 5. Driving extension pages & popups

- **Full-page workspace**: `browser_new_tab({ url: 'chrome-extension://<id>/workspace.html' })` → `browser_wait_for_load` → `browser_snapshot`.
- **Toolbar popup** (a `default_popup`): open `popup.html` as a tab for inspection, but beware — opening it as a tab makes the **popup itself the active tab**, so any "capture current tab" logic reads the popup's `chrome-extension://` URL and may self-reject (e.g. *"only http(s) URLs supported"*). To test popup-against-real-tab behavior, activate a real tab via raw CDP `Target.activateTarget` (see §8) and then evaluate the popup's Save button in the popup's own session — CDP `Runtime.evaluate` does **not** change the browser's active tab.
- **Chrome *commands*** (e.g. `Ctrl+Shift+X` in the manifest) **cannot be triggered via CDP**. Test the popup's UI by opening it directly; test the command's wiring separately or by hand.

## 6. Observation patterns

**Structure → interaction.** Always `browser_snapshot` before clicking. The outline gives every interactive element a stable `[eN]` ref and `@(x,y)`. Prefer `ref` over coordinates — refs survive re-renders; coordinates go stale after every reflow.

**Surgical DOM reads** beat screenshots for data:

```js
// all live-tab rows + their classes
return JSON.stringify(Array.from(document.querySelectorAll('button.live-tab-row'))
  .map(b => ({ label: b.getAttribute('aria-label'), cls: b.className })))
```

**Coordinates for hover/drag** — get them fresh each time, never hardcode:

```js
return (function(){
  const el = document.querySelector('button.live-tab-row');
  const r = el.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
})()
```

Row positions shift the moment the list changes; a stale `y` will hover the wrong row and make shortcuts silently no-op.

**Console + network for "nothing happened" moments.** Capture `browser_console`'s `nextCursor` *before* the action, act, then `browser_console({ sinceSeq: <cursor> })` after. Pair with `browser_network_requests({ sinceMs: 5000 })`. This is how CSP violations and silent handler drops surface.

## 7. Interaction patterns

- **Click**: `browser_click({ ref: 'e12' })`. For right-click context menus: `browser_click({ button: 'right', ref })`.
- **Forms**: `browser_fill({ ref, value })` — fires input/change so React/Vue controlled components update; returns the value for verification. Use `browser_type` only for keystroke-sensitive widgets (autocomplete, masked inputs).
- **Selects**: `browser_select_option({ ref, label })` (native `<select>`).
- **Special keys**: `browser_press_key('a')`, `Enter`, `Tab`, `Escape`, arrows, ` ` (space). Modifiers: bitfield 1=Alt,2=Ctrl,4=Cmd,8=Shift.
- **After every mutation**, read the appended **"Page changes"** diff to confirm the action landed before moving on. Re-snapshot when you need fresh refs (a "ref is stale" error means the page changed).

## 8. Hard-to-drive interactions & workarounds

### Hover-revealed UI (tooltips, hover buttons, hover-scoped shortcuts)
The harness has no hover tool. CSS `:hover` and React `onMouseEnter` need a real `Input.dispatchMouseEvent` of type `mouseMoved`:

```js
// browser_run_script  (path must be in tmpdir/cwd)
const s = daemon.session();
for (let i = 0; i < 3; i++) {
  await s.call("Input.dispatchMouseEvent",
    { type: "mouseMoved", x: params.x, y: params.y, button: "none", buttons: 0, clickCount: 0 });
  await new Promise(r => setTimeout(r, 80));
}
return { content: [{ type: "text", text: "hovered " + JSON.stringify(params) }] };
```

Pass coords from a `getBoundingClientRect()` read. **Re-fetch coords before each hover** — lists reflow when items are added/removed. Shortcuts gated on hover state (e.g. press `A` to file the hovered row, `O` to open the hovered accordion) work once the real `mouseMoved` has set the component's hovered-id state; `browser_press_key` then reaches the window listener. Synthetic `dispatchEvent('mouseenter')` does **not** reliably trigger React's `onMouseEnter` — use the real CDP mouse move.

### Drag-and-drop
`browser_drag_and_drop` uses `Input.dispatchDragEvent`, which React DnD / HTML5 drop handlers routinely ignore. Treat drag-drop as **not verifiable via CDP** unless you confirm a drop registered. Mitigation: test the same feature through an alternate path (keyboard shortcut, context menu, bulk button) and have a human spot-check the drag itself.

### Native file pickers
`<input type="file">` with `webkitdirectory` or the picker opened by internal extension APIs (`chrome.developerPrivate.loadUnpacked`) can't be driven cleanly. Use `browser_upload_file({ ref })` for ordinary visible file inputs; for native pickers, ask the user.

### Right-click context menus
`browser_click({ button: "right", ref })` works. After it opens, `browser_execute_js` to find and `.click()` the desired `[role=menuitem]`, or re-snapshot and click its ref. This is the reliable fallback when an app only exposes actions via context menu (e.g. "Open", "Archive", "Activate").

## 9. Raw CDP escape hatch (`browser_run_script`)

When built-ins can't express it, write a script to a temp path and run it. Bindings: `params`, `daemon`, `require`, `fetch`, `JSON`, `Buffer`, `setTimeout`, `onUpdate`, `ctx`, `signal`. The script **must return** `{ content: [{ type: "text", text }], details? }`. Use `return (async () => { ... })()` for async work.

Open your **own** WebSocket to the browser endpoint so you don't steal events from the harness's internal event loop:

```js
const WebSocket = require('ws');
const WS = 'ws://127.0.0.1:9222/devtools/browser/<id-from-DevToolsActivePort>';
return (async () => {
  const sock = new WebSocket(WS);
  await new Promise((res, rej) => { sock.on('open', res); sock.on('error', rej); });
  const buf = []; let nextId = 0; const pending = new Map();
  sock.on('message', m => { const j = JSON.parse(m.toString()); buf.push(j);
    if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); } });
  const send = (method, params, sessionId) => new Promise(res => {
    const i = ++nextId; pending.set(i, res);
    sock.send(JSON.stringify({ id: i, method, params, sessionId: sessionId || undefined }));
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ err: 'timeout '+method }); } }, 10000);
  });
  // ... use send(method, params, sessionId)
})();
```

> Response shape: the resolved value is the **whole message** `{id, result, error}`. Read `res.result.targetInfos`, **not** `res.targetInfos` — that one bit me.

Two high-value raw-CDP techniques:

1. **Inspect the MV3 service worker.** SW errors don't surface in any page's console. Find the SW target, attach, enable Runtime/Log, then drain events:
   ```js
   const tg = await send('Target.getTargets', {}, null);
   const sw = tg.result.targetInfos.find(t => t.type === 'service_worker' && t.url.includes('<ext-id>'));
   const att = await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true }, null);
   const sid = att.result.sessionId;
   await send('Runtime.enable', {}, sid);
   await send('Log.enable', {}, sid);
   // ...trigger the action on the page via daemon.evaluateJs, wait, then drain buf for
   // Runtime.consoleAPICalled / Log.entryAdded / Runtime.exceptionThrown (sessionId === sid)
   ```
   Note: CDP does **not** retroactively deliver past exceptions — attach `Runtime.enable` **before** re-triggering the action, then reproduce live.

2. **Activate a tab without moving the harness focus.** `Target.activateTarget({ targetId })` makes a tab active in the browser window without `browser_switch_tab` (which would re-attach the harness and change the "active tab" a popup reads). Use this to test toolbar-popups that capture `chrome.tabs.query({active:true})`.

## 10. MV3 service-worker gotchas

- SWs recycle when idle; **all in-memory state is lost** on recycle (e.g. a `Map` of prepared operations). If a multi-step flow (prepare → confirm) crosses a pause, the confirm may hit *"operation no longer valid"* because the SW restarted and lost the map. Reproduce by waiting between steps; confirm by reading the SW console via §9.1.
- Page-side error handlers that don't clear pending/prepared UI state leave dialogs stuck on "…" forever. Check both the SW side (did it post a result?) and the page side (does the handler clear pending flags?).
- The extension page's long-lived port *should* keep the SW alive, but don't assume it — verify by checking the SW target across the operation.

## 11. Methodology: how to run a session

1. `browser_setup` → enumerate tabs → open the app under test.
2. Seed realistic state: `browser_open_urls` to open several real http tabs in parallel; `browser_new_tab` for the app page.
3. Walk the user guide literally. After each step: read the "Page changes" diff; if nothing changed, reach for `browser_console` + `browser_network_requests` immediately.
4. Read the **source** alongside the UI. Grep for the shortcut handlers (`key === 'o'`, `onMouseEnter`, command kinds) to learn what state an action depends on — it tells you *why* a click silently no-ops (e.g. shortcut gated on `hoveredRecordId` that only a real mouse-move sets).
5. When stuck on an undrivable interaction, switch to an equivalent affordance (context menu, bulk button, keyboard shortcut) rather than abandoning the flow.
6. For each bug, capture evidence: the AX snippet, the console errors, the relevant source line, and (for visual regressions) one `browser_screenshot`.
7. Close tabs you opened (`browser_close_tab`) as you go; don't leave a pile behind.

## 12. Bug-evidence checklist

For every reported bug, attach:
- **Repro steps** (exact refs/clicks).
- **Expected vs actual** (quote the docs/quickstart, then the observed state).
- **Console output** (`browser_console`, filtered to the action's `sinceSeq`).
- **Network** if an API was involved.
- **Source pointer** (file:line of the suspected handler) when you have it.
- **Screenshot** only when pixels matter (layout, broken images, stuck modal).

## 13. Test-environment artifacts to *not* file as bugs

- Harness-owned tabs get `document.title = '🟢 ' + title` so the user can see which tab the agent attached to. Any feature that captures `tab.title` verbatim will show the `🟢` prefix — strip it from titles before judging, or test with tabs the harness didn't mark.
- CSP violations may fire only on real origins; favicons blocked under CDP may also block in production — verify against the manifest CSP, not just the console.
- Drag-drop, Chrome *commands*, and native pickers that fail under CDP are coverage gaps, not defects. Re-check them by hand before filing.

## 14. Cleanup

- `browser_close_tab` for every tab you opened via `browser_new_tab` / `browser_open_urls` once you've extracted what you need.
- Temp scripts under `/tmp` are fine to leave; they're outside the repo.
- Download dirs you configured with `browser_download` persist for the session — note the path in your report.

## 15. Cheat sheet

```
# connect
browser_setup

# load extension (manual step), then verify
browser_execute_js  -> chrome.developerPrivate.getExtensionsInfo()

# open app + seed tabs
browser_new_tab({ url: 'chrome-extension://<id>/workspace.html' })
browser_open_urls({ urls: ['https://example.com', 'https://mdn...'] })
browser_wait_for_load()

# observe
browser_snapshot()                     # refs + structure
browser_execute_js("...")              # values / getBoundingClientRect
browser_console({ sinceSeq })          # errors since last action
browser_network_requests({ sinceMs })  # API calls

# interact (ref-first)
browser_fill({ ref:'e7', value:'...' })
browser_click({ ref:'e12' })
browser_click({ button:'right', ref }) # context menu
browser_press_key('a')

# hover (no built-in — raw CDP)
browser_run_script(hoverScript, { x, y })

# service worker / raw CDP
browser_run_script(swInspectScript)

# visual evidence (last resort)
browser_screenshot({ format:'jpeg', quality:80 })

# confirm + close
browser_wait_for_load()
browser_close_tab({ targetId })
```

### Skills to lean on
- **pi-browser-harness** — the `browser_*` tool reference and daemon API.
- **deep-research** — when a bug needs cited, multi-source investigation (library internals, API behavior).
- **context-management** — for long, multi-phase testing sessions: checkpoint after each feature area, compact before the next, so the working set stays clean.

---

## 16. Insights from the field

The rules above are cheaper to state than to learn. These are the specific failures that taught them — kept as anecdotes so the next session doesn't pay the same tuition.

### "Just ask the user" is a valid test step
While loading an unpacked extension, I went down a rabbit hole: tried `chrome.developerPrivate.loadUnpacked({ path })` (rejected — `path` isn't a parameter), then `loadDirectory` (wants a `DirectoryEntry`, not a path), then started writing a raw-CDP `Page.setInterceptFileChooserDialog` + `DOM.setFileInputFiles` dance to drive the native folder picker — before stepping back and realizing the user can click **Load unpacked → select `dist/`** in five seconds. I burned real time architecting an automated path for a step that runs once per session. **Lesson:** for any undrivable *write* (file pickers, Chrome *commands*, drag-drop into React DnD), default to a manual user step and spend your automation budget on the verifiable reads and flows instead. State the dead-ends you tried so the next person doesn't repeat them.

### Stale hover coordinates produce false bug reports
The hover+`A` "file tab" shortcut worked when I first tested it (mouse moved to `y=206`, pressed `A`, tab filed). When I then tested `go.dev`, I reused the old `y=548` — but filing `example.com` had removed a row above, shifting `go.dev` up to `y=406`. My CDP `mouseMoved` landed on empty space, the component's `hoveredTabId` stayed null, `A` silently no-oped, and I was about to file *"A shortcut is broken"* before re-fetching `getBoundingClientRect()` and seeing the row had moved. **Lesson:** a silent no-op on a hover-gated shortcut almost always means the mouse isn't actually over the element — re-read the bounding box, don't retest the shortcut. Hardcoded coordinates are wrong the moment the list mutates.

### The CDP response envelope has a `.result` you'll forget
Every raw-WS `send()` resolves with the **whole CDP message** `{ id, result, error }`. I wrote `tg.targetInfos` twice (empty array, silent failure, "no SW target found" when the SW was right there) before noticing it's `tg.result.targetInfos`. **Lesson:** when a raw-CDP call returns `undefined`/empty with no error, the first thing to check is whether you unwrapped `.result`. Wrap the helper so callers get `res.result` directly and this class of bug disappears.

### Page-console silence doesn't mean the service worker is fine
When activation's confirm button stuck on "Activating…", the workspace page console showed **only** favicon CSP errors — nothing about the failure. The real cause lived in the MV3 service worker, whose console is invisible to the page. I attached `Runtime.enable` to the SW *after* the fact and caught nothing — CDP doesn't replay past exceptions. Only re-triggering the action with the SW listener already attached (or, faster, reading the `actionError` toast the page *did* render from the `LIVE_TAB_ACTION_ERROR` message) revealed *"This operation is no longer valid."* **Lesson:** for extension bugs, the page console is necessary but insufficient. Attach to the SW target before reproducing, and read *all* rendered toasts/overlays — the page often surfaces a user-facing message for an error whose root cause is in the SW.

### Read the source to explain a silent no-op
The `O` shortcut (open saved URL) did nothing on `browser_press_key`. The DOM had no "Open" button — only a hint `Open (O)`. Reading `App.tsx` showed the handler is gated on `hoveredRecordId`, set by `onMouseEnter` on the accordion; my click set focus but not hover, so the handler returned early. **Lesson:** when an action no-ops silently, grep the source for the handler and read its guards (hovered id, focused tag, INPUT/TEXTAREA bail-out). The DOM tells you *what* is there; the source tells you *what state it needs*. This also turned up the real bug — there was no visible Open button at all, only the shortcut.

### A misleading count is a bug even when the behavior is correct
The activation dialog read *"Close 0 tabs and activate"* while one other-project tab would in fact close. The count only tallied *drifted* tabs chosen for closure, not the non-drifted other-project tabs the background would still close. I nearly dismissed it as a label nit until confirming the tab did close — the label actively misreports what will happen. **Lesson:** verify the *behavior* independently of the *displayed count*, then judge the count against ground truth. A wrong count on a destructive action is a real bug, not cosmetics.

### Tag your test artifacts before filing
Saved-URL titles came back as `🟢 Wikipedia`, `🟢 Example Domain` — the harness prefixes owned-tab titles with `🟢` for the user's benefit, and the extension captured `tab.title` verbatim. For a moment that looked like a Protab bug. **Lesson:** before judging output, know what the harness has rewritten. Strip or ignore harness-injected noise (title prefixes, focus markers) before evaluating the app's own behavior. I called this out explicitly in §13 so the next session doesn't file `🟢` as a title-corruption defect.
