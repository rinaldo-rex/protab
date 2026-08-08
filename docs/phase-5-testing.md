# Phase 5 Manual Testing Checklist

This checklist validates Phase 5 hardening and release-readiness behavior against the production build in Chrome.

## Setup

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `dist/` directory.
5. Pin Protab if desired, then click its toolbar action to open the full-page workspace.

---

## Recovery safety — startup paths never close tabs

These tests verify that browser startup, extension reload, service-worker restart, and workspace reopening never trigger tab closing.

### Extension reload

- [ ] Open several tabs across multiple projects.
- [ ] Activate a project so some tabs are closed and others remain.
- [ ] Go to `chrome://extensions` and click the **reload** button on Protab.
- [ ] Return to the Protab workspace tab.
- [ ] Verify:
    - All currently open tabs are still open.
    - No tabs were closed by the reload.
    - The workspace reconnects and shows the current tab inventory.
    - The active project indicator is preserved (if the window still exists).

### Service worker restart

- [ ] Open several tabs with a project active.
- [ ] Go to `chrome://serviceworker-internals`.
- [ ] Find Protab's service worker and click **Stop**.
- [ ] Return to the Protab workspace and perform any action (e.g., select a project).
- [ ] Verify:
    - The service worker restarts automatically.
    - No tabs were closed during the restart.
    - The workspace reconnects and shows the correct inventory.

### Browser restart

- [ ] Open Chrome with Protab installed and several tabs open.
- [ ] Activate a project so some tabs are owned.
- [ ] Close and reopen Chrome.
- [ ] Open Protab's workspace.
- [ ] Verify:
    - All tabs that were open when Chrome closed are still open.
    - No tabs were closed by the restart.
    - Ownership reconciliation occurs (matched tabs show ownership, ambiguous tabs show as Unassigned).
    - If the active project can be unambiguously restored, it is.
    - If the window or project no longer exists, no active project is shown.

### Workspace reopening

- [ ] Close the Protab workspace tab.
- [ ] Open several tabs.
- [ ] Click the Protab toolbar icon and open the workspace again.
- [ ] Verify:
    - No tabs were closed by reopening the workspace.
    - The new workspace tab appears in the Current Tabs pane.
    - All other tabs are correctly listed.

---

## Accessibility — reduced motion

These tests verify that animations respect the `prefers-reduced-motion` system preference.

### System setup

- [ ] Open your OS accessibility settings.
- [ ] Enable **Reduce motion** (macOS: System Preferences > Accessibility > Display; Windows: Settings > Accessibility > Visual effects).

### Active project pulse

- [ ] Activate a project.
- [ ] Verify the active project row does **not** pulse/animate.
- [ ] Verify the row still shows the active indicator (green dot) without animation.

### Loader spinner

- [ ] Open the workspace and observe the loading state.
- [ ] Verify the spinner does **not** rotate/animate.
- [ ] Verify the loading text is still visible.

### Toast notifications

- [ ] File a tab to a project (press `A` while hovering).
- [ ] Verify the success toast appears without slide-in animation.
- [ ] Verify the toast text is readable and dismissible.

### Quickstart tooltips

- [ ] Click the quickstart guide icon (❓) in the sidebar header.
- [ ] Verify tooltips/cards appear without fade-in animation.

### Flying tab animation

- [ ] Disable reduced motion (restore normal motion).
- [ ] File a tab via drag-and-drop.
- [ ] Verify a "flying tab" animation plays from the tab row to the workspace.
- [ ] Re-enable reduced motion.
- [ ] File another tab via drag-and-drop.
- [ ] Verify no animation plays.

---

## Accessibility — ARIA live regions

These tests verify that success and error messages are properly announced to screen readers.

### Screen reader setup

- [ ] Enable a screen reader (VoiceOver on macOS, NVDA on Windows).

### Success announcements (polite)

- [ ] File a tab to a project.
- [ ] Verify the screen reader announces "Saved to project." (or similar success message).
- [ ] Verify the announcement does **not** interrupt other screen reader output.

### Error announcements (assertive)

- [ ] Trigger an error (e.g., try to file when no project is selected).
- [ ] Verify the screen reader announces the error message.
- [ ] Verify the announcement **does** interrupt current speech.

### Reconciliation summary

- [ ] Restart the extension or browser.
- [ ] Open the workspace.
- [ ] Verify the screen reader announces the reconciliation summary (e.g., "Tab ownership was restored after restart: N matched, N need review").

