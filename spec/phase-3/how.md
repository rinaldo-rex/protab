# Phase 3 — How to build it

This document fixes the implementation boundaries for deliberate tab filing on top of the completed Phase 2 code. Phase 3 uses the approved V0 close policy: persist first, obtain explicit Protab confirmation, then request programmatic closure and report only outcomes Protab can actually observe.

Local names and component decomposition may vary when tests, ordering, safety, and product behavior remain equivalent.

## Technology and completed Phase 2 baseline

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

Extend the actual Phase 2 seams rather than replacing them:

- `src/background/index.ts` remains the service-worker composition root and registers Chrome listeners once.
- `src/background/tabs/coordinator.ts` owns validated workspace subscriptions, current-window operations, inventory refreshes, and per-window serialization.
- `src/background/tabs/chromeTabs.ts` is the narrow Chrome tabs/windows adapter.
- `src/background/tabs/ownershipStore.ts` remains the validated `chrome.storage.session` repository.
- `src/domain/liveTabs.ts` and `src/domain/ownership.ts` remain the pure live-tab classification, reconciliation, grouping, and instance-count boundaries.
- `CommandQueue` remains the only serializer for durable project mutations.
- `PersistedStateV1` remains the durable project schema.
- `src/background/messages.ts`, `src/workspace/useLiveTabs.ts`, and `CurrentTabsPane.tsx` remain the product-level live protocol and UI channel.
- Existing dialogs, action menus, focus restoration, keyboard patterns, and CSS tokens remain the workspace baseline.

Phase 2 currently represents a navigated tab in two ways intentionally:

- its session ownership retains `projectId`, `savedUrlId`, and `establishedUrl` as provenance
- its `drifted` view appears under **Unassigned** with **Navigated from saved URL**

Phase 3 filing eligibility follows the visible grouping contract: a drifted row requires a fresh filing decision and may be filed, but it must never be silently treated as the old saved URL.

Do not let React call Chrome APIs, write storage, decide eligibility from stale props, or synthesize successful results. The background revalidates every operation.

## Approved close policy

V0 uses **programmatic close** because automatic decluttering is the core save–close–reopen loop.

For every extension-initiated close in Phase 3:

1. Show explicit Protab confirmation before the operation begins.
2. Persist or reuse the target saved record first.
3. Re-read the live tab and compare its current serialized URL with the URL that was persisted.
4. If stable, establish ownership for any still-live tab.
5. Issue `chrome.tabs.remove(tabId)` without making the durable commit depend on the removal promise settling.
6. Independently observe inventory/removal events and classify the result as closed, pending/surviving, skipped, or failed.

The UI may say that Protab will save and request closure. It must not say that Protab:

- knows whether a page has unsaved changes
- guarantees Chrome will show a native warning
- receives a direct result when the user chooses **Stay**
- can atomically compare a URL and close the tab

A website may trigger Chrome's native `beforeunload` flow when Chrome considers it eligible. If a tab remains, Protab reports that the durable record was saved and the tab still needs attention.

### Post-V0 configurability note

Programmatic close is fixed for V0; do not add a Settings route, close-preference field, or alternate handoff branch in Phase 3. A post-V0 setting may default to automatic close and offer a user-close handoff. Whether that future preference applies to all close workflows or filing only is intentionally undecided and must be resolved before that settings feature is specified.

## Extension boundary and permissions

Keep manifest permissions exactly:

```json
["storage", "tabs"]
```

The existing `tabs` permission supplies query, URL/title, focus, lifecycle, and `chrome.tabs.remove()` access. Phase 3 does not need host permissions, content scripts, scripting, history, bookmarks, sessions permission, web navigation, downloads, or notifications.

Extend `ChromeTabsApi` with a narrow close request, for example:

```ts
interface ChromeTabsApi {
  // existing Phase 2 methods
  remove(tabId: number): Promise<void>
}
```

Keep the adapter promise available for immediate API rejection diagnostics, but do not make the operation wait indefinitely for it. The coordinator's fresh queries and `tabs.onRemoved` events remain the source of truth for whether a tab disappeared.

