# Phase 4D — How to build it

This document fixes the implementation boundaries for safe updates, protected tabs, and the quickstart guide on top of the completed Phase 4B code. Phase 4D preserves Protab's local-first, persist-first, close-honest design while adding automatic durable-state migration and explicit live-tab close protection.

Local names and component decomposition may vary when tests, ordering, safety, and product behavior remain equivalent.

## Technology and completed Phase 4B baseline

Retain the existing stack and command contract:

- TypeScript in strict mode
- React and Vite
- Manifest V3 background service worker, browser popup, and full-page `workspace.html`
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

Extend the actual Phase 4B seams rather than replacing them:

- `src/background/index.ts` remains the service-worker composition root and registers Chrome listeners once.
- `src/background/tabs/coordinator.ts` owns validated workspace subscriptions, current-window operations, inventory refreshes, and per-window serialization.
- `src/background/tabs/chromeTabs.ts` is the narrow Chrome tabs/windows adapter.
- `src/background/tabs/ownershipStore.ts` remains the validated `chrome.storage.session` repository for runtime ownership.
- `src/background/tabs/activeProjectStore.ts` remains the session active-project repository.
- `src/background/tabs/filing.ts` owns single/bulk filing orchestration and the shared close primitive.
- `src/background/tabs/closeTracker.ts` owns non-blocking close observation and attention state.
- `CommandQueue` remains the only serializer for durable project mutations.
- `src/storage/repository.ts` and `src/storage/schema.ts` remain the durable state loading and parsing boundaries.
- `src/domain/migration.ts` remains the pure durable schema migration boundary.
- `src/domain/settings.ts`, `src/workspace/useSettings.ts`, and `SettingsPanel.tsx` remain the settings channel.
- `src/background/messages.ts`, `src/workspace/useLiveTabs.ts`, and `CurrentTabsPane.tsx` remain the product-level live protocol and UI channel.

Do not let React call Chrome tabs APIs, mutate durable project state directly, decide close eligibility from stale props, or synthesize successful close results. The background revalidates every operation immediately before side effects.

---

## Feature 1: Safe automatic migration

### Durable schema pipeline

Keep every durable schema version represented by an explicit TypeScript type. The current code already has:

```ts
PersistedStateV1 -> PersistedStateV2
```

Future changes must extend that chain rather than rewriting old migrations in place:

```ts
function migrateV1ToV2(state: PersistedStateV1): PersistedStateV2
function migrateV2ToV3(state: PersistedStateV2): PersistedStateV3
function migrateV3ToV4(state: PersistedStateV3): PersistedStateV4
```

Each migration must be pure: no Chrome APIs, no storage writes, no tab operations, no Date reads unless a timestamp is explicitly part of the migration contract and injectable for tests.

### Parse result metadata

Change durable parsing so callers can tell whether migration happened. Instead of returning only `PersistedState`, return a small result object:

```ts
interface ParsePersistedStateResult {
  state: PersistedState
  migrated: boolean
  originalSchemaVersion: number
  currentSchemaVersion: number
}
```

`parsePersistedState(raw)` may either become `parsePersistedStateWithMetadata(raw)` or keep the existing name and update its callers. Preserve a convenience helper if many tests expect the old return shape.

Rules:

- current schema returns `migrated: false`
- older supported schema returns `migrated: true`
- invalid data throws `StorageDataError(kind: 'invalid')`
- future version throws `StorageDataError(kind: 'unsupported-version')`
- missing `schemaVersion` throws invalid rather than guessing

### Write-through migration

`loadState(storage)` currently reads raw state and returns the parsed/migrated result. Phase 4D changes it to write migrated state back once migration succeeds.

Suggested repository flow:

```ts
export const STORAGE_KEY = 'protab.state'
export const MIGRATION_BACKUP_KEY = 'protab.state.migrationBackup.latest'

export interface MigrationBackup {
  schemaVersion: 1
  createdAt: number
  fromSchemaVersion: number
  toSchemaVersion: number
  rawState: unknown
}
```

Extend `StorageAdapter` narrowly:

```ts
interface StorageAdapter {
  get(): Promise<unknown | undefined>
  set(state: PersistedState): Promise<void>
  getMigrationBackup?(): Promise<unknown | undefined>
  setMigrationBackup?(backup: MigrationBackup): Promise<void>
}
```

