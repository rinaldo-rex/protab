# Phase 2 — How to build it

This document fixes the implementation boundaries for connecting the completed Phase 1 workspace to Chrome's live tabs. Local names and component decomposition may vary when tests and behavior remain equivalent.

## Technology and Phase 1 baseline

Retain the Phase 1 stack and command contract:

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

Extend the existing seams rather than replacing them:

- `src/background/index.ts` remains the service-worker composition root.
- `CommandQueue` remains the single owner of durable project mutations.
- `PersistedStateV1` remains the durable project schema.
- Runtime messages remain product-level requests and committed-state broadcasts.
- `ToolbarChrome` and new tab APIs stay behind narrow adapters.
- The Phase 1 workspace, menus, dialogs, focus behavior, and CSS tokens remain the UI baseline.

Do not fold live-tab state into React components or permit workspace pages to call Chrome tab APIs directly.

## Extension boundary and permissions

Keep manifest permissions exactly:

```json
["storage", "tabs"]
```

Phase 2 does not need host permissions, content scripts, scripting, history, bookmarks, sessions, web navigation, or tab-closing permissions. The existing `tabs` permission provides the tab URL, title, favicon URL, lifecycle events, focus, and creation surfaces required by this phase.

The background service worker owns:

- resolving which Chrome window contains each workspace client
- querying and normalizing that window's ordinary tabs
- subscribing to Chrome tab/window lifecycle events
- runtime ownership and reconciliation
- focus, assignment, Open, and Open another copy operations
- automatic-title refresh through the existing durable command queue
- project deletion cleanup for live ownership

A workspace receives a window-scoped inventory from the background. It must never supply an arbitrary `windowId` as authority for an operation.

## Workspace-client identity and window resolution

Use `chrome.runtime.Port` connections for the Phase 2 live-tab channel while retaining request/response runtime messages for Phase 1 durable commands if desired. A port gives the service worker a client lifecycle and a sender tab from which to derive the workspace window.

When `workspace.html` connects:

1. Validate that `port.sender.tab` is a Protab workspace tab whose URL equals `chrome.runtime.getURL('workspace.html')`.
2. Require a numeric sender tab ID and window ID.
3. Create a client subscription keyed by the workspace tab ID and bound to that window ID.
4. Query and reconcile that window, then emit an inventory snapshot.
5. Remove the subscription when the port disconnects.

Every live-tab action includes the acting workspace tab ID or is sent over its bound port. Before executing, resolve the current sender window again and reject stale or mismatched clients. Do not trust a project ID, saved-record ID, tab ID, or window ID merely because the UI sent it; validate all referenced entities against the latest durable state and current Chrome inventory.

Manually duplicated Protab workspace tabs may subscribe to the same window and receive the same inventory. They do not create duplicate ownership state.

## Suggested source boundaries

Extend the existing structure approximately as follows:

```text
src/
├── background/
│   ├── index.ts                 service-worker composition
│   ├── messages.ts              durable and live protocol types
│   ├── toolbar.ts               existing workspace toolbar behavior
│   └── tabs/
│       ├── chromeTabs.ts        narrow Chrome tabs/windows adapter
│       ├── inventory.ts         query, normalize, sort, and filter
│       ├── ownershipStore.ts    session ownership repository
│       ├── reconcile.ts         pure ownership reconciliation
│       ├── coordinator.ts       subscriptions and event refreshes
│       └── operations.ts        focus, assign, open, create, delete cleanup
├── domain/
│   ├── ...                      existing project domain
│   └── liveTabs.ts              live types, matching, grouping, eligibility
├── storage/                     existing V1 durable repository and queue
├── workspace/
│   ├── ...                      existing Phase 1 UI
│   ├── useLiveTabs.ts           port lifecycle and inventory state
│   ├── CurrentTabsPane.tsx
│   ├── LiveTabGroup.tsx
│   └── LiveTabRow.tsx
└── styles/                      extend existing token-based CSS
```

Exact filenames may differ. Keep reconciliation and Open precedence pure where possible so they can be tested without Chrome.

## Durable state and runtime ownership

### Keep the durable schema at V1

Phase 2 does not change the durable project shape:

```ts
interface PersistedStateV1 {
  schemaVersion: 1
  projects: Project[]
}
```

Do not create a V2 migration merely to store ephemeral tab ownership. Projects, saved URLs, metadata, and ordering continue under the existing stable local key and validation boundary.

### Store explicit ownership in `chrome.storage.session`