The background owns:

- live filing eligibility and revalidation
- title/hostname capture and tag suggestion inputs
- durable create-or-reuse mutation
- ownership establishment
- final URL check
- close request dispatch
- close observation and attention state
- bulk sequencing and result aggregation

A workspace never sends `windowId`, URL, title, tags, or eligibility as trusted authority. It sends the bound-port action plus tab/project identities and any confirmation token or operation ID required by the protocol.

## Suggested source boundaries

Extend the current structure approximately as follows:

```text
src/
├── background/
│   ├── index.ts
│   ├── messages.ts
│   └── tabs/
│       ├── chromeTabs.ts          existing adapter plus remove
│       ├── coordinator.ts         subscriptions and operation routing
│       ├── ownershipStore.ts      existing session ownership
│       ├── filing.ts              single/bulk orchestration
│       └── closeTracker.ts        non-blocking close observation/attention
├── domain/
│   ├── commands.ts                create-or-reuse filing command
│   ├── applyCommand.ts
│   ├── liveTabs.ts
│   ├── ownership.ts
│   ├── filing.ts                  eligibility, batch planning, result types
│   └── tagSuggestions.ts          pure hostname mapping
├── storage/
│   └── commandQueue.ts            existing durable serializer
├── workspace/
│   ├── CurrentTabsPane.tsx
│   ├── LiveTabFileActions.tsx
│   ├── FileTabsDialog.tsx
│   ├── FilingSummary.tsx
│   ├── AttentionBanner.tsx
│   └── useLiveTabs.ts
└── styles/global.css
```

Exact filenames may differ. Keep eligibility, deduplication plans, hostname mapping, summaries, and close-state transitions pure where possible. Keep Chrome side effects in the background.

## Durable filing command

### Keep the durable schema at V1

Filing creates or reuses an existing `SavedUrl`; it does not introduce a durable preference, history entry, status, or filing log. Keep:

```ts
interface PersistedStateV1 {
  schemaVersion: 1
  projects: Project[]
}
```

Do not create a V2 migration for ephemeral filing drafts, operation summaries, attention markers, or close state.

### Add one atomic create-or-reuse command

Do not implement filing by separately reading for a duplicate and then issuing the existing `CREATE_SAVED_URL`: another workspace could mutate the project between those operations. Add a queued product command such as:

```ts
type Command =
  | ExistingCommand
  | {
      type: 'FILE_LIVE_TAB'
      projectId: string
      url: string
      capturedTitle?: string
      suggestedTags: string[]
    }
```

Its queued mutation must:

1. Resolve the latest project.
2. Serialize and validate the HTTP(S) URL using the existing complete URL identity rules.
3. Return the existing same-project record unchanged when its URL matches.
4. Otherwise create one record with:
   - the serialized URL
   - the trimmed valid Chrome title as an automatic title
   - hostname fallback when the title is empty or invalid
   - normalized suggested tags
   - empty notes
5. Return enough metadata to identify `projectId`, `savedUrlId`, whether a record was created or reused, and whether durable state was written.

A conceptual result extension is:

```ts
interface CommandResultMeta {
  // existing fields
  affectedProjectId?: string
  affectedSavedUrlId?: string
  existingSavedUrlId?: string
  didWrite: boolean
  filing?: 'created' | 'reused'
}
```

The existing record's title, `titleSource`, tags, notes, and ordering are never overwritten on reuse. The queued command is the authoritative deduplication boundary for both single and bulk filing.

Broadcast committed durable state through the existing state-committed mechanism after a new record is written. A reuse may still need a filing-operation result even when no durable broadcast is necessary.

## Filing eligibility and identity

Define a pure eligibility function over the latest reconciled `LiveTabView`:

A tab is fileable only when it:

- belongs to the acting workspace's current window
- is an ordinary non-workspace tab
- has a current supported HTTP(S) URL without credentials
- appears under **Unassigned**, including a drifted-provenance row
- still exists immediately before persistence

Exclude:

