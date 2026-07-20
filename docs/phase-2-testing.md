# Phase 2 Chrome testing

Phase 2 connects the workspace to live tabs in the same Chrome window. Automated tests use Chrome API doubles; complete this checklist against the production extension before declaring manual acceptance.

## Build and load

Requirements: Node.js 22 or newer and npm.

```sh
npm install
npm test
npm run lint
npm run build
```

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. If Protab is already loaded, select **Remove** first so restart behavior begins cleanly.
4. Select **Load unpacked** and choose this repository's `dist/` directory.
5. Pin Protab if useful. Clicking its toolbar action opens one workspace per Chrome window.

After source changes, run `npm run build`, then use **Reload** on the extension card and reload open workspace pages.

## Manual acceptance record

Record the Chrome version, OS, date, and tester. Capture two-window inventory screenshots and one 1280 × 1024 workspace screenshot.

- [ ] In two Chrome windows, open different ordinary tabs and a Protab workspace. Each pane shows only its own window, and no Protab workspace tab appears.
- [ ] Create, update, activate, reorder, move, and remove ordinary tabs. Inventory and tab-strip order update without reloading Protab.
- [ ] Confirm HTTP(S) tabs are supported. `chrome://`, extension, and other internal pages stay visible as **Unsupported page — view only** and offer no assignment.
- [ ] Select a live row using keyboard only. Chrome focuses its window and activates the tab.
- [ ] Open a saved URL. A uniquely matching unassigned tab is claimed and focused; otherwise a new owned tab opens.
- [ ] Invoke **Open** again. The most recently used exact owned instance is focused and no duplicate is created.
- [ ] Invoke **Open another copy**. A distinct owned instance always opens and both instances are listed/countable.
- [ ] Open identical URLs from two projects. Ownership remains independent and Open never steals another project's instance.
- [ ] Navigate an owned tab away from its saved URL. It remains under its project and says **Navigated from saved URL**. Open creates or reuses an exact current match instead.
- [ ] Create the same saved URL in two projects, clear runtime ownership by restarting Chrome, and confirm the matching tab remains Unassigned with both candidates.
- [ ] Assign the ambiguous tab. It stays open, moves to the selected project group, and saved title/tags/notes remain unchanged.
- [ ] Suspend the extension service worker from `chrome://extensions`, then interact again. Explicit ownership remains after wake.
- [ ] Fully restart Chrome. Reconciliation is non-destructive: it creates, closes, moves, or edits nothing; unique matches are restored and ambiguous matches need review.
- [ ] Delete a project with owned live tabs. The confirmation reports saved URL and live-tab counts; tabs stay open and become Unassigned.
- [ ] Exercise group collapse, row activation, assignment, Open, Open another copy, and project deletion using keyboard only. Focus returns to canceled triggers.
- [ ] Force or observe a query/focus/create failure. The error is scoped and retryable; project data remains usable.

## Console and Network review

- [ ] Workspace and service-worker consoles contain no unexpected errors during the checklist.
- [ ] Network shows no requests initiated by Protab application code. Browser-managed favicon loads may appear and should be identified separately.
- [ ] Confirm the loaded manifest requests only `storage` and `tabs` permissions.
- [ ] Confirm no tested Phase 2 operation closes an ordinary browser tab.

## Evidence to retain

- Chrome version and completed checklist
- two-window screenshots
- updated 1280 × 1024 workspace screenshot
- service-worker suspension/wake result
- full-restart reconciliation and ambiguity result
- console and Network review result
- deviations or unresolved risks
