# Methodology: how to run a testing session

## Walk the journey, then dig
1. `browser_setup` → enumerate tabs → open the app + seed realistic state (`browser_open_urls` for several real http tabs in parallel; `browser_new_tab` for the app page).
2. Walk the user guide **literally**, one step at a time.
3. After each step: read the **"Page changes"** diff. If nothing changed, reach for `browser_console` + `browser_network_requests` **immediately** — don't retry blindly.

## Read the source alongside the UI
When an action no-ops silently, grep the source for the handler and read its guards. The DOM tells you *what* is there; the source tells you *what state it needs* (hovered id, focused tag, INPUT/TEXTAREA bail-out). This is how you learn *why* a click silently does nothing (e.g. a shortcut gated on `hoveredRecordId` that only a real mouse-move sets).

## Confirm + switch affordances
- After every mutation, the appended diff confirms the action landed before you move on.
- A "ref is stale" error means the page changed — re-snapshot for fresh refs.
- When stuck on an undrivable interaction (drag-drop, picker, Chrome command), switch to an equivalent affordance (context menu, bulk button, keyboard shortcut) rather than abandoning the flow.

## Evidence per bug
Attach:
- **Repro steps** (exact refs/clicks).
- **Expected vs actual** — quote the docs/guide, then the observed state.
- **Console** (`browser_console` filtered to the action's `sinceSeq`).
- **Network** if an API was involved.
- **Source pointer** (file:line of the suspected handler) when you have it.
- **Screenshot** only when pixels matter (layout, broken images, stuck modal).

## Bug vs test-artifact discipline
Before filing, know what the harness has rewritten (owned-tab titles get a `🟢` prefix; the harness may mark attached tabs). Strip harness-injected noise before judging the app's own behavior. CSP may differ on real origins; React DnD ignores synthetic CDP drags — these are coverage gaps, not defects. Re-check by hand before filing.

## Clean up as you go
`browser_close_tab` for every tab you opened once you've extracted what you need. Don't leave a pile behind.