- exact Protab workspace URLs
- unsupported or unavailable URLs
- exact, non-drifted tabs currently grouped under a project
- tabs in another window
- tabs that disappeared before validation

For a drifted row, use its current URL/title as the new filing input. Never use `establishedUrl` as the URL being filed. If filing succeeds against a stable current URL, replace that tab's ownership entry with the new target record identity; do not retain two owners.

The UI may calculate an advisory eligible count for display. The background recomputes the authoritative set when confirmation is requested and again when execution begins.

## Initial hostname tag suggestions

Implement the table from `what.md` as a pure function of parsed hostname:

```ts
suggestTags(hostname: string): string[]
```

Rules:

- lowercase the hostname for matching
- match either `hostname === base` or `hostname.endsWith('.' + base)`
- never use raw string suffix matching
- return each normalized tag at most once
- return no tags for unknown or invalid hostnames
- never infer project ownership
- never inspect page content or issue network requests

Mappings:

- YouTube / youtu.be → `video`
- GitHub / GitLab / Bitbucket → `code`
- Medium / Substack → `article`
- listed social domains → `social`

Suggestions become ordinary record tags only for a newly created record. Reuse preserves all existing tags exactly. Once created, the existing `TagEditor` provides normal removal/edit behavior.

## Single-tab filing operation

Add product-level live requests rather than exposing storage or Chrome primitives, for example:

```ts
{ kind: 'PREPARE_FILE_LIVE_TAB'; tabId: number; projectId: string }
{ kind: 'CONFIRM_FILE_LIVE_TAB'; operationId: string }
{ kind: 'CANCEL_FILE_OPERATION'; operationId: string }
{ kind: 'RETRY_FILE_OPERATION'; operationId: string }
```

The prepare step supports honest confirmation. The background:

1. Revalidates the workspace client and current sender window.
2. Reads the latest durable state.
3. Queries/reconciles the current inventory.
4. Verifies tab and project eligibility.
5. Returns a short-lived prepared operation containing authoritative tab/project labels and captured URL for confirmation.

Do not persist a prepared draft. Invalidate it when the client disconnects, the project disappears, or the tab leaves the window. Always revalidate on confirm.

### Confirmed execution order

Serialize execution through the existing per-window `operationTails` boundary. For one confirmed tab:

1. Re-read the latest project and tab.
2. Verify the tab is still in the acting window and fileable.
3. Capture and serialize its current URL as `persistedUrl`.
4. Capture a usable title and derive suggested tags.
5. Execute `FILE_LIVE_TAB` through `CommandQueue`.
6. If persistence fails, stop. Do not write ownership and do not call `tabs.remove()`.
7. Resolve the committed/reused `savedUrlId` from command metadata.
8. Re-read the tab with `tabs.get()` or a fresh window query.
9. If the tab disappeared, report the durable save plus an already-closed result; do not treat it as storage failure.
10. Serialize the reported current URL and compare it with `persistedUrl`.
11. If it changed, keep the durable record, clear/retain no stale target ownership, report **URL changed — not closed**, and require a fresh filing decision.
12. If stable, replace any prior ownership entry for the tab with `{ tabId, windowId, projectId, savedUrlId, establishedUrl: persistedUrl }`.
13. Register close tracking, then issue the non-blocking programmatic close request.
14. Broadcast committed state, refreshed inventory, and operation progress/result.

Ownership must be established before requesting closure so a surviving tab has exact target provenance. If ownership persistence fails after the durable record was saved, do not close the tab; report that it was saved but ownership could not be established.

### Duplicate filing

If the target project already contains `persistedUrl`:

- reuse its record ID
- preserve all metadata and ordering
- still establish ownership after the stable URL recheck
- still apply the confirmed close policy
- report the item as deduplicated/reused rather than newly saved

## Non-blocking programmatic close tracking

### Why the close promise is not the operation lifecycle

`chrome.tabs.remove()` may reject immediately, resolve after removal, or remain pending while native page UI is unresolved. Therefore:

- do not `await` it as the only completion signal
- do not block the per-window operation queue indefinitely
- do not roll back saved data or ownership
- do not infer unsaved state from a pending promise