For the Chrome adapter, `setMigrationBackup` writes to `chrome.storage.local` under `MIGRATION_BACKUP_KEY`.

`loadState` should:

1. read raw state
2. return `emptyState()` when raw is absent
3. parse/migrate with metadata
4. if not migrated, return state
5. create a backup object containing the original raw state
6. write the backup
7. write the migrated current state to `STORAGE_KEY`
8. return the migrated state plus enough metadata for UI notification

If the backup write fails, do not replace `protab.state`; surface a storage error. A migration without a backup violates the Phase 4D recovery contract.

If the migrated-state write fails after backup succeeds, leave the original state as-is and surface an error. The presence of the backup is acceptable, but the app must not pretend migration completed.

### Loading result for UI notice

The workspace needs to know when migration succeeded so it can show a brief banner/toast. Avoid coupling UI to raw storage details by adding one of these seams:

```ts
interface LoadedState {
  state: PersistedState
  migration?: {
    fromSchemaVersion: number
    toSchemaVersion: number
    backupAvailable: boolean
  }
}
```

or a one-time background/state response flag:

```ts
{ ok: true; state, meta: { migrationCompleted: true } }
```

The notice should be one-time per page load after migration. It does not need durable dismissal state.

### Backup export and restore

Add settings-facing storage helpers:

```ts
readMigrationBackup(): Promise<MigrationBackup | undefined>
exportMigrationBackup(): Promise<Blob | string>
restoreMigrationBackup(): Promise<PersistedState>
```

Restore flow:

1. User clicks **Restore migration backup** in Settings.
2. UI opens an explicit confirmation dialog naming the backup timestamp and schema range.
3. Background/storage layer reads backup raw state.
4. Parse/migrate the backup raw state through the same current pipeline.
5. Validate the final state.
6. Save the final state to `protab.state`.
7. Broadcast committed state to all workspaces.
8. Show success or failure.

Do not blindly write `rawState` back if it is an old schema. Restore means “restore this backup safely into the current app,” not “downgrade storage.”

Export flow may either download JSON from the workspace or copy JSON text, depending on existing project export utilities. It must not include live tab ownership, active project state, close attempts, or manual pin state.

### Failure states

Make storage failure states explicit enough for UI and tests:

- invalid durable state
- unsupported future durable state
- migration failed
- backup write failed
- migrated-state write failed
- backup missing
- backup invalid
- restore failed

No failure path may close a tab, clear session ownership, or delete durable state.

---

## Feature 2: Live-tab Pin / protected tabs

### Extend live tab shape

Chrome tabs can expose `pinned` and `audible`. Extend `LiveTabView` with protection-related fields:

```ts
export type ProtectionReason = 'manual-pin' | 'chrome-pinned' | 'audible'

export interface LiveTabView {
  // existing fields
  pinned?: boolean
  audible?: boolean
  protectionReasons: ProtectionReason[]
  protected: boolean
}
```

If `protected` conflicts with a reserved word concern, use `isProtected`.

`normalizeChromeTab(tab)` should copy:

```ts
pinned: Boolean(tab.pinned)
audible: Boolean(tab.audible)
```

Manual Protab pins are not known at normalization time unless injected by the background. Prefer computing protection after query plus manual-pin reconciliation, so `LiveTabView` rows contain final `protectionReasons` before reaching React.

### Manual pin session store

Manual Protab pinning is session-only live-tab state. Add a narrow validated session repository similar to `ownershipStore.ts`:

```text
src/background/tabs/protectedTabsStore.ts
```

Suggested key:

```ts
export const PROTECTED_TABS_STORAGE_KEY = 'protab.protectedTabs.v1'
```

Suggested persisted shape:

```ts
interface ProtectedTabsSessionV1 {
  schemaVersion: 1
  tabIds: number[]
}
```

Rules:

- store only tab IDs, not URLs, notes, project IDs, or titles
- restrict `chrome.storage.session` access to trusted contexts
- tolerate invalid stored data by returning an empty set
- remove tab IDs when tabs close
- clear IDs that no longer exist during inventory refresh
- never migrate this store as durable project data

