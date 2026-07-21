# Phase 4 — How to build it

This document fixes the implementation boundaries for deliberate project focus actions on top of the completed Phase 3 code. Phase 4 reuses the approved V0 close policy and the shared filing/close workflow for Activate and Close all, and extends Phase 2 Open semantics for Open all.

Local names and component decomposition may vary when tests, ordering, safety, and product behavior remain equivalent.

## Technology and completed Phase 3 baseline

Retain the existing stack and command contract:

- TypeScript in strict mode
- React and Vite
- Manifest V3 background service worker and full-page `workspace.html`
- Vitest, jsdom, Testing Library, and ESLint
- Plain CSS using the committed Stitch tokens
- Locally bundled Inter and icons
- npm with committed lockfile

Required checks remain:

```sh
npm test
npm run lint
npm run build
```

Extend the actual Phase 3 seams rather than replacing them:

- `src/background/index.ts` remains the service-worker composition root and registers Chrome listeners once.
- `src/background/tabs/coordinator.ts` owns validated workspace subscriptions, current-window operations, inventory refreshes, and per-window serialization.
- `src/background/tabs/chromeTabs.ts` is the narrow Chrome tabs/windows adapter.
- `src/background/tabs/ownershipStore.ts` remains the validated `chrome.storage.session` repository.
- `src/background/tabs/filing.ts` owns single/bulk filing orchestration and the shared close primitive.
- `src/background/tabs/closeTracker.ts` owns non-blocking close observation and attention state.
- `src/domain/liveTabs.ts` and `src/domain/ownership.ts` remain the pure live-tab classification, reconciliation, grouping, and instance-count boundaries.
- `CommandQueue` remains the only serializer for durable project mutations.
- `PersistedStateV1` remains the durable project schema.
- `src/background/messages.ts`, `src/workspace/useLiveTabs.ts`, and `CurrentTabsPane.tsx` remain the product-level live protocol and UI channel.
- Existing dialogs, action menus, focus restoration, keyboard patterns, and CSS tokens remain the workspace baseline.
- `FilingOrchestrator` public API (`prepare`, `executeFiling`, `prepareBulk`, `executeBulkFiling`, `retryClose`, `resolveTabRemoval`) remains the single close primitive.
- `CloseTrackerStore` session key (`protab.closeAttempts.v1`) and schema remain unchanged.

Phase 3 established these interfaces that Phase 4 must preserve:

- `FILE_LIVE_TAB` command type and `CommandResultMeta.filing`
- `PreparedFilingOperation`, `FilingResult`, `FilingSummary` types
- `LiveTabRequest` filing variants
- `LiveTabMessage` filing result types
- Attention banner and row marker patterns
- Drag-and-drop targets on project sidebar/canvas
- `FileTabsDialog` two-step confirmation pattern

Do not let React call Chrome APIs, write storage, decide eligibility from stale props, or synthesize successful results. The background revalidates every operation.

## Selected versus active project

**Selected** controls which project is displayed and edited in the center pane. **Active** identifies the project currently in focus for Chrome-window-level actions (Activate, Close all). They are independent per window.

### Per-window state model

Extend the coordinator's per-window client subscription:

```ts
interface ClientSubscription {
  workspaceTabId: number
  windowId: number
  port: chrome.runtime.Port
  lastInventory?: LiveTabInventory
  selectedProjectId?: string   // existing from workspace
  activeProjectId?: string     // new: Phase 4
}
```

The workspace already sends `selectedProjectId` through the existing state-read mechanism. Add an `activeProjectId` to the live-tab protocol so the background can enforce window-scoped operations.

Active state must survive service-worker suspension. Store it in `chrome.storage.session` using a dedicated key:

```ts
const ACTIVE_PROJECT_STORAGE_KEY = 'protab.activeProject.v1'

interface ActiveProjectV1 {
  schemaVersion: 1
  entries: Record<number, string>  // windowId → projectId
}
```

Use the same validated `SessionStorageAdapter` pattern as `OwnershipStore` and `CloseTrackerStore`. Do not add active state to `PersistedStateV1`.

### UI distinction

In the sidebar, distinguish selected and active projects visually:

- **Selected**: current highlight (existing)
- **Active**: additional indicator (e.g., filled dot, bold label, or distinct border) that is not color-only
- A project can be both selected and active
- A project can be selected without being active

In the project header, show active status when applicable.

## Activate

Activation closes tabs owned by other projects in the current window. It does not open saved URLs.