Use a separate, stable `chrome.storage.session` key for runtime ownership. Session storage survives service-worker suspension but is cleared when Chrome restarts, which makes restart reconciliation explicit and avoids trusting reused tab IDs.

A conceptual record is:

```ts
interface LiveOwnershipV1 {
  schemaVersion: 1
  entries: Record<string, OwnershipEntry>
}

interface OwnershipEntry {
  tabId: number
  windowId: number
  projectId: string
  savedUrlId: string
  establishedUrl: string
}
```

- Key entries by tab ID, while retaining the tab ID in the validated value for clarity.
- `establishedUrl` is the exact saved-record URL at the moment ownership is explicitly established or safely reconciled.
- Current URL is inventory state, not ownership state.
- Navigation updates do not rewrite `projectId`, `savedUrlId`, or `establishedUrl`.
- Do not persist tab title, favicon, active state, tab-strip index, candidate lists, or group collapse state.
- Configure session storage access so only trusted extension contexts need access; workspaces still use the background protocol rather than reading it directly.

All session reads pass through validation. Invalid individual entries are discarded; an invalid whole ownership object initializes an empty session ownership store and produces diagnostics, but must never place durable project storage into its blocking corruption state.

Serialize ownership read-modify-write operations in the background. This can use a dedicated ownership queue or one coordinator queue; it must prevent two simultaneous opens or assignments from losing entries.

### Ownership invariants

An ownership entry is valid only when all of these remain true:

- the Chrome tab exists
- its current `windowId` matches the entry, updating the entry if Chrome moved the same tab to another window
- the referenced project exists
- the referenced saved record exists in that project
- the saved record's current URL equals `establishedUrl`

If a project, record, or established URL no longer matches, discard ownership and classify the tab from its current URL. Editing a saved record's URL must not silently retarget an existing live instance.

One tab ID has at most one ownership entry. Multiple tab IDs may point to the same saved record.

## Tab inventory

Define a normalized UI-safe model rather than exposing raw `chrome.tabs.Tab` values:

```ts
interface LiveTabView {
  tabId: number
  windowId: number
  index: number
  active: boolean
  title: string
  url?: string
  urlSummary: string
  hostname?: string
  favIconUrl?: string
  supported: boolean
  ownership?: {
    projectId: string
    savedUrlId: string
    establishedUrl: string
    drifted: boolean
  }
  candidates: Array<{ projectId: string; savedUrlId: string }>
}
```

### Query and filtering

For a subscribed workspace, query only its resolved window:

```ts
chrome.tabs.query({ windowId })
```

Exclude every tab whose URL is an exact Protab workspace URL, not only the subscribing workspace tab. Do not exclude other extension, Chrome, file, or browser-internal pages; show them as unsupported.

A tab is supported only when its current URL:

- parses successfully with the browser `URL` implementation
- uses `http:` or `https:`
- contains no embedded username or password

Use the same serialized URL identity rules as saved records. Unsupported or unavailable URLs remain visible, have no candidates, and cannot be assigned or saved.

Normalize cautiously:

- Title falls back to hostname, serialized URL summary, or `Untitled tab`.
- Show hostname for supported URLs and a safely truncated URL/scheme summary otherwise.
- Accept `favIconUrl` only as display data from Chrome. Render it with a local fallback icon, `referrerPolicy="no-referrer"`, and an error fallback. Do not fetch, proxy, persist, or transform it. A favicon loaded by the browser may appear as a network entry; Protab must not initiate its own fetch.
- Preserve the tab's `index` for ordering inside groups.
- Use full title and URL in accessible names or visually hidden text while truncating the visible row.

### Lifecycle updates

Register service-worker listeners once for:

- `chrome.tabs.onCreated`
- `chrome.tabs.onUpdated`
- `chrome.tabs.onActivated`
- `chrome.tabs.onMoved`
- `chrome.tabs.onAttached`
- `chrome.tabs.onDetached`
- `chrome.tabs.onRemoved`
- `chrome.tabs.onReplaced`
- relevant `chrome.windows` removal/focus changes when needed

On an event, refresh only affected subscribed windows. Coalesce bursts into one refresh per window on a short microtask/debounce boundary; do not broadcast every intermediate loading event.

`onRemoved` also deletes the ownership entry. `onAttached` or a query result showing a changed window updates the entry's window ID. `onReplaced` transfers ownership only when Chrome explicitly reports the replacement pair and the referenced project/record is still valid; otherwise discard and reconcile.

Event listeners are hints, not the source of truth. Each emitted snapshot comes from a fresh window query so missed events or service-worker suspension self-heal.