---

## Accessibility — keyboard navigation

These tests verify that all interactions are accessible via keyboard.

### Context menu navigation

- [ ] Right-click a project in the sidebar to open the context menu.
- [ ] Press `Arrow Down` and `Arrow Up` to navigate menu items.
- [ ] Verify focus moves between items (highlighted state).
- [ ] Verify focus skips disabled items.
- [ ] Press `Enter` to activate the focused item.
- [ ] Press `Escape` to close the menu.

### Tab order

- [ ] Press `Tab` repeatedly through the entire workspace.
- [ ] Verify focus moves in a logical order:
    1. Sidebar header buttons (analytics, quickstart, settings)
    2. Project list items
    3. New project button
    4. Import drop zone
    5. Canvas header actions
    6. URL accordions
    7. Current Tabs pane elements
- [ ] Verify all interactive elements receive visible focus.

### Keyboard shortcuts

- [ ] Hover over a URL accordion and press `R` to archive/unarchive.
- [ ] Hover over a URL accordion and press `O` to open.
- [ ] Hover over a URL accordion and press `N` to focus notes.
- [ ] Press `Shift+N` to create a new project.
- [ ] Hover over a project and press `Shift+A` to archive/unarchive.
- [ ] Hover over a tab row in Current Tabs and press `A` to file.
- [ ] Hover over a tab row and press `P` to pin/unpin.
- [ ] Hover over a tab row and press `D` to delete to Trash.
- [ ] Hover over a tab row and press `C` to close.

---

## Failure hardening — storage resilience

These tests verify that storage failures are handled gracefully with clear recovery guidance.

### Storage quota exceeded

- [ ] Open DevTools background service worker console.
- [ ] Temporarily mock `chrome.storage.local.set` to reject with a quota error.
- [ ] Attempt to file a tab.
- [ ] Verify:
    - The result shows a failure message (e.g., "Could not save the URL").
    - The tab remains open.
    - No ownership is established.
    - No close request is issued.

### Storage read failure

- [ ] Mock `chrome.storage.local.get` to reject.
- [ ] Open the workspace.
- [ ] Verify:
    - A storage error state is shown.
    - The message explains the data can't be safely read.
    - The extension enters read-only mode.

### Tab disappearing during filing

- [ ] Start filing a tab.
- [ ] Before confirming, close the tab manually (or via another extension).
- [ ] Confirm the filing.
- [ ] Verify:
    - The result shows "Tab disappeared" or similar.
    - The saved URL is still persisted (if the save happened before the tab closed).
    - No error crashes the workspace.

### Tab navigation during filing

- [ ] Start filing a tab.
- [ ] Before confirming, navigate the tab to a different URL.
- [ ] Confirm the filing.
- [ ] Verify:
    - The result shows "URL changed — not closed. File again if needed."
    - The tab remains open and unassigned.
    - The original URL is saved (if persisted before navigation).

### Close request rejected

- [ ] Open a tab with a `beforeunload` handler (e.g., a page with a form).
- [ ] File the tab to a project.
- [ ] If Chrome shows a "Leave site?" dialog, click **Cancel**.
- [ ] Verify:
    - The result shows "Tab saved but still open. Chrome rejected the close request."
    - The saved URL is persisted.
    - The tab appears in the attention banner with a **Retry** button.

### Project deletion during in-flight operation

- [ ] Start activating a project (open the confirmation dialog).
- [ ] In another window, delete the project being activated.
- [ ] Confirm the activation.
- [ ] Verify:
    - An appropriate error message appears (e.g., "This operation is no longer valid").
    - No crash or undefined behavior.

---

## Failure hardening — partial operations

These tests verify that partial failures in bulk operations are reported accurately.

### Bulk filing with mixed outcomes

- [ ] Open several tabs: some eligible, one unsupported, one with a URL that will fail to save (mock storage failure for a specific URL).
- [ ] Run **File all unassigned**.
- [ ] Verify the summary shows:
    - Created count (successful saves)
    - Skipped count (unsupported tabs)
    - Failed count (storage failures) with error messages
- [ ] Verify successfully filed tabs are closed (or close requested).
- [ ] Verify failed tabs remain open.

### Activation with protected tabs

- [ ] Open tabs for two projects.
- [ ] Pin one of the "other project" tabs (Chrome pin or Protab pin).
- [ ] Activate a project.
- [ ] Verify:
    - The protected tab is skipped with reason "Protected: chrome-pinned" (or "Protected: manual-pin").
    - Other non-protected tabs are closed as expected.
    - The activation summary reports the skipped tab.

