# Phase 3 Implementation Plan

## Overview

This plan delivers Protab's core declutter loop: persist an unassigned tab into a project, then complete the approved programmatic close flow. Seven atomic commits, each buildable and testable independently.

## Design Decisions (confirmed)

- **Existing URL handling**: `FILE_LIVE_TAB` returns `filing: 'reused'` when URL already exists in target project
- **Close tracker storage**: Dedicated `CloseTrackerStore` class with its own `chrome.storage.session` key (`protab.closeAttempts.v1`)
- **Close policy**: Persist first → URL recheck → ownership → `chrome.tabs.remove()` → observe outcome independently

---

## Commit 1: `feat: add create-or-reuse filing command and tag suggestions`

**Scope**: Pure domain logic, no UI, no Chrome side effects.

### Files to create

#### `src/domain/tagSuggestions.ts`
```typescript
export function suggestTags(hostname: string): string[]
```

Rules:
- Lowercase hostname for matching
- Match `hostname === base` or `hostname.endsWith('.' + base)`
- Never raw string suffix (prevents `notyoutube.com`)
- Return each normalized tag at most once
- Return empty array for unknown/invalid hostnames

Mappings:
| Hostnames | Tag |
|-----------|-----|
| `youtube.com`, `youtu.be` + subdomains | `video` |
| `github.com`, `gitlab.com`, `bitbucket.org` + subdomains | `code` |
| `medium.com`, `substack.com` + subdomains | `article` |
| `x.com`, `twitter.com`, `facebook.com`, `instagram.com`, `linkedin.com`, `reddit.com`, `tiktok.com` + subdomains | `social` |

#### `src/domain/tagSuggestions.test.ts`
Test cases:
- Exact hostname matches (`youtube.com` → `video`)
- Subdomain matches (`www.github.com` → `code`)
- Deceptive suffixes (`notyoutube.com` → `[]`)
- Unknown hosts (`random-blog.com` → `[]`)
- Duplicate prevention (`www.youtube.com` → `['video']` not `['video', 'video']`)
- Invalid/empty input handling

### Files to modify

#### `src/domain/commands.ts`
Add new command type:
```typescript
| {
    type: 'FILE_LIVE_TAB'
    projectId: string
    url: string
    capturedTitle?: string
    suggestedTags: string[]
  }
```

Extend `CommandResultMeta`:
```typescript
export interface CommandResultMeta {
  // existing fields
  affectedProjectId?: string
  affectedSavedUrlId?: string
  existingSavedUrlId?: string
  didWrite: boolean
  // new field
  filing?: 'created' | 'reused'
}
```

#### `src/domain/applyCommand.ts`
Add `FILE_LIVE_TAB` case:
1. Find target project (throw `PROJECT_NOT_FOUND` if missing)
2. Serialize and validate URL using existing `serializeHttpUrl`
3. Check for existing same-project URL match:
   - If found: return existing record ID with `didWrite: false`, `existingSavedUrlId`, `filing: 'reused'`
   - Preserve existing title, tags, notes, ordering
4. If new: create record with:
   - Serialized URL
   - `capturedTitle` trimmed and validated, or `automaticTitle(url)` as fallback
   - `titleSource: 'automatic'` (captured title is still automatic, not user-edited)
   - Normalized `suggestedTags`
   - Empty notes
5. Return `filing: 'created'`, `affectedSavedUrlId`, `didWrite: true`

#### `src/domain/applyCommand.test.ts`
Add test suite for `FILE_LIVE_TAB`:
- Creates new record with automatic title from hostname
- Uses captured title when provided and non-empty
- Falls back to hostname when captured title is empty/whitespace
- Applies suggested tags to new records
- Returns `filing: 'created'` with new record ID
- Returns `filing: 'reused'` with existing record ID when URL matches
- Preserves existing metadata on reuse (title, tags, notes, ordering)
- Throws on invalid/unsupported URL
- Throws on missing project
- Normalizes tags (deduplication, trimming)