### Protocol

```ts
{ kind: 'PREPARE_ACTIVATE_PROJECT'; projectId: string }
{ kind: 'CONFIRM_ACTIVATE_PROJECT'; operationId: string }
{ kind: 'CANCEL_ACTIVATE_PROJECT'; operationId: string }
```

### Prepare step

The background:

1. Revalidates the workspace client and current sender window.
2. Reads the latest durable state and inventory.
3. Identifies live tabs owned by other projects (non-drifted ownership pointing to a different `projectId`).
4. Identifies drifted tabs with provenance pointing to other projects.
5. Returns a prepared operation containing:
   - Target project name and ID
   - Count of other-project tabs to close
   - List of drifted tabs requiring review (with saved/original URL and current URL)
   - Count of unassigned tabs that will remain open

### Drift review

If any target tabs are drifted (current URL differs from established ownership URL):

1. Show a drift-review dialog listing each drifted tab with:
   - Original saved URL
   - Current URL
   - Keep/Close toggle (default: Close)
2. The user can keep individual drifted tabs open.
3. Kept tabs retain their ownership provenance and receive a `needs-review` marker in the inventory view.
4. The marker is visual only; it does not change the tab's grouping or eligibility.

### Confirmed execution order

Serialize execution through the existing per-window `operationTails` boundary. For one activation:

1. Re-read latest durable state and inventory.
2. Revalidate target tabs (must still be owned by other projects, still in window).
3. For each target tab:
   a. Re-read the tab's current URL.
   b. If URL changed since preparation and tab was not in drift review, skip and report.
   c. If tab was kept in drift review, skip.
   d. Register close tracking.
   e. Issue `chrome.tabs.remove(tabId)` through the shared close primitive.
   f. Report result (closed, requested, skipped, failed).
4. After all close requests, set `activeProjectId` for this window.
5. Persist active state to `chrome.storage.session`.
6. Broadcast refreshed inventory.
7. Return activation summary.

Mark the project active after close requests are issued, even when some targets are kept, pending, skipped, or failed. Those exceptions remain visible as attention items.

### Unassigned notice

After activation, if unassigned tabs remain in the window:

1. Pulse the Unassigned group heading once.
2. Show a dismissible notice with the count: "N unassigned tabs remain open."
3. The pulse must respect `prefers-reduced-motion`: no animation if reduced motion is preferred.
4. The pulse must not repeat continuously.

### Cancellation

If the user cancels before confirmation, leave active state unchanged.

## Open all

Open all operates on every saved URL in the selected project. It reuses Phase 2 Open semantics.

### Protocol

```ts
{ kind: 'OPEN_ALL_PROJECT_URLS'; projectId: string }
```

No prepare/confirm step is needed because Open all does not close tabs.

### Execution

For each saved URL in the selected project:

1. Check if an eligible owned instance already exists in the current window (same `projectId`, same `savedUrlId`, same URL, not drifted).
2. If yes: focus the most recently accessed instance. Do not create a duplicate.
3. If no: create a new tab with the saved URL and establish ownership.
4. Continue after independent create/focus failures.
5. After all items, broadcast refreshed inventory and return a result summary.

### Idempotency

Running Open all twice without intervening tab changes creates no additional tabs. The second run finds all instances already owned and focuses them.

### Result model

```ts
interface OpenAllSummary {
  total: number
  focused: number
  created: number
  failed: Array<{ savedUrlId: string; message: string }>
}
```

## Close all

Close all targets every live tab owned by the selected project in the current window. It uses the shared close workflow from Phase 3.

### Protocol

```ts
{ kind: 'PREPARE_CLOSE_ALL_PROJECT_TABS'; projectId: string }
{ kind: 'CONFIRM_CLOSE_ALL_PROJECT_TABS'; operationId: string }
{ kind: 'CANCEL_CLOSE_ALL_PROJECT_TABS'; operationId: string }
```

### Prepare step

The background:

1. Revalidates the workspace client and current sender window.
2. Reads the latest durable state and inventory.
3. Identifies live tabs owned by the selected project (non-drifted ownership).
4. Identifies drifted tabs with provenance pointing to the selected project.
5. Returns a prepared operation containing:
   - Project name and ID
   - Count of owned tabs to close
   - List of drifted tabs requiring review

### Drift review

Same as Activate: drifted tabs get per-tab review with Keep/Close toggles.

### Confirmed execution order