### Close all with surviving tabs

- [ ] Open tabs for a project, including one with a `beforeunload` handler.
- [ ] Run **Close all** on the project.
- [ ] If one tab's close is cancelled:
    - Verify it appears in the attention banner.
    - Verify the summary reports it as "surviving" or "failed".
    - Verify the **Retry** button works.

---

## Documentation verification

These tests verify that the README provides accurate guidance for fresh users.

### Build from clean checkout

- [ ] Follow the README's "Install and build" section exactly.
- [ ] Run `npm install`, `npm test`, `npm run lint`, `npm run build`.
- [ ] Verify all commands complete without errors.

### Load extension from README

- [ ] Follow the README's "Load the extension" section exactly.
- [ ] Load `dist/` as unpacked extension.
- [ ] Verify the extension loads without errors.

### First-use walkthrough

- [ ] Follow the README's "First-use walkthrough" section exactly.
- [ ] Open the workspace, create a project, file tabs.
- [ ] Verify each step works as documented.

### Privacy statement accuracy

- [ ] Open DevTools Network tab in the workspace.
- [ ] Perform various actions (create project, file tabs, open URLs).
- [ ] Verify:
    - No requests to external servers.
    - All operations are local.
- [ ] Open DevTools Network tab in the background service worker.
- [ ] Repeat the actions.
- [ ] Verify:
    - No requests to external servers.
    - No analytics or telemetry.

---

## Network and permission verification

These tests verify that the extension makes no remote requests and uses only declared permissions.

### No remote assets

- [ ] Open the workspace.
- [ ] Open DevTools Network tab.
- [ ] Refresh the page.
- [ ] Verify:
    - All requests are to `chrome-extension://` URLs (local assets).
    - No requests to external CDNs, analytics, or telemetry servers.
- [ ] Open the background service worker's Network tab.
- [ ] Perform various operations.
- [ ] Verify no external requests.

### Permission audit

- [ ] Open `chrome://extensions`.
- [ ] Find Protab and click **Details**.
- [ ] Verify permissions listed are only:
    - `storage`
    - `tabs`
    - `activeTab`
    - `contextMenus`
- [ ] Verify no host permissions are declared.
- [ ] Verify no content scripts are injected.

---

## Visual verification

These tests verify the UI matches the Stitch visual reference.

### Desktop composition at 1280×1024

- [ ] Resize Chrome to approximately 1280×1024.
- [ ] Open the workspace with:
    - Empty state (no projects)
    - Loading state (fresh load)
    - Populated state (multiple projects with URLs)
    - Error state (trigger a storage error)
- [ ] Compare against `stitch_core_artifacts/screen.png`.
- [ ] Verify:
    - Warm-minimal hierarchy is preserved.
    - Compact density is maintained.
    - Three-pane clarity is present.

### Long content handling

- [ ] Create a project with a very long name (80 characters).
- [ ] Add URLs with long titles (200 characters).
- [ ] Add URLs with many tags (10+).
- [ ] Verify:
    - Long names truncate with ellipsis.
    - Layout doesn't break or overflow.
    - All content is still accessible (hover to see full text).

### 200% zoom at 1920×1080

- [ ] Set Chrome zoom to 200%.
- [ ] Verify:
    - All actions are reachable with vertical scrolling only.
    - No horizontal scrolling is required.
    - All buttons and controls are visible and clickable.

---

## Regression matrix verification

- [ ] Open `docs/regression-matrix.md`.
- [ ] Verify all 69 acceptance criteria are listed.
- [ ] Verify each criterion has either an automated test reference or a manual test plan.
- [ ] Spot-check 5 criteria from different phases to verify the evidence is accurate.

---

## Console and error review

- [ ] Open the background service worker console.
- [ ] Perform all Phase 5 test scenarios.
- [ ] Verify:
    - No unhandled errors or warnings.
    - Error messages are clear and actionable.
    - No sensitive data (URLs, titles, notes) appears in logs.

---

## Production build verification

- [ ] Run `npm run build` and verify it completes without errors.
- [ ] Run `npm test` and verify all 255 tests pass.
- [ ] Run `npm run lint` and verify no lint errors (except `.pi/` scripts).
- [ ] Load the production build from `dist/` directory.
- [ ] Verify all Phase 5 hardening works in the production build.