### Verification
```sh
npm test -- src/domain/tagSuggestions.test.ts src/domain/applyCommand.test.ts
npm run lint
npm run build
```

---

## Commit 2: `feat: add confirmed persist-first tab close workflow`

**Scope**: Background orchestration, close tracker, Chrome adapter extension.

### Files to create

#### `src/background/tabs/closeTracker.ts`
```typescript
export interface CloseAttempt {
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

export class CloseTrackerStore {
  // Similar pattern to OwnershipStore
  // Uses chrome.storage.session with key 'protab.closeAttempts.v1'
  // Schema: { schemaVersion: 1, attempts: Record<string, CloseAttempt> }
  // Keyed by operationId
  
  initialize(): Promise<void>
  read(): Promise<CloseAttempt[]>
  readByTabId(tabId: number): Promise<CloseAttempt | undefined>
  set(attempt: CloseAttempt): Promise<void>
  remove(operationId: string): Promise<void>
  updateState(operationId: string, state: CloseAttempt['state'], error?: string): Promise<void>
  clearResolved(activeTabIds: Set<number>): Promise<void>
}
```

Observable outcomes:
- **Closed**: `tabs.onRemoved` or `tabs.get()` proves absence
- **Failed**: remove rejects while tab exists
- **Pending/surviving**: bounded observation, tab still exists
- **Already closed**: disappeared after persist, before remove
- **Skipped**: URL changed, tab moved, etc.

#### `src/background/tabs/closeTracker.test.ts`
Test cases:
- Registration and state transitions
- `onRemoved` resolving an attempt
- Remove rejection while tab survives
- Pending/surviving after bounded observation
- Tab disappearance resolving stale attention
- Service-worker reconstruction restoring attention but issuing no close
- Serialized writes and invalid-value recovery

#### `src/background/tabs/filing.ts`
```typescript
export interface PreparedFilingOperation {
  operationId: string
  tabId: number
  projectId: string
  projectName: string
  capturedUrl: string
  capturedTitle: string
  suggestedTags: string[]
  existingSavedUrlId?: string  // present if will be reuse
}

export interface FilingResult {
  operationId: string
  tabId: number
  projectId: string
  savedUrlId: string
  filing: 'created' | 'reused'
  closeState: 'closed' | 'requested' | 'skipped' | 'failed'
  error?: string
}

export interface FilingSummary {
  eligible: number
  created: number
  reused: number
  alreadyClosed: number
  closeRequested: number
  surviving: number
  skipped: Array<{ tabId?: number; reason: FilingSkipReason }>
  failed: Array<{ tabId?: number; stage: 'persist' | 'ownership' | 'close'; message: string }>
}

export type FilingSkipReason = 
  | 'url-changed'
  | 'tab-moved'
  | 'tab-disappeared'
  | 'unsupported-url'
  | 'not-fileable'
  | 'project-missing'
  | 'ownership-failed'

export class FilingOrchestrator {
  constructor(
    private readonly api: ChromeTabsApi,
    private readonly ownership: OwnershipStore,
    private readonly closeTracker: CloseTrackerStore,
    private readonly durableQueue: CommandQueue,
    private readonly readState: () => Promise<PersistedStateV1>,
    private readonly onResult: (result: FilingResult | FilingSummary) => void,
    private readonly onInventoryChange: () => void,
  ) {}

  // Prepare a single filing operation for confirmation
  async prepare(
    tabId: number,
    projectId: string,
    windowId: number,
  ): Promise<PreparedFilingOperation>

  // Execute a confirmed single filing
  async executeFiling(
    prepared: PreparedFilingOperation,
    windowId: number,
  ): Promise<FilingResult>

  // Prepare bulk filing
  async prepareBulk(
    projectId: string,
    windowId: number,
  ): Promise<{ operationId: string; eligible: number; projectName: string }>

  // Execute confirmed bulk filing
  async executeBulkFiling(
    operationId: string,
    projectId: string,
    windowId: number,
  ): Promise<FilingSummary>

  // Retry a failed/surviving close
  async retryClose(
    operationId: string,
    windowId: number,
  ): Promise<FilingResult>

  // Private helpers
  private async validateFilingEligibility(tabId: number, windowId: number): Promise<LiveTabView>
  private async persistAndOwn(/* ... */): Promise<{ savedUrlId: string; filing: 'created' | 'reused' }>
  private async urlRecheck(tabId: number, persistedUrl: string): Promise<{ stable: boolean; currentUrl?: string }>
  private async requestClose(tabId: number, operationId: string): Promise<void>
}
```