A close tracker should record operation state before dispatch and settle from independent evidence.

A conceptual session model is:

```ts
interface CloseAttempt {
  operationId: string
  tabId: number
  windowId: number
  projectId: string
  savedUrlId: string
  persistedUrl: string
  requestedAt: number
  state: 'requested' | 'surviving' | 'failed'
  error?: string
}
```

Use a separate validated `chrome.storage.session` key if attention must survive service-worker suspension. Do not add it to `PersistedStateV1`. Restrict access to trusted contexts and serialize updates like ownership.

### Observable outcomes

- **Closed:** `tabs.onRemoved`, `tabs.get()` not found, or a fresh inventory proves the tab is absent.
- **Failed:** the remove request rejects while the tab still exists; preserve ownership and expose retry/focus.
- **Pending/surviving:** after a bounded observation interval or fresh query, the tab still exists and no definitive failure is known.
- **Already closed:** it disappears after durable persistence but before the remove request.
- **Skipped:** immediate URL recheck differs, tab moved, became unsupported, project vanished, or ownership could not be established.

Do not use an unbounded timer as proof of failure. A surviving marker is attention state, not a claim that Chrome canceled closure. Resolve the marker when `onRemoved` fires, a later query proves absence, or an explicit retry succeeds.

When a filed tab remains live, reconciliation keeps its ownership identity. If it later navigates, Phase 2's drift rule displays it under **Unassigned** with provenance.

## File all unassigned tabs

Add a selected-project action whose visible count is derived from current inventory but whose authoritative preview comes from the background.

Suggested protocol:

```ts
{ kind: 'PREPARE_FILE_ALL_UNASSIGNED'; projectId: string }
{ kind: 'CONFIRM_FILE_ALL_UNASSIGNED'; operationId: string }
```

The confirmation names the project and latest eligible count. On confirm:

1. Serialize the bulk operation with other operations in that window.
2. Query and reconcile a fresh inventory.
3. Snapshot eligible tab IDs in Chrome tab-strip order.
4. Process each independently through the same persist/recheck/own/close primitive as single filing.
5. Before each item, revalidate tab, window, ownership/grouping, URL, and project.
6. Continue after item-local storage, ownership, URL-change, disappearance, or close-request failure where the shared durable queue remains usable.
7. Stop and surface a blocking durable error if project storage enters its Phase 1 corruption state.
8. Refresh inventory and emit a final aggregate summary.

Deduplication occurs through the queued `FILE_LIVE_TAB` command, so duplicate URLs within the batch naturally reuse the first committed record. Do not overwrite the first record's captured metadata with later duplicates.

A result model should distinguish actual outcomes:

```ts
interface FilingSummary {
  eligible: number
  created: number
  reused: number
  alreadyClosed: number
  closeRequested: number
  surviving: number
  skipped: Array<{ tabId?: number; reason: FilingSkipReason }>
  failed: Array<{ tabId?: number; stage: 'persist' | 'ownership' | 'close'; message: string }>
}
```

Do not double-count one item as both created and reused. Saving and close state are independent dimensions; the UI should be able to say, for example, “5 URLs saved or reused; 3 tabs closed; 2 remain open.”

Never target a non-drifted project-owned tab, unsupported tab, workspace tab, or tab outside the bound window—even if the UI's earlier preview included it before state changed.

## Attention state and retries

Attention represents real operation state only:

- remove API rejection
- independently observed surviving/pending tab
- URL changed before close
- ownership write failed after durable save
- per-item bulk failure

It never represents guessed unsaved changes.

Provide a dismissible workspace banner with aggregate counts and a per-item list or dialog. Selecting an item calls the existing validated `FOCUS_LIVE_TAB`. Dismissing the banner hides the aggregate presentation but does not delete unresolved row markers or close-tracker state.

Retry must be stage-aware:

- A persist failure repeats the full current-tab validation and durable command.
- A URL-change skip starts a fresh filing decision; it never retries closure against the old URL.
- A close failure/surviving item revalidates current URL against `persistedUrl` before another close request.
- A disappeared tab resolves attention without error.