If a query fails, retain the last successful snapshot, mark it stale, display a pane-scoped error, and expose Retry. Never alter durable project data because inventory failed.

## Reconciliation

Reconciliation is a pure classification step over the latest durable projects, current tabs, and validated session ownership.

For each ordinary tab:

1. If a valid explicit/session ownership entry exists, retain its provenance even when the current URL has changed. Mark `drifted` when the current serialized URL differs from `establishedUrl` or is unsupported/unavailable, and display that drifted row under **Unassigned** until a fresh filing decision.
2. Otherwise, for a supported current URL, find every saved record whose exact serialized URL matches.
3. If exactly one record matches globally, create session ownership for that project and record.
4. If multiple records match, leave the tab unassigned and expose all candidates in persistent project order and saved-record order.
5. If none match, leave it unassigned with no candidates.

Reconciliation never creates, edits, deletes, reorders, or copies a saved record. It never creates, closes, activates, or moves a Chrome tab.

### Restart feedback

Because `chrome.storage.session` is empty after a Chrome restart, the first reconciliation for a window may reconstruct ownership. Show one dismissible, pane-scoped summary per workspace session when reconciliation actually did work or found ambiguity, for example:

> Tab ownership was restored after restart: 4 matched, 2 need review.

The message must state actual counts and must not claim that previous explicit ownership was recovered. Ambiguous rows remain marked until assigned or no longer ambiguous. Store dismissal only in workspace UI state.

To avoid showing this message on every ordinary refresh, the coordinator records in memory/session metadata that initial reconciliation has run for the current browser session and window. A service-worker wake during the same browser session must not be described as a browser restart.

## Grouping and row behavior

Build groups from normalized inventory:

1. One group for each project that currently owns at least one non-drifted exact live tab, ordered by the durable project array.
2. **Unassigned** last when it contains ownerless or drifted tabs.

Within every group, sort by Chrome tab `index`. Do not sort by title, URL, ownership time, or active state.

Group collapse state is workspace-local React state and is never persisted. Headers expose `aria-expanded`, control a labelled region, and show the tab count. Updating inventory must not reset unrelated group collapse choices.

A row must communicate with text/iconography, not color alone:

- active Chrome tab: `Current tab` indicator and `aria-current`
- owned tab: project label and owned-instance context
- drifted tab: `Navigated from saved URL · Unassigned`; retain provenance for counts, Open exclusion, and later close review
- ambiguous unassigned tab: `Matches N projects — assignment needed`
- unsupported tab: `Unsupported page — view only`

Activating a row calls a background `FOCUS_LIVE_TAB` operation. The background verifies that the tab still exists in the workspace window, focuses the window, then activates the tab. If the tab disappeared, refresh the inventory and return a non-destructive row/pane error.

### Assign to

Show **Assign to…** only when an unassigned supported tab has one or more exact saved-record candidates. Candidate choices identify the project and, where useful, saved-record title. Because one URL is unique within a project, there is at most one candidate record per project.

Assignment:

1. Re-read the latest durable state.
2. Re-query or get the tab and verify it still belongs to the workspace window.
3. Re-serialize its current URL and recompute candidates.
4. Verify the selected project/record is still a candidate.
5. Write one session ownership entry with the current saved URL as `establishedUrl`.
6. Broadcast the refreshed inventory.

It does not activate, move, reload, create, close, or mutate a saved record. If the tab changed or disappeared, return a specific error and reconcile instead of applying stale assignment.

## Opening saved URLs

Add background operations in product terms:

- `OPEN_SAVED_URL`
- `OPEN_SAVED_URL_COPY`
- `FOCUS_LIVE_TAB`
- `ASSIGN_LIVE_TAB`
- `RETRY_TAB_INVENTORY`

The UI sends project and saved-record IDs, not a URL to trust. The background reads the latest durable state and resolves the canonical saved URL itself.

### Open

Within the acting workspace's current window:

1. Query and reconcile the latest inventory.
2. Find owned instances whose `projectId` and `savedUrlId` match the requested record and whose current serialized URL exactly equals the record URL.
3. If any exist, choose the highest numeric `chrome.tabs.Tab.lastAccessed`; use the higher tab ID as a deterministic fallback when recency is missing or tied. Focus the window and activate that tab.
4. Otherwise, find exact matching unassigned tabs whose candidate set contains only this saved record globally. If candidates are still ambiguous, do not use or steal the tab.
5. If an unambiguous unassigned match exists, create its ownership entry, focus it, and broadcast inventory.
6. Otherwise, create a new tab in the workspace window with the saved URL, immediately persist ownership for the returned tab ID, and broadcast inventory.