Confirmed execution order (single tab):
1. Re-read latest project and tab
2. Verify tab still in acting window and fileable
3. Capture and serialize current URL as `persistedUrl`
4. Capture usable title, derive suggested tags
5. Execute `FILE_LIVE_TAB` through `CommandQueue`
6. If persistence fails → stop, no ownership, no close
7. Resolve `savedUrlId` from command metadata
8. Re-read tab with `tabs.get()`
9. If tab disappeared → report durable save + already-closed
10. Serialize reported URL, compare with `persistedUrl`
11. If changed → keep record, clear ownership, report URL-changed, require fresh decision
12. If stable → replace ownership entry with new target
13. Register close tracking
14. Issue non-blocking `chrome.tabs.remove()`
15. Broadcast committed state, refreshed inventory, result

#### `src/background/tabs/filing.test.ts`
Test cases:
- Single filing: persist → ownership → close request ordering
- Persistence failure causes zero ownership writes and zero remove calls
- Final URL change saves record but skips ownership/close
- Drifted row files current URL, not `establishedUrl`
- Duplicate reuse preserves metadata while still requesting close
- Ownership failure preserves record and live tab
- Tab disappearance before persistence, after persistence, before close
- Close request rejection preserves record/ownership and creates attention
- Unresolved close not blocking another per-window filing indefinitely
- Bulk excluding owned, unsupported, workspace, disappeared, other-window tabs
- Within-batch deduplication and partial continuation
- Operation confirmation expiration/revalidation

### Files to modify

#### `src/background/tabs/chromeTabs.ts`
Add to `ChromeTabsApi` interface:
```typescript
remove(tabId: number): Promise<void>
```

Add to `ChromeTabsAdapter`:
```typescript
async remove(tabId: number): Promise<void> {
  await chrome.tabs.remove(tabId)
}
```

#### `src/background/tabs/coordinator.ts`
Add constructor dependencies:
```typescript
private readonly closeTracker?: CloseTrackerStore
private readonly filingOrchestrator?: FilingOrchestrator
```

Add message handling in `onMessage`:
```typescript
if (message.kind === 'PREPARE_FILE_LIVE_TAB' && typeof message.tabId === 'number' && typeof message.projectId === 'string') {
  this.enqueueWindow(client.windowId, () => this.prepareFileTab(client, message.tabId!, message.projectId!))
  return
}
if (message.kind === 'CONFIRM_FILE_LIVE_TAB' && typeof message.operationId === 'string') {
  this.enqueueWindow(client.windowId, () => this.confirmFileTab(client, message.operationId!))
  return
}
if (message.kind === 'CANCEL_FILE_OPERATION' && typeof message.operationId === 'string') {
  // Clean up prepared operation, no side effects
  return
}
if (message.kind === 'RETRY_FILE_OPERATION' && typeof message.operationId === 'string') {
  this.enqueueWindow(client.windowId, () => this.retryFileOperation(client, message.operationId!))
  return
}
if (message.kind === 'PREPARE_FILE_ALL_UNASSIGNED' && typeof message.projectId === 'string') {
  this.enqueueWindow(client.windowId, () => this.prepareBulkFile(client, message.projectId!))
  return
}
if (message.kind === 'CONFIRM_FILE_ALL_UNASSIGNED' && typeof message.operationId === 'string') {
  this.enqueueWindow(client.windowId, () => this.confirmBulkFile(client, message.operationId!))
  return
}
```