1. Re-read latest durable state and inventory.
2. Revalidate target tabs.
3. For each target tab:
   a. Re-read the tab's current URL.
   b. If URL changed and not in drift review, skip and report.
   c. If tab was kept in drift review, skip.
   d. Register close tracking.
   e. Issue `chrome.tabs.remove(tabId)` through the shared close primitive.
   f. Report result.
4. Broadcast refreshed inventory.
5. Return close-all summary.

### Result model

```ts
interface CloseAllSummary {
  total: number
  closed: number
  requested: number
  kept: number
  surviving: number
  skipped: Array<{ tabId: number; reason: string }>
  failed: Array<{ tabId: number; message: string }>
}
```

Close all never deletes or edits saved records. It never closes unassigned tabs or tabs owned by another project.

## Active-state recovery

### Service-worker suspension

Active state must survive service-worker suspension. The `ActiveProjectStore` reads from `chrome.storage.session` on initialization.

### Browser restart

Browser restart recovery is best effort because Chrome window identity may change. On startup:

1. Read active state from `chrome.storage.session`.
2. For each stored `(windowId, projectId)` pair:
   a. Check if the window still exists.
   b. Check if the project still exists in durable state.
   c. If both are unambiguous, restore active state.
3. If the window association is ambiguous (window gone, multiple windows match, or project deleted), show **No active project** and require explicit activation.
4. Startup and recovery never run activation or close operations.

### Restoration logic

```ts
async function restoreActiveState(
  api: ChromeTabsApi,
  state: PersistedStateV1,
  stored: Record<number, string>,
): Promise<Map<number, string>> {
  const restored = new Map<number, string>()
  for (const [windowIdStr, projectId] of Object.entries(stored)) {
    const windowId = Number(windowIdStr)
    // Verify window exists
    try {
      await api.focusWindow(windowId)
    } catch {
      continue  // window gone
    }
    // Verify project exists
    if (!state.projects.some((p) => p.id === projectId)) continue
    restored.set(windowId, projectId)
  }
  return restored
}
```

## Suggested source boundaries

Extend the current structure approximately as follows:

```text
src/
├── background/
│   ├── index.ts
│   ├── messages.ts
│   └── tabs/
│       ├── chromeTabs.ts          existing
│       ├── coordinator.ts         extend with activate, open all, close all, active state
│       ├── ownershipStore.ts      existing
│       ├── filing.ts              existing shared close primitive
│       ├── closeTracker.ts        existing
│       └── activeProjectStore.ts  new: per-window active project persistence
├── domain/
│   ├── commands.ts                existing
│   ├── applyCommand.ts            existing
│   ├── liveTabs.ts                existing
│   ├── ownership.ts               extend with helpers for other-project filtering
│   ├── filing.ts                  existing
│   └── tagSuggestions.ts          existing
├── storage/
│   └── commandQueue.ts            existing
├── workspace/
│   ├── App.tsx                    extend with active indicators, project actions
│   ├── CurrentTabsPane.tsx        existing
│   ├── ProjectActions.tsx         extend with Activate, Open all, Close all
│   ├── DriftReviewDialog.tsx      new: per-tab drift review
│   ├── ActivationSummary.tsx      new: activation result with unassigned notice
│   ├── CloseAllSummary.tsx        new: close-all result
│   ├── OpenAllSummary.tsx         new: open-all result
│   ├── AttentionBanner.tsx        existing
│   └── useLiveTabs.ts             extend with activate, open all, close all methods
└── styles/global.css              extend with active indicators, drift review, summaries
```

Exact filenames may differ. Keep eligibility filtering, drift detection, summaries, and close-state transitions pure where possible. Keep Chrome side effects in the background.

## Errors and race handling

Define typed errors for Phase 4 operations:

- workspace/window no longer available
- project disappeared
- tab disappeared
- tab moved to another window
- tab is no longer owned by the expected project
- URL changed before close
- close request failed
- close still unresolved/surviving
- prepared operation expired or became stale
- active state persistence failed

Rules:

- Validate current tab, window, project, and ownership before each close.
- Re-read every target's URL immediately before requesting close.
- Skip and report any detected URL change.
- Never close after a validation failure.
- A disappearing tab is ordinary browser concurrency; report it as already closed.
- An operation failure in one window cannot change active state or tab ownership in another.
- Partial activation does not hide tabs that were kept, skipped, or failed.
- If project data changes during an operation, stop targeting deleted or reassigned records and reconcile before continuing.
- Open all and Close all have separate summaries and retry only failed eligible items.
- All confirmations and summaries identify the affected project and window-local counts.
- Startup, reconciliation, extension reload, and service-worker wake never resume or initiate close operations automatically.