Session storage is used to survive service-worker suspension. It is still not durable user project state and must not create URL-wide rules.

### Protection computation

Add a pure helper, for example:

```ts
export function computeProtectionReasons(tab: LiveTabView, manualPinnedTabIds: Set<number>): ProtectionReason[] {
  const reasons: ProtectionReason[] = []
  if (manualPinnedTabIds.has(tab.tabId)) reasons.push('manual-pin')
  if (tab.pinned) reasons.push('chrome-pinned')
  if (tab.audible) reasons.push('audible')
  return reasons
}
```

Use exact source labels:

- `manual-pin` -> `Pinned`
- `chrome-pinned` -> `Chrome pinned`
- `audible` -> `Playing audio`

A tab may have multiple reasons. UI may show all reasons or the highest-priority label plus accessible text containing all reasons. Tests should cover multiple reasons.

### Live protocol

Add workspace requests:

```ts
| { kind: 'PIN_LIVE_TAB'; tabId: number }
| { kind: 'UNPIN_LIVE_TAB'; tabId: number }
| { kind: 'TOGGLE_LIVE_TAB_PIN'; tabId: number }
```

The background must validate:

- sender is an active workspace client
- tab exists
- tab belongs to the client's window
- tab is not the Protab workspace tab

After updating the session store, refresh inventory for that window. Do not write durable project state.

### UI controls

In `CurrentTabsPane.tsx`, add a row-level pin control for ordinary live tabs.

Requirements:

- keyboard accessible button
- visible accessible name such as `Pin tab` / `Unpin tab`
- clear protected styling for manually pinned, Chrome-pinned, and audible tabs
- source-specific labels or badges
- no dependency on hover-only UI for keyboard users

Suggested copy:

- Button: **Pin** / **Unpin**
- Badge: **Pinned**
- Badge: **Chrome pinned**
- Badge: **Playing audio**
- Tooltip/help: **Pinned tabs are skipped by Protab close actions.**

Do not use this feature to change Chrome's native pinned state. Protab pinning is separate and only controls Protab close behavior.

### Protected close guard

Every path that may issue `chrome.tabs.remove()` must call a shared guard immediately before registering close tracking or dispatching remove.

Suggested helper:

```ts
interface CloseProtectionDecision {
  protected: boolean
  reasons: ProtectionReason[]
}

async function getCloseProtection(tabId: number, windowId: number): Promise<CloseProtectionDecision>
```

The guard must re-read current tab state, not rely only on old inventory props. It should combine:

- current Chrome `tab.pinned`
- current Chrome `tab.audible`
- current manual Protab pin store

If protected:

- do not call `chrome.tabs.remove()`
- preserve any durable save that already succeeded
- preserve ownership as appropriate for surviving tabs
- return a skipped/protected result with reason(s)

If the tab disappeared, use existing already-closed handling.

### Workflows that must use the guard

Apply the guard to all extension-initiated close requests:

- confirmed single-tab filing
- silent hover `A` filing
- drag-to-file close
- keyboard filing close
- bulk **File all unassigned tabs**
- quick-capture close when `popupCloseBehavior` is enabled
- project activation
- **Close all**
- archive-and-close
- close retry from attention state

Do not rely on separate implementations remembering the rule. Prefer one shared close primitive or one shared `requestProtectedAwareClose` wrapper used by every workflow.

### Summary model

Extend existing result/summary types to distinguish protected skips from other skips.

A compact model is:

```ts
interface ProtectedSkip {
  tabId: number
  title?: string
  reasons: ProtectionReason[]
}
```

Then include it in existing summaries:

```ts
skipped: Array<{ tabId?: number; reason: string; protectionReasons?: ProtectionReason[] }>
```

or add a dedicated field:

```ts
protectedSkipped: ProtectedSkip[]
```

Dedicated fields are easier for UI copy and tests. Exact shape may vary, but tests must verify protected skips are not counted as failures and do not block unprotected items.

### Retry behavior

Close retry must re-run the protection guard. A tab that becomes audible or Chrome-pinned after the original attempt must be skipped on retry.

If a manually pinned tab is unpinned, retry may proceed only after all existing close safety checks pass again, including URL drift checks.