#### `src/background/messages.ts`
Extend `LiveTabRequest`:
```typescript
| { kind: 'PREPARE_FILE_LIVE_TAB'; tabId: number; projectId: string }
| { kind: 'CONFIRM_FILE_LIVE_TAB'; operationId: string }
| { kind: 'CANCEL_FILE_OPERATION'; operationId: string }
| { kind: 'RETRY_FILE_OPERATION'; operationId: string }
| { kind: 'PREPARE_FILE_ALL_UNASSIGNED'; projectId: string }
| { kind: 'CONFIRM_FILE_ALL_UNASSIGNED'; operationId: string }
```

Extend `LiveTabMessage`:
```typescript
| { kind: 'FILING_PREPARED'; operation: PreparedFilingOperation }
| { kind: 'FILING_RESULT'; result: FilingResult }
| { kind: 'FILING_SUMMARY'; summary: FilingSummary }
| { kind: 'BULK_FILING_PREPARED'; operationId: string; eligible: number; projectName: string }
```

#### `src/background/index.ts`
Wire up new dependencies:
```typescript
const closeTracker = new CloseTrackerStore(new ChromeSessionStorageAdapter())
void closeTracker.initialize().catch(/* ... */)

const filingOrchestrator = new FilingOrchestrator(
  new ChromeTabsAdapter(),
  ownership,
  closeTracker,
  queue,
  () => queue.read(),
  (result) => { /* broadcast result */ },
  () => liveTabs.scheduleAll(),
)

// Pass to coordinator
const liveTabs = new LiveTabsCoordinator(
  new ChromeTabsAdapter(),
  ownership,
  () => queue.read(),
  queue,
  closeTracker,
  filingOrchestrator,
)

// Listen for tab removal to resolve close attempts
chrome.tabs.onRemoved.addListener((tabId) => {
  closeTracker.resolveRemoval(tabId)
  liveTabs.scheduleWindow(/* ... */)
})
```

### Verification
```sh
npm test -- src/background/tabs/closeTracker.test.ts src/background/tabs/filing.test.ts
npm run lint
npm run build
```

---

## Commit 3: `feat: add keyboard tab filing to projects`

**Scope**: Workspace UI for keyboard-initiated filing.

### Files to create

#### `src/workspace/LiveTabFileActions.tsx`
Component for unassigned tab rows:
- "File to project…" button (visible when tab is fileable)
- Opens `FileTabsDialog` on click
- Shows processing state during filing
- Announces result via `aria-live`

#### `src/workspace/FileTabsDialog.tsx`
Dialog for project selection and confirmation:
- Lists projects in durable order
- Shows tab title and target project
- Two-step flow:
  1. Select project
  2. Confirm save-and-close operation
- Copy: "Protab will save this URL and request Chrome to close the tab"
- No claim about detecting unsaved changes or guaranteed native warnings
- Focus restoration on cancel
- Shows suggested tags preview (read-only in confirmation)

#### `src/workspace/FilingResult.tsx`
Inline result display for single filing:
- Created/reused label
- Close requested/surviving/skipped/failed label
- "Already saved in [Project]" for reuse
- "URL changed — not closed" for URL-change skip
- Retry button for failed closes
- Dismissible

#### `src/workspace/FilingResult.test.tsx`
Test cases:
- Renders created/reused labels correctly
- Shows close state labels
- Retry button calls handler
- Dismiss button calls handler

### Files to modify

