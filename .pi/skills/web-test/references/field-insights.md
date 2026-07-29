# Field insights — the war stories behind the rules

The rules in `SKILL.md` and the gotchas elsewhere are cheaper to state than to learn. These are the specific failures that taught them, kept as anecdotes so the next session doesn't pay the same tuition.

## "Just ask the user" is a valid test step
While loading an unpacked extension, I went: `developerPrivate.loadUnpacked({ path })` (rejected — `path` isn't a param) → `loadDirectory` (wants a `DirectoryEntry`, not a path) → started writing a raw-CDP `Page.setInterceptFileChooserDialog` + `DOM.setFileInputFiles` dance to drive the native folder picker — before realizing the user can click **Load unpacked → select `dist/`** in five seconds. **Lesson:** for any undrivable *write* (file pickers, Chrome *commands*, drag-drop into React DnD), default to a manual user step and spend automation budget on verifiable reads and flows. State the dead-ends you tried.

## Stale hover coordinates produce false bug reports
The hover+`A` "file tab" shortcut worked first try (mouse at `y=206`, `A`, tab filed). Testing `go.dev` next, I reused the old `y=548` — but filing `example.com` had removed a row above, shifting `go.dev` up to `y=406`. The CDP `mouseMoved` landed on empty space, `hoveredTabId` stayed null, `A` silently no-oped, and I was about to file *"A shortcut broken"* before re-fetching `getBoundingClientRect()` and seeing the row had moved. **Lesson:** a silent no-op on a hover-gated shortcut almost always means the mouse isn't over the element — re-read the bounding box, don't retest the shortcut. Hardcoded coordinates are wrong the moment the list mutates.

## The CDP response envelope has a `.result` you'll forget
Every raw-WS `send()` resolves with the whole message `{ id, result, error }`. I wrote `tg.targetInfos` twice (empty array, "no SW target found" when the SW was right there) before noticing it's `tg.result.targetInfos`. **Lesson:** when a raw-CDP call returns `undefined`/empty with no error, first check whether you unwrapped `.result`.

## Page-console silence doesn't mean the service worker is fine
When activation's confirm button stuck on "Activating…", the page console showed **only** favicon CSP errors — nothing about the failure. The cause was in the MV3 service worker (it had recycled, lost the prepared-operation `Map`, posted *"this operation is no longer valid"*). Attaching `Runtime.enable` after the fact caught nothing — CDP doesn't replay past exceptions. Re-triggering with the listener already attached revealed the error. **Lesson:** for extension bugs, the page console is necessary but insufficient. Attach to the SW before reproducing, and read all rendered toasts — the page often surfaces a user-facing message for an SW-rooted error.

## Read the source to explain a silent no-op
The `O` (open saved URL) shortcut did nothing on `browser_press_key`. The DOM had no "Open" button — only a hint `Open (O)`. Reading `App.tsx` showed the handler is gated on `hoveredRecordId` (set by `onMouseEnter`); my click set focus but not hover, so the handler returned early. **Lesson:** when an action no-ops silently, grep the source for the handler and read its guards. This also turned up the real bug — no visible Open button at all, only the shortcut.

## A misleading count is a bug even when the behavior is correct
The activation dialog read *"Close 0 tabs and activate"* while one other-project tab would in fact close. The count tallied only drifted tabs chosen for closure, not the non-drifted other-project tabs the background would still close. **Lesson:** verify behavior independently of the displayed count, then judge the count against ground truth. A wrong count on a destructive action is a real bug, not cosmetics.

## Tag your test artifacts before filing
Saved-URL titles came back as `🟢 Wikipedia` — the harness prefixes owned-tab titles with `🟢` for the user's benefit, and the extension captured `tab.title` verbatim. For a moment that looked like a Protab title-corruption bug. **Lesson:** know what the harness has rewritten before judging output. Strip or ignore harness-injected noise before evaluating the app.