Never reuse a drifted owned instance. Never reuse a tab owned by another project or saved record. If tab creation succeeds but writing session ownership fails, leave the new tab open, report that it opened but could not be marked owned, and reconcile it; never close it as rollback.

If two Open requests race, serialize live operations per workspace window so they cannot both conclude that no instance exists and create duplicates accidentally.

### Open another copy

Resolve the latest saved record, create a new tab in the acting workspace window, write explicit ownership, and broadcast inventory without searching for an existing instance. Shift-clicking **Open** may route to this operation, but a labelled overflow action is required.

No Phase 2 path calls `chrome.tabs.remove()`.

### Instance counts

Derive each accordion's count from the current window inventory by exact ownership identity (`projectId` plus `savedUrlId`), including drifted instances. Do not persist counts. Display zero unobtrusively or omit it; display positive counts with an accessible label such as `2 open instances`.

### Automatic-title refresh

After an owned tab reaches a successful completed load and Chrome provides a non-empty title:

- verify ownership still references an existing saved record
- refresh only when `titleSource === 'automatic'`
- trim and validate the Chrome title with the existing title rules
- do not update when the title is empty, unchanged, or invalid
- submit the change through the background-owned durable command queue using a dedicated command that preserves `titleSource: 'automatic'`

Do not use the existing user-edit title path because it marks titles custom. Add a product command such as `REFRESH_AUTOMATIC_TITLE` that checks provenance again inside the queued mutation. Custom titles are never overwritten.

A title-refresh storage failure does not undo ownership or tab opening. Surface a non-destructive warning identifying the saved URL.

## Project deletion and other durable mutations

### Project deletion

Extend project deletion as one background-coordinated operation rather than issuing a durable delete and ownership cleanup independently from the UI.

Before confirmation, compute the latest counts for the acting window:

- saved URL count from durable state
- live tabs owned by the project in that workspace window

The dialog states that saved URLs will be deleted and that the owned live tabs will remain open and become Unassigned. Other windows may also contain owned instances; if known globally, report the total affected live-tab count or use wording that does not imply the current-window count is global.

On confirmation:

1. Execute the existing queued `DELETE_PROJECT` durable mutation.
2. After durable commit succeeds, remove every session ownership entry referencing that project across all windows.
3. Broadcast the committed durable state and refresh affected inventories.

This ordering guarantees no live tab is closed. If ownership cleanup fails after durable deletion, the next reconciliation discards dangling entries because the project no longer exists. Report the cleanup problem without claiming the project deletion failed.

### Saved-record changes

When a saved URL is deleted or its URL changes, discard ownership entries that reference the missing record or whose `establishedUrl` no longer equals the record URL, then reconcile affected tabs. This follows the ownership invariant and prevents silent retargeting.

Copying, renaming, reordering, changing tags/notes/title, and selecting a project do not transfer live ownership.

## Workspace interface

Replace the Phase 1 placeholder in the existing right pane; preserve its dimensions and the main-canvas priority.

The pane needs explicit states:

- initial inventory loading
- grouped live inventory
- no ordinary tabs
- stale inventory with retryable query error
- missing/denied API access
- reconciliation summary

Saved URL accordions gain:

- a visible **Open** button
- positive owned-instance count
- **Open another copy** in the existing saved-URL overflow menu
- operation-specific pending and error feedback

Do not disable the whole project canvas while a tab operation runs. Prevent duplicate submission only for the affected action. A failed focus/create operation identifies the saved URL and leaves a retryable action or persistent dismissible message.

Use semantic buttons and lists. Row activation and Assign to must work with keyboard. Assignment menus/dialogs restore focus to their trigger when canceled. After successful assignment, focus may stay on the same tab row as it moves into a project group; announce the new owner with an `aria-live` region.

Do not add Activate, Open all, Close all, filing, Clear all, drag-and-drop, automatic domain tags, pinning, statuses, or search.

## Errors and race handling

Define typed live-operation errors separate from durable storage corruption, including at least:

- inventory unavailable
- workspace/window no longer available
- tab disappeared
- tab moved to another window
- unsupported URL
- ownership candidate became stale
- project or saved record disappeared
- focus failed
- create failed
- ownership persistence failed

Rules:

- Inventory errors are pane-scoped and retryable.
- Durable storage corruption retains the Phase 1 blocking workspace behavior.
- A disappearing tab is normal browser concurrency, not corruption.
- Before every mutating ownership or opening action, validate current tab and durable state again.
- Successful Chrome side effects are not rolled back destructively when a later session write fails.
- Refresh after errors that may have made the UI stale.
- Log Chrome API failures with operation, window ID, tab ID when available, project ID, and saved-record ID; do not log notes or other private metadata.