### Archive-and-close behavior

If Phase 4A archive flow offers “archive and close,” Phase 4D must apply the same protection guard. Protected tabs should still be archived if the user chose archive, but the close request is skipped and summarized as protected.

---

## Feature 3: Quickstart guide

Create:

```text
docs/quickstart.md
```

Use the agreed positioning:

- calm and practical tone
- for power tab users
- starts from a messy mixed window
- explains active work context rather than replacing common tools
- includes low-friction capture and save–close–reopen
- mentions local/no-subscription use briefly
- includes screenshot placeholders

Do not link it from README in Phase 4D unless requested separately.

---

## Suggested source boundaries

```text
src/
├── background/
│   ├── index.ts
│   ├── messages.ts                  extend with pin/unpin requests
│   └── tabs/
│       ├── chromeTabs.ts             expose pinned/audible through existing query/get
│       ├── coordinator.ts            route pin requests and protected close summaries
│       ├── filing.ts                 use protected-aware close primitive
│       ├── closeTracker.ts           no auto-close replay; retry rechecks protection
│       ├── ownershipStore.ts         existing
│       ├── activeProjectStore.ts     existing
│       └── protectedTabsStore.ts     new session-only manual Protab pin store
├── domain/
│   ├── liveTabs.ts                   pinned/audible/protection fields
│   ├── tabProtection.ts              pure protection reason helpers
│   ├── migration.ts                  pure schema migrations
│   ├── types.ts                      versioned durable state types
│   └── settings.ts                   backup status helpers if settings owns UI calls
├── storage/
│   ├── schema.ts                     parse result metadata and migration dispatch
│   ├── repository.ts                 write-through migration and backup storage
│   └── storage.test.ts
├── workspace/
│   ├── CurrentTabsPane.tsx           pin controls and badges
│   ├── SettingsPanel.tsx             migration backup export/restore UI
│   ├── Toast.tsx                     migration success notice if reused
│   ├── useLiveTabs.ts                pin/unpin actions
│   └── useSettings.ts                backup status/restore hooks if appropriate
└── docs/
    └── quickstart.md
```

Exact filenames may differ. Keep pure protection and migration logic testable outside React and Chrome.

---

## Test strategy

### Migration tests

Cover:

- current schema parses with `migrated: false`
- V1 fixture migrates through V2 to current with `migrated: true`
- all fields are preserved across migration
- invalid old schema fails before backup/write
- future schema throws unsupported-version and writes nothing
- migration pipeline order for multiple old versions
- backup object contains original raw state and schema range
- backup write occurs before migrated-state write
- migrated-state write occurs only after successful backup and validation
- backup write failure leaves `protab.state` unchanged
- migrated-state write failure leaves `protab.state` unchanged
- no migration path calls tab close APIs or clears session stores

### Backup recovery tests

Cover:

- Settings detects backup availability
- export backup returns the backed-up raw JSON, not current state
- restore requires confirmation
- restore parses/migrates backup through the current pipeline
- invalid backup restore fails without changing current state
- successful restore broadcasts committed state
- restore failure does not close tabs or clear runtime ownership

### Protection domain tests

Cover:

- manual Protab pin produces `manual-pin`
- Chrome `pinned` produces `chrome-pinned`
- Chrome `audible` produces `audible`
- multiple reasons are preserved
- no reasons means not protected
- labels match product copy
- manual pin does not apply by URL to a new tab ID

### Protected tab store tests

Use an in-memory session adapter plus `chrome.storage.session` mock. Cover:

- empty/invalid storage returns empty set
- pin adds a tab ID
- unpin removes a tab ID
- toggle switches state
- duplicate pin is idempotent
- tab close cleanup removes tab ID
- access level is restricted to trusted contexts
- store never writes URLs, titles, notes, or project metadata

### Background close guard tests

With the existing Chrome test double, cover every workflow that can close tabs:

- single filing skips manually pinned tab after durable save/reuse
- hover `A` skips manually pinned tab
- bulk file-all skips protected tabs and processes unprotected siblings
- activation skips protected other-project tabs
- Close all skips protected owned tabs
- quick-capture close setting skips protected current tab
- archive-and-close archives but skips close for protected tab
- close retry rechecks protection and skips if now protected
- Chrome-pinned tab causes zero `tabs.remove` calls
- audible tab causes zero `tabs.remove` calls
- protection is re-read immediately before close, not only from stale inventory
- protected skip is not reported as storage failure or close failure
- protected skip preserves successful durable save and ownership where applicable