#### `src/workspace/useLiveTabs.ts`
Extend `LiveTabsModel`:
```typescript
export interface LiveTabsModel {
  // existing fields
  prepareFileTab: (tabId: number, projectId: string) => void
  confirmFileTab: (operationId: string) => void
  cancelFileOperation: (operationId: string) => void
  retryFileOperation: (operationId: string) => void
  preparedFiling?: PreparedFilingOperation
  filingResult?: FilingResult
  filingPending: boolean
  dismissFilingResult: () => void
}
```

Extend `ChromeLiveTabsClient` to handle new messages:
```typescript
// In subscribe callback:
if (message.kind === 'FILING_PREPARED') setPreparedFiling(message.operation)
if (message.kind === 'FILING_RESULT') { setFilingResult(message.result); setFilingPending(false) }
```

#### `src/workspace/CurrentTabsPane.tsx`
Add to unassigned tab rows:
- Import `LiveTabFileActions`
- Render file actions for eligible tabs (supported, unassigned, not workspace)
- Show `FilingResult` inline when result matches tab
- Add keyboard handling for file action

#### `src/workspace/TagEditor.tsx`
No changes needed. Existing `TagEditor` already handles:
- Displaying tags
- Adding/removing tags
- Suggestions list
- Error display

Suggested tags will be pre-populated in the saved record, then user can edit normally.

### Verification
```sh
npm test -- src/workspace/FilingResult.test.tsx
npm run lint
npm run build
# Manual: Load extension, create project, use keyboard to file a tab
```

---

## Commit 4: `feat: add drag-to-project tab filing`

**Scope**: Drag-and-drop support for filing.

### Files to create

No new files. This commit extends existing components.

### Files to modify

#### `src/workspace/CurrentTabsPane.tsx`
Add drag behavior to unassigned tab rows:
- `draggable="true"` on eligible rows (supported, unassigned)
- `onDragStart` handler: set `dataTransfer` with `{ tabId }` payload
- Visual states: idle, dragging, drag-over-invalid
- Do NOT make unsupported or non-drifted owned rows draggable

#### `src/workspace/App.tsx`
Add drop targets to project sidebar and canvas:

**Project sidebar** (`project-item` buttons):
- `onDragOver`: prevent default, show valid drop indicator
- `onDragEnter`/`onDragLeave`: toggle visual state
- `onDrop`: extract `tabId`, call `prepareFileTab(tabId, projectId)`
- Visual states: idle, drag-over-valid, drag-over-invalid

**Selected project canvas**:
- `onDragOver`/`onDrop` on the canvas section
- Same behavior as sidebar

Visual feedback:
- Acceptable drop: highlight border, subtle background change
- Invalid drop (unsupported tab, workspace tab): no highlight, cursor indicates
- Processing: show spinner on target after drop

#### `src/styles/global.css`
Add drag-related styles:
```css
.live-tab-row[draggable="true"] { cursor: grab; }
.live-tab-row[draggable="true"]:active { cursor: grabbing; }
.live-tab-row.dragging { opacity: 0.5; }

.project-row.drag-over-valid { 
  /* highlight border */ 
}
.project-canvas.drag-over-valid { 
  /* highlight border */ 
}

.file-processing { 
  /* spinner overlay */ 
}
```

### Verification
```sh
npm run lint
npm run build
# Manual: Drag an unassigned tab to a project sidebar item
# Manual: Drag an unassigned tab to the selected project canvas
# Manual: Verify unsupported tabs are not draggable
# Manual: Verify owned tabs are not draggable for filing
```

---

## Commit 5: `feat: add bulk filing for unassigned tabs`

**Scope**: "File all unassigned tabs" action.

### Files to create

#### `src/workspace/FilingSummary.tsx`
Bulk filing results display:
- Eligible count
- Created/reused counts
- Close requested/surviving/skipped/failed counts
- Expandable skipped/failed lists with reasons
- Per-item: tab title, reason, retry button (for failed closes)
- "Done" button to dismiss