Retries remain bound to the original workspace window and project/record identities. Never retry against an arbitrary `windowId` from UI state.

## Drag and keyboard interface

### Shared action path

Drag filing and **File to project…** must both end at the same prepare/confirmation/background operation. Dragging must not mutate persistent state directly.

### Drag behavior

- Make unassigned, supported live rows draggable with semantic fallback controls still visible.
- Use a minimal internal payload such as the live `tabId`; never trust dragged URL/title/project data.
- Enable project sidebar rows and the selected-project canvas as drop targets.
- Show visible idle, drag-over, invalid, and processing states without relying on color alone.
- Do not make unsupported or non-drifted owned rows draggable for filing.
- Prevent dropping onto a deleted/stale project by background revalidation.

HTML drag-and-drop is pointer-oriented and does not replace keyboard support.

### Keyboard equivalent

Each eligible row exposes **File to project…**. Its menu/dialog:

- lists projects in durable order
- identifies the chosen tab and target
- opens the same explicit save-and-close confirmation
- restores focus to the row action when canceled
- moves focus to a sensible successor or summary after the tab closes
- preserves target selection and offers Retry after persistence failure where the row still exists

Announce created/reused, close requested, surviving, skipped, and failed outcomes through a restrained `aria-live` region.

### Bulk interface

The selected project exposes **File all unassigned tabs (N)** only when `N > 0`, or keeps it disabled with an explanatory accessible label when zero. Confirmation uses the background-prepared count. Disable only the affected operation while it runs; do not freeze unrelated project editing or live-row focusing.

Do not add Activate, Open all, Close all, settings, generic notifications, task statuses, pinning, search, archive, or export.

## Errors and race handling

Define typed filing errors separately from durable corruption and Phase 2 inventory errors, including at least:

- workspace/window no longer available
- tab disappeared
- tab moved to another window
- tab is no longer unassigned/fileable
- unsupported or unavailable URL
- project disappeared
- persistence failed
- URL changed before close
- ownership persistence failed
- close request failed
- close still unresolved/surviving
- prepared operation expired or became stale

Rules:

- Validate current tab, window, project, grouping, and URL before persistence.
- Persist before every ownership or close side effect.
- Validate URL again immediately before ownership/close.
- Never delete a successfully saved record as rollback for a later failure.
- Never close after persistence failure or ownership failure.
- A disappearing tab is ordinary browser concurrency, not storage corruption.
- A bulk item failure must not erase successful sibling results.
- Refresh inventory after every result that may change grouping or tab existence.
- Log operation type, operation ID, window ID, tab ID, project ID, saved-record ID, and safe stage; do not log notes or private metadata.
- Startup, reconciliation, extension reload, and service-worker wake never resume or initiate close requests automatically. They may restore attention for a previously requested close, but require explicit Retry for another request.

## Test strategy

### Pure domain tests

Cover:

- fileable eligibility for ordinary unassigned, drifted-unassigned, owned, unsupported, missing-URL, and other-window tabs
- exact URL serialization and target-project deduplication
- create-or-reuse preserving existing metadata and ordering
- valid Chrome title capture and hostname fallback
- exact/subdomain tag mapping for every table entry
- deceptive suffixes such as `notyoutube.com`
- unknown hosts and duplicate suggestions
- bulk tab-strip ordering and eligibility snapshots
- aggregate summary counts with independent persistence/close dimensions
- close-state transitions without inferred unsaved state

### Durable command and queue tests

Cover:

- `FILE_LIVE_TAB` creates one automatic-title record
- existing URL returns its ID with `didWrite: false`
- existing custom/automatic title, tags, notes, and order remain unchanged
- two concurrent workspaces filing the same URL produce one record
- storage rejection exposes no successful command result
- suggestions are normalized only for new records
- no durable schema change or invented migration

### Close tracker tests

Use an in-memory session adapter plus a focused `chrome.storage.session` mock. Cover:

- registration before dispatch
- `onRemoved` resolving an attempt
- remove rejection while the tab survives
- pending/surviving classification after bounded observation
- service-worker reconstruction restoring attention but issuing no close
- tab disappearance resolving stale attention
- URL mismatch preventing Retry close
- serialized tracker writes and invalid-value recovery

### Background operation tests

With the existing narrow Chrome test double, cover:

- sender-window authority and cross-window rejection
- exact order: durable commit → final URL read → ownership write → remove request
- persistence failure causing zero ownership writes and zero remove calls
- final URL change saving the record but skipping ownership/close
- drifted row filing its current URL, not `establishedUrl`
- duplicate reuse preserving metadata while still requesting close
- ownership failure preserving record and live tab
- tab disappearance before persistence, after persistence, and before close
- close request rejection preserving record/ownership and creating attention
- unresolved close not blocking another per-window filing indefinitely
- single and bulk operations sharing one item primitive
- bulk excluding owned, unsupported, workspace, disappeared, and other-window tabs
- within-batch deduplication and partial continuation
- operation confirmation expiration/revalidation
- explicit assertion that the only Phase 3 `tabs.remove` calls are inside the confirmed close workflow
- startup/reconciliation never calling remove

### Workspace tests

Cover:

- drag eligibility and project/canvas target states
- drag and keyboard controls routing to the same prepare operation
- confirmation copy naming tab/project and accurately saying save plus close request
- no claim about detecting unsaved changes or guaranteed native warnings
- File to project project ordering, cancellation, and focus restoration
- bulk eligible count, authoritative confirmation, pending state, and summary
- created, reused, skipped URL-change, surviving, and failed labels
- attention banner dismissal versus persistent row-level state
- focus affected tab and stage-aware Retry
- `aria-live` announcements and successor focus after a closed row
- editable/removable suggested tags through the existing editor
- absence of Settings and all other deferred controls

### Manual Chrome tests

Complete `what.md` against the production build, including:

- pointer drag filing
- keyboard-only filing
- same-project duplicate metadata preservation
- forced storage failure
- mixed bulk eligibility and partial outcomes
- every tag mapping, deceptive suffix, and unknown host
- navigation during filing
- page with unsaved form state
- Chrome native warning **Leave** and **Stay** paths where the page is eligible
- service-worker suspension while a close remains unresolved
- two-window isolation
- workspace and service-worker console review
- Network review confirming no Protab fetches

Record Chrome version, OS, exact wording observed, and whether native warning behavior differed by page.

## Atomic commit sequence

Keep every commit buildable and all existing checks green. Tests belong in the same commit as the behavior they verify.

1. `feat: add create-or-reuse filing command and tag suggestions`
2. `feat: add confirmed persist-first tab close workflow`
3. `feat: add keyboard tab filing to projects`
4. `feat: add drag-to-project tab filing`
5. `feat: add bulk filing for unassigned tabs`
6. `feat: add filing attention states and close retries`
7. `docs: add Phase 3 loading and test instructions`

Commit 1 introduces no UI or tab side effects. Commit 2 establishes the one safe shared operation primitive before either entry point uses it. Commits 3 and 4 must route to that primitive rather than duplicate orchestration. Bulk filing composes the same primitive. Attention and documentation land only after real operation states exist.

If implementation proves that close tracking must land with commit 2 to keep it honest and testable, include the minimum tracker there and reserve commit 6 for complete banner, row markers, and Retry UX; explain the split in completion evidence.

## Completion evidence

Before declaring Phase 3 complete, provide:

- commit list matching the sequence above or an explanation for any split/merge
- output of `npm test`, `npm run lint`, and `npm run build`
- production build location and unpacked-loading steps
- manual checklist results with Chrome version and OS
- evidence of persist-before-close ordering
- evidence that storage and ownership failures call no remove operation
- evidence that URL-change recheck skips closure
- duplicate metadata-preservation evidence
- mixed bulk summary evidence
- native unsaved-form behavior with honest copy and surviving-tab handling
- service-worker suspension evidence for attention without automatic close replay
- two-window isolation evidence
- console and Network review results
- exact manifest permissions
- deviations, unresolved risks, and interfaces Phase 4 must preserve