### Workspace tests

Cover:

- pin/unpin button exists with accessible labels
- keyboard-only pin and unpin work
- protected rows show shared protected styling
- badges distinguish `Pinned`, `Chrome pinned`, and `Playing audio`
- multiple protection reasons are announced accessibly
- summaries show protected skips with reasons
- unprotected tabs continue in mixed bulk operations
- migration success banner/toast appears after migrated load
- Settings shows backup export/restore only when backup exists
- restore confirmation copy is explicit about replacing current project data
- no UI copy claims unsaved-change detection or guaranteed video-call detection

### Quickstart docs review

Cover by manual review:

- `docs/quickstart.md` exists
- explains first cleanup of a messy window
- explains quick-capture syntax
- explains selection vs activation
- explains saved URLs vs live tabs
- mentions local/no-subscription use briefly
- avoids claiming Protab replaces common tools
- includes screenshot placeholders but does not require images

### Manual Chrome tests

Complete `what.md` against the production build, including:

- old-schema fixture migration
- migration backup export
- migration backup restore
- future-version non-destructive rejection
- manual Protab pin with File all
- manual Protab pin with Close all
- manual Protab pin with activation
- Chrome native pinned tab with every relevant close workflow
- audible tab with every relevant close workflow
- retry after protection state changes
- quick-capture close behavior on protected tab
- archive-and-close on protected tab
- two-window isolation for manual pins
- service-worker suspension while manual pins exist
- workspace and service-worker console review
- Network review confirming no Protab fetches for migration/protection

Record Chrome version, OS, exact wording observed, and any Chrome differences in `tab.audible` behavior.

---

## Atomic commit sequence

Keep every commit buildable and all existing checks green. Tests belong in the same commit as the behavior they verify.

1. `feat: add write-through durable migrations with backup`
2. `feat: add migration backup recovery in settings`
3. `feat: add live tab protection model and manual pins`
4. `feat: skip protected tabs in all close workflows`
5. `feat: surface protected badges and skip summaries`
6. `docs: add quickstart guide`
7. `docs: add Phase 4D loading and test instructions`

Commit 1 changes only durable loading, migration metadata, backup writing, and tests. It must not alter tab close behavior.

Commit 2 exposes backup export/restore through Settings and broadcasts restored state safely.

Commit 3 adds live-tab protection data, session-only manual pin storage, inventory badges, and pin/unpin actions, but does not yet change close behavior except where tests require a no-op guard seam.

Commit 4 wires the shared protected close guard into every workflow that can call `chrome.tabs.remove()`.

Commit 5 completes user-facing summaries, row styling, accessible labels, and retry copy.

Commit 6 adds `docs/quickstart.md` only.

Commit 7 adds manual loading/testing instructions for Phase 4D if a separate testing doc is desired.

If implementation proves that the protected close guard must land with commit 3 to avoid unsafe intermediate behavior, merge commits 3 and 4 and explain the deviation in completion evidence.

---

## Completion evidence

Before declaring Phase 4D complete, provide:

- commit list matching the sequence above or an explanation for any split/merge
- output of `npm test`, `npm run lint`, and `npm run build`
- production build location and unpacked-loading steps
- manual checklist results with Chrome version and OS
- evidence that old durable state migrates and writes back automatically
- evidence that backup write precedes migrated-state replacement
- evidence that migration failure and future schema versions are non-destructive
- evidence that backup export and restore work from Settings
- evidence that manual Protab pins are session-only live-tab state
- evidence that Chrome-pinned and audible tabs are protected
- evidence that every close workflow skips protected tabs with zero `tabs.remove()` calls for those tabs
- evidence that protected skips are summarized and do not block unprotected tabs
- evidence that retry rechecks protection
- evidence that quickstart exists and matches the agreed positioning
- console and Network review results
- exact manifest permissions
- deviations, unresolved risks, and interfaces Phase 5 must preserve