## Test strategy

### Active project store tests

Cover:

- read/write round-trip
- per-window isolation (writing window 1 does not affect window 2)
- clearing active state for a window
- corrupted data recovery
- service-worker suspension survival

### Domain tests

Cover:

- filtering tabs by other-project ownership
- filtering tabs by selected-project ownership
- identifying drifted tabs with provenance
- grouping logic with active-project context

### Background operation tests

With the existing narrow Chrome test double, cover:

**Activate:**
- sender-window authority and cross-window rejection
- identifying other-project tabs correctly
- excluding unassigned tabs
- excluding workspace tabs
- drift review preparation with correct URL pairs
- kept tabs receiving needs-review marker
- close ordering and shared primitive usage
- active state persistence after confirmation
- cancellation preserving active state
- partial failure keeping project active
- unassigned notice count after activation

**Open all:**
- reusing existing owned instances (no duplicates)
- creating missing instances
- establishing ownership on new tabs
- continuing after individual create/focus failures
- idempotency (second run creates no tabs)
- not changing active state

**Close all:**
- targeting only selected-project tabs
- excluding unassigned and other-project tabs
- drift review with correct targets
- shared close primitive usage
- not deleting or editing saved records
- summary with correct counts

**Recovery:**
- restoring active state for unambiguous windows
- clearing active state for ambiguous windows
- never running close operations on startup

### Workspace tests

Cover:

- selected vs active visual distinction (not color-only)
- Activate action visibility and disabled state
- Open all action and idempotency
- Close all action and confirmation
- drift-review dialog with Keep/Close toggles
- activation summary with unassigned notice
- open-all summary with focused/created/failed counts
- close-all summary with all outcome categories
- reduced-motion pulse behavior
- keyboard access for all actions and review steps
- focus restoration after cancellation
- `aria-live` announcements for operation outcomes
- absence of deferred controls (settings, pinning, etc.)

### Manual Chrome tests

Complete `what.md` against the production build, including:

- select project without opening/closing tabs
- activate project and verify only other-project tabs close
- verify unassigned tabs remain with accessible warning
- verify activation opens no saved URLs
- run Open all twice and verify idempotency
- run Close all and verify saved records unchanged
- navigate owned tabs, review drift individually, verify kept/changed cases
- activate different projects in two windows and verify isolation
- restart Chrome with recoverable and ambiguous windows
- force partial Chrome API failures and verify summaries
- complete all actions using keyboard only
- verify reduced-motion pulse behavior

Record Chrome version, OS, exact wording observed, and any behavioral differences.

## Atomic commit sequence

Keep every commit buildable and all existing checks green. Tests belong in the same commit as the behavior they verify.

1. `feat: add per-window active project state and store`
2. `feat: add activate project with drift review and close workflow`
3. `feat: add open all project URLs`
4. `feat: add close all project tabs`
5. `feat: add active-state recovery on startup`
6. `docs: add Phase 4 loading and test instructions`

Commit 1 introduces the active-project store and UI indicators without any operations. Commit 2 builds Activate using the shared close primitive from Phase 3. Commits 3 and 4 add Open all and Close all independently. Commit 5 adds recovery logic. Commit 6 provides documentation.

If implementation proves that drift review must land with commit 1 to be testable across operations, include the minimum review component there and explain the split in completion evidence.

## Completion evidence

Before declaring Phase 4 complete, provide:

- commit list matching the sequence above or an explanation for any split/merge
- output of `npm test`, `npm run lint`, and `npm run build`
- production build location and unpacked-loading steps
- manual checklist results with Chrome version and OS
- evidence that selecting a project never opens or closes tabs
- evidence that Activate targets only other-project tabs
- evidence that unassigned tabs remain open with accessible warning
- evidence that drift review shows correct URLs and respects Keep/Close
- evidence that Open all is idempotent
- evidence that Close all does not change saved records
- evidence of per-window isolation (two-window test)
- evidence of active-state recovery (unambiguous and ambiguous cases)
- evidence that startup never runs close operations
- evidence of partial failure handling and retry
- evidence of keyboard-only completion and reduced-motion behavior
- console and Network review results
- exact manifest permissions
- deviations, unresolved risks, and interfaces Phase 5 must preserve
