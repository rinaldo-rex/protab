# Phase 4 Manual Testing Checklist

This checklist validates Phase 4 behavior against the production build in Chrome.

## Setup

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `dist/` directory.
5. Pin Protab if desired, then click its toolbar action to open the full-page workspace.
6. Create at least two projects with saved URLs.

---

## Active project UI indicators

- [x] Create two projects (e.g., "Work" and "Personal").
- [x] Verify neither project shows an active indicator initially.
- [x] Open the project actions menu (⋯) for "Work" and click **Activate**.
- [x] Verify a green dot (●) appears next to "Work" in the sidebar.
- [x] Verify the project header shows "Selected project · Active".
- [x] Select "Personal" project.
- [x] Verify "Work" still shows the active dot, and "Personal" does not.
- [x] Verify the active indicator is not color-only (dot symbol is visible).

## Selecting vs activating

- [x] Create two projects with saved URLs.
- [x] Select a project and verify no tabs open or close.
- [x] Select a different project and verify the first project's active state is unchanged.
- [x] Verify selecting a project never changes the active project.

## Activate project

- [x] Create two projects: "Work" (active) and "Research".
- [x] Open tabs for both projects (some owned by Work, some by Research).
- [x] Also open some unassigned tabs.
- [ ] Select "Research" and click **Activate** from the project actions menu.
- [ ] Verify the drift review dialog appears if any tabs have navigated away.
- [ ] Verify the dialog shows the saved URL and current URL for each drifted tab.
- [ ] Toggle some tabs to "Keep" and verify they remain open.
- [x] Click "Close N tabs and activate".
- [ ] Verify:
    - Only Research's other-project tabs were closed (Work's tabs).
    - Unassigned tabs remain open.
    - Research is now marked as active (green dot).
    - An activation summary appears with counts.

## Unassigned notice after activation

- [ ] Activate a project when unassigned tabs exist in the window.
- [ ] Verify a dismissible notice appears: "N unassigned tabs remain open."
- [ ] Verify the Unassigned group heading pulses once (respects reduced-motion).
- [ ] Dismiss the notice and verify it does not reappear.

## Open all

- [x] Select a project with 3+ saved URLs.
- [x] Click **Open all** from the project actions menu.
- [x] Verify:
    - New tabs are created for each saved URL.
    - Each tab is owned by the project.
    - An open-all summary appears with focused/created counts.
- [x] Run **Open all** again without closing any tabs.
- [x] Verify:
    - No new tabs are created.
    - Existing tabs are focused instead.
    - Summary shows "focused" count, not "created".

## Open all idempotency

- [x] Open all URLs for a project.
- [x] Close one of the opened tabs.
- [x] Run **Open all** again.
- [x] Verify:
    - Only the missing URL gets a new tab.
    - Other existing tabs are focused, not duplicated.

## Close all

- [x] Select a project with owned live tabs.
- [x] Click **Close all** from the project actions menu.
- [x] Verify:
    - A confirmation dialog appears showing tabs to close.
    - Drifted tabs are shown with Keep/Close toggles.
    - After confirming, only the project's owned tabs are closed.
    - Unassigned tabs and other project's tabs remain open.
    - Saved URLs are NOT deleted or modified.
    - A close-all summary appears with counts.

## Close all scope

- [x] Open tabs for two projects plus unassigned tabs.
- [x] Run **Close all** on one project.
- [x] Verify:
    - Only that project's tabs are closed.
    - Other project's tabs remain open.
    - Unassigned tabs remain open.
    - Saved records remain unchanged.

## Navigation drift review

- [x] File a tab to a project (establishes ownership).
- [x] Navigate that tab to a different URL.
- [x] Verify it appears under "Unassigned" with "Navigated from saved URL" label.
- [x] Activate or Close all the owning project.
- [x] Verify the drift review dialog shows:
    - Original saved URL
    - Current URL
    - Keep/Close toggle
- [ ] Keep one drifted tab and close others.
- [ ] Verify kept tab remains open with a needs-review marker.