#### `src/workspace/FilingSummary.test.tsx`
Test cases:
- Renders all count categories
- Shows skipped items with reasons
- Shows failed items with stages
- Retry button calls handler for failed items
- Done button calls handler

### Files to modify

#### `src/workspace/App.tsx`
Add to canvas header (near `ProjectActions`):
- "File all unassigned tabs (N)" button
- N = count of eligible unassigned tabs from `liveTabs.inventory`
- Disabled when N = 0, with explanatory label
- Calls `prepareBulkFile(projectId)` on click
- Shows `FilingSummary` when bulk result is available

#### `src/workspace/useLiveTabs.ts`
Extend `LiveTabsModel`:
```typescript
prepareBulkFile: (projectId: string) => void
confirmBulkFile: (operationId: string) => void
bulkPrepared?: { operationId: string; eligible: number; projectName: string }
bulkSummary?: FilingSummary
bulkPending: boolean
dismissBulkSummary: () => void
```

#### `src/background/tabs/filing.ts`
Already implemented in Commit 2. This commit wires the UI to the existing background methods.

### Verification
```sh
npm test -- src/workspace/FilingSummary.test.tsx
npm run lint
npm run build
# Manual: File multiple tabs at once, verify summary
# Manual: Mix of eligible, owned, unsupported, duplicate tabs
# Manual: Verify partial results when some fail
```

---

## Commit 6: `feat: add filing attention states and close retries`

**Scope**: Attention banner, row markers, stage-aware retry.

### Files to create

#### `src/workspace/AttentionBanner.tsx`
Workspace-level banner for unresolved attention:
- Aggregate counts (e.g., "2 tabs need attention")
- Expandable list of affected tabs
- Each item: tab title, reason, action button (Focus/Retry/Dismiss)
- Dismissible (hides banner, does NOT clear row markers)
- Links to affected tabs via `FOCUS_LIVE_TAB`

#### `src/workspace/AttentionBanner.test.tsx`
Test cases:
- Renders aggregate count
- Shows individual items with correct actions
- Focus button calls handler
- Retry button calls handler
- Dismiss hides banner but preserves row state

### Files to modify

#### `src/workspace/CurrentTabsPane.tsx`
Add attention markers to tab rows:
- Visual indicator (icon/badge) for tabs with unresolved attention
- Tooltip explaining the attention state
- Contextual action: "Retry close" or "URL changed — file again"
- Marker resolves when: tab closes, user dismisses, retry succeeds

#### `src/workspace/useLiveTabs.ts`
Extend for attention state:
```typescript
attentionItems: AttentionItem[]
dismissAttention: (operationId: string) => void
retryClose: (operationId: string) => void
```

Where `AttentionItem`:
```typescript
interface AttentionItem {
  operationId: string
  tabId: number
  title: string
  reason: 'close-failed' | 'surviving' | 'url-changed' | 'ownership-failed'
  retryable: boolean
}
```

#### `src/background/tabs/closeTracker.ts`
Add method to expose attention items:
```typescript
getAttentionItems(): AttentionItem[]
```

Add method to resolve attention:
```typescript
resolveAttention(operationId: string): void
```

#### `src/styles/global.css`
Add attention-related styles:
```css
.attention-banner { /* warning banner styles */ }
.attention-item { /* individual item styles */ }
.live-tab-row.attention { /* row marker */ }
.attention-badge { /* icon/badge */ }
```

### Verification
```sh
npm test -- src/workspace/AttentionBanner.test.tsx
npm run lint
npm run build
# Manual: Trigger a close failure, verify banner appears
# Manual: Retry a failed close
# Manual: Dismiss banner, verify row markers persist
# Manual: Navigate a filed tab, verify URL-change attention
```

---

## Commit 7: `docs: add Phase 3 loading and test instructions`

**Scope**: Documentation for Phase 3 completion evidence.

### Files to create