## Test strategy

### Pure domain tests

Cover:

- supported/unsupported URL classification and safe summaries
- excluding every exact Protab workspace URL
- candidate derivation using complete serialized URL identity
- valid explicit ownership taking precedence over URL matching
- navigation retaining ownership provenance, setting drift, and grouping the drifted row under Unassigned
- invalid ownership references becoming unassigned
- unique-match reconciliation and ambiguous/no-match behavior
- identical tab instances retaining independent owners
- project-order grouping and tab-index ordering
- Open candidate selection, including `lastAccessed` and deterministic fallback
- drifted and other-project instances being ineligible for Open reuse
- owned-instance counts

### Ownership repository and coordinator tests

Use an in-memory session adapter for most tests and a focused `chrome.storage.session` mock for its contract. Cover:

- session ownership surviving a simulated service-worker reconstruction
- browser-session empty state invoking reconciliation
- invalid session values being discarded without touching durable state
- serialized concurrent ownership writes
- removal, movement, replacement, and dangling-reference cleanup
- event bursts coalescing to one current-window refresh
- two workspace clients receiving only their bound window snapshots
- disconnect cleanup
- reconciliation summary emitted once per browser session/window and containing actual counts

### Background operation tests

With a narrow Chrome tabs/windows test double, cover:

- current-window query and exclusion of all workspace tabs
- another window never appearing in inventory or receiving actions
- row focus focusing the window and activating the tab
- assignment revalidation and metadata non-mutation
- Open precedence: eligible owned instance, unambiguous unassigned instance, new tab
- most-recently-used selection from `lastAccessed`
- Open never stealing another project's instance
- drifted ownership causing creation/reuse of a current exact match
- concurrent Open requests creating at most one normal instance
- Open another copy always creating
- create/focus/query failures and disappearing tabs
- ownership-write failure after create leaving the tab open
- automatic-title refresh only for automatic titles
- project deletion committing durable deletion, retaining tabs, and clearing ownership
- explicit assertion that no Phase 2 operation calls `tabs.remove`

### Workspace tests

Cover:

- inventory loading, empty, grouped, unsupported, ambiguous, stale/error, and retry states
- live updates without remounting the workspace
- project and Unassigned group order/count/collapse semantics, including drifted rows under Unassigned
- active, owned, drifted, ambiguous, and unsupported labels not relying on color
- keyboard row activation and assignment
- focus restoration and announcements
- accordion Open, Open another copy, instance count, pending, and retry feedback
- project deletion wording with saved and live counts
- reconciliation summary display and dismissal
- absence of all deferred controls named in `what.md`

### Manual Chrome tests

Complete the checklist in `what.md` against the production build. Include:

- two-window isolation
- service-worker suspension and wake
- full Chrome restart reconciliation
- duplicate URL ambiguity
- navigation drift
- unsupported Chrome/extension pages
- keyboard-only operation
- service-worker/workspace console review
- Network review distinguishing browser favicon loads from requests initiated by Protab code

Record the Chrome version and any deviations in the implementation thread or pull request.

## Atomic commit sequence

Keep each commit buildable and all existing checks green. Tests belong in the same commit as the behavior they verify.

1. `feat: add current-window tab inventory`
2. `feat: add persistent runtime tab ownership and grouping`
3. `feat: assign matching unassigned tabs to projects`
4. `feat: open and focus saved URL instances`
5. `feat: open additional owned URL copies`
6. `feat: reconcile ownership and detect navigation drift`
7. `feat: preserve live tabs when deleting projects`
8. `docs: add Phase 2 loading and test instructions`

Commit 1 replaces only the honest Current Tabs placeholder. Later commits progressively add ownership and actions; do not land fake data or nonfunctional controls early.

## Completion evidence

Before declaring Phase 2 complete, provide:

- commit list matching the sequence above or an explanation for any merge/split
- output of `npm test`, `npm run lint`, and `npm run build`
- production build location and unpacked-loading steps
- manual checklist results with Chrome version
- evidence of service-worker suspension/wake ownership behavior
- evidence that restart reconciliation is non-destructive and ambiguity remains unassigned
- two-window inventory screenshots and an updated 1280 × 1024 workspace screenshot
- console and Network review results
- explicit confirmation that no Phase 2 path closes a tab
- deviations, unresolved risks, and interfaces that Phase 3 must preserve