## Two-window isolation

- [x] Open Protab in two Chrome windows.
- [x] Activate "Work" in window 1.
- [x] Verify window 2's active state is independent.
- [x] Activate "Research" in window 2.
- [x] Verify both windows show their respective active projects.
- [x] Run operations in one window and verify the other is unaffected.

## Active-state recovery (service worker suspension)

- [ ] Activate a project.
- [ ] Wait for the service worker to suspend (or force via `chrome://serviceworker-internals`).
- [ ] Perform an action that wakes the service worker.
- [ ] Verify the active project indicator is still visible.
- [ ] Verify no close operations are triggered on wake.

## Active-state recovery (browser restart)

- [ ] Activate a project in a window.
- [ ] Close and reopen Chrome.
- [ ] Open Protab in the same window.
- [ ] Verify:
    - If the window association is unambiguous, the active project is restored.
    - If ambiguous (multiple windows, project deleted), shows "No active project".
    - No close operations are triggered on startup.

## Error handling

- [ ] Start activating a project, then delete the project before confirming.
- [ ] Verify an appropriate error message appears.
- [ ] Start activating, then move a target tab to another window.
- [ ] Verify the tab is skipped with a reason in the summary.
- [ ] Verify partial failures show accurate summaries with retry options.

## Keyboard access

- [ ] Complete all Phase 4 actions using keyboard only:
    - Activate project
    - Review drift dialog
    - Open all
    - Close all
    - Dismiss summaries
- [ ] Verify focus is restored to the trigger element after cancellation.
- [ ] Verify `aria-live` announcements for operation outcomes.

## Reduced-motion behavior

- [ ] Enable `prefers-reduced-motion` in system settings.
- [ ] Activate a project with unassigned tabs.
- [ ] Verify the unassigned pulse does not animate (uses static highlight instead).

## Console and network review

- [ ] Open the background service worker console.
- [ ] Perform Phase 4 operations (activate, open all, close all).
- [ ] Verify:
    - No unhandled errors
    - Operation logs include relevant identifiers
    - No notes or private metadata in logs
- [ ] Open the Network tab.
- [ ] Verify no Protab fetches (all operations are local).

## Manifest permissions

- [ ] Verify `manifest.json` contains only `["storage", "tabs"]`.
- [ ] Verify no host permissions, content scripts, or other permissions are declared.

## Production build

- [ ] Run `npm run build` and verify it completes without errors.
- [ ] Run `npm test` and verify all tests pass.
- [ ] Run `npm run lint` and verify no lint errors.
- [ ] Load the production build from `dist/` directory.
- [ ] Verify all Phase 4 features work in the production build.

---

## Right-click context menu on projects

- [ ] Right-click on a project in the sidebar.
- [ ] Verify a context menu appears with "Activate" and "Deactivate (close tabs)" options.
- [ ] Verify "Activate" shows "Reactivate" if the project is already active.
- [ ] Click "Activate" and verify the activation flow starts.
- [ ] Right-click on a non-active project.
- [ ] Verify "Deactivate (close tabs)" is disabled (greyed out).
- [ ] Right-click on the active project.
- [ ] Verify "Deactivate (close tabs)" is enabled.
- [ ] Click "Deactivate" and verify the close-all flow starts.
- [ ] Verify clicking outside the context menu closes it.
- [ ] Verify pressing Escape closes the context menu.

## Unsupported tabs group

- [ ] Open a new tab page (chrome://newtab) or an extension page.
- [ ] Verify it appears under a separate "Unsupported" group in the Current Tabs pane.
- [ ] Verify the "Unsupported" group is pre-collapsed by default.
- [ ] Expand the "Unsupported" group and verify the tab is listed.
- [ ] Verify unsupported tabs show "Unsupported page — view only" status.
- [ ] Verify unsupported tabs cannot be dragged or filed.
- [ ] Open a regular HTTP page and verify it appears under "Unassigned" (not "Unsupported").
- [ ] Verify the "Unsupported" group has distinct styling (slightly muted heading).