#### `docs/phase-3-testing.md`
Manual testing checklist (from `what.md`):
1. File an unassigned tab by drag, verify captured URL, title, tags
2. Repeat using only keyboard controls
3. File a URL already present in target, verify metadata not overwritten
4. Simulate storage failure, verify tab remains open with retryable draft
5. Bulk-file mixed eligibility, verify summary
6. Verify every domain-tag mapping, deceptive suffix, unknown domain
7. Remove/edit suggested tags, verify they behave like manual tags
8. Change tab URL during filing, verify not silently closed
9. Exercise programmatic close on page with unsaved form state
10. Test native Leave/Stay paths where eligible
11. Verify wording makes no false native-warning promise

Record: Chrome version, OS, exact wording observed, native warning behavior.

#### `docs/phase-3-completion.md`
Completion evidence template:
- Commit list matching sequence
- `npm test`, `npm run lint`, `npm run build` output
- Production build location and loading steps
- Manual checklist results
- Evidence of persist-before-close ordering
- Evidence that storage/ownership failures call no remove
- Evidence that URL-change recheck skips closure
- Duplicate metadata-preservation evidence
- Mixed bulk summary evidence
- Native unsaved-form behavior evidence
- Service-worker suspension evidence
- Two-window isolation evidence
- Console and Network review results
- Exact manifest permissions
- Deviations, unresolved risks, interfaces Phase 4 must preserve

### Verification
```sh
npm run build
# Load unpacked, follow testing checklist
```

---

## File Structure Summary

### New files (7)
```
src/domain/tagSuggestions.ts
src/domain/tagSuggestions.test.ts
src/background/tabs/closeTracker.ts
src/background/tabs/closeTracker.test.ts
src/background/tabs/filing.ts
src/background/tabs/filing.test.ts
src/workspace/LiveTabFileActions.tsx
src/workspace/FileTabsDialog.tsx
src/workspace/FilingResult.tsx
src/workspace/FilingResult.test.tsx
src/workspace/FilingSummary.tsx
src/workspace/FilingSummary.test.tsx
src/workspace/AttentionBanner.tsx
src/workspace/AttentionBanner.test.tsx
docs/phase-3-testing.md
docs/phase-3-completion.md
```

### Modified files (10)
```
src/domain/commands.ts          (add FILE_LIVE_TAB, extend CommandResultMeta)
src/domain/applyCommand.ts      (handle FILE_LIVE_TAB)
src/domain/applyCommand.test.ts (add filing tests)
src/background/tabs/chromeTabs.ts (add remove)
src/background/tabs/coordinator.ts (add filing message handling)
src/background/messages.ts      (add filing request/response types)
src/background/index.ts         (wire up close tracker, filing orchestrator)
src/workspace/useLiveTabs.ts    (extend model with filing methods)
src/workspace/CurrentTabsPane.tsx (add file actions, drag, attention)
src/workspace/App.tsx           (add drop targets, bulk action)
src/styles/global.css           (add filing, drag, attention styles)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Chrome `tabs.remove()` timing | Non-blocking tracker, independent observation via `onRemoved` |
| Service-worker suspension | Close tracker in `chrome.storage.session`, reconstruct attention on wake |
| Race between URL check and close | Acknowledge limitation in UI copy, no atomic claim |
| `beforeunload` native dialog | Report surviving tab honestly, no false warning promise |
| Bulk partial failure | Continue independent items, aggregate summary |
| Workspace disconnect during filing | Background completes operation, reports via inventory refresh |

---

## Phase 4 Handoff

After Phase 3, these interfaces must be preserved:
- `FILE_LIVE_TAB` command type and `CommandResultMeta.filing`
- `FilingOrchestrator` public API
- `CloseTrackerStore` session key and schema
- `LiveTabRequest` filing variants
- `LiveTabMessage` filing result types
- `PreparedFilingOperation`, `FilingResult`, `FilingSummary` types
- Attention banner and row marker patterns
- Drag-and-drop targets on project sidebar/canvas
