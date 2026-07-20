# Phase 1 — How to build it

This document fixes the boundaries needed for an autonomous implementation. Local names and component decomposition may vary when tests and behavior remain equivalent.

## Technology baseline

- TypeScript in strict mode
- React for the workspace UI
- Vite for repeatable development and production builds
- Manifest V3 with a background service worker and a full-page extension entry
- Vitest, jsdom, and Testing Library for automated tests
- ESLint for static checks
- Plain CSS with custom properties for the Stitch tokens; avoid a runtime styling dependency
- Locally bundled Inter font and locally bundled icons
- npm with committed lockfile

Required command contract:

```sh
npm test
npm run lint
npm run build
```

Add a documented watch/development command if useful, but the production build must be sufficient to load the unpacked extension.

Do not copy `stitch_core_artifacts/code.html` directly. Its Tailwind CDN, Google-hosted fonts/icons, simulated tab data, and deferred controls are incompatible with the production extension contract.

## Extension boundary

Phase 1 needs only:

- A toolbar action
- A background service worker that opens or focuses `workspace.html` in the clicked window
- The workspace page
- Manifest permissions exactly `"storage"` and `"tabs"`

Do not request host permissions, content-script access, history, bookmarks, sessions, or broad permissions reserved for later phases. Keep the manifest permission list reviewable.

The background service worker owns toolbar behavior and all persisted-state mutations. The workspace must not infer or manipulate ordinary tabs in Phase 1.

## Suggested source boundaries

```text
src/
├── background/   toolbar and extension lifecycle
├── domain/       project, saved URL, validation, ordering, URL identity
├── storage/      persisted schema, repository, version dispatch
├── workspace/    React page, components, and interaction state
└── styles/       tokens, font declarations, and global layout
```

Keep Chrome APIs behind small adapters so domain and UI tests do not require a real browser. Do not create a generic abstraction layer beyond the storage and toolbar seams this phase actually uses.

## Persisted schema

Store one versioned state object under one stable `chrome.storage.local` key.

```ts
interface PersistedStateV1 {
  schemaVersion: 1
  projects: Project[]
}

interface Project {
  id: string
  name: string
  savedUrls: SavedUrl[]
}

interface SavedUrl {
  id: string
  url: string
  title: string
  titleSource: 'automatic' | 'custom'
  tags: string[]
  notes: string
}
```

- Generate IDs with `crypto.randomUUID()`.
- Store only parsed, browser-serialized URLs. The stored URL is also the complete comparison key in V1.
- Array position is the sole ordering authority for projects and saved URLs.
- Derive the global tag suggestion vocabulary from all saved records rather than storing synchronized tag entities.
- Selection, expanded accordion IDs, open menus, drafts, and notifications are UI state, not part of V1 persistence.

All reads pass through schema validation and version dispatch. Phase 1 has no predecessor schema and must not invent a migration fixture. Test absent-state initialization, valid V1 loading, and rejection of unsupported versions; add the first real migration only when V2 exists.

An absent key creates an empty V1 state. If a present V1 value is invalid, or its version is unsupported, place every workspace in a blocking read-only storage-error state. Do not call `chrome.storage.local.set()` or `remove()`, and leave the raw value untouched.

## Storage operations

The background service worker is the single mutation owner. Workspaces send it product-level commands and observe committed state changes; they never perform read-modify-write storage operations directly. The service worker queues commands, reads and validates the latest stored state inside each queued operation, applies one command, persists it, and returns the committed state.

Expose commands in product terms rather than allowing components to edit the state object directly:

- Create, rename, reorder, and delete project
- Create, update, reorder, copy, and delete saved URL
- Read current state and subscribe to committed changes

This queue must coordinate commands from every open workspace. Treat storage writes as fallible promises. Update visible committed state only after success while retaining the submitting workspace's draft on failure. Other workspaces receive committed updates through `chrome.storage.onChanged` or an equivalent background broadcast.

Project deletion in Phase 1 requires confirmation and atomically removes the project and all of its saved records. Phase 2 must extend this operation before projects can own live tabs.

## URL and metadata behavior

Implement URL parsing and canonical comparison as pure domain functions with the exact rules in `what.md`.

For manual URL creation:

- Parse and validate the URL before storage.
- If no title is supplied, set the hostname as `title` and `automatic` as `titleSource`.
- If a title is supplied, mark it `custom`.
- Reject a same-project duplicate before writing.

For editing:

- Editing title text marks the title `custom`.
- Editing a URL revalidates it and rechecks uniqueness before committing. If the existing title is automatic, replace it with the new hostname and keep it automatic; if custom, preserve it.
- If URL and title are edited together, the explicit title wins and becomes custom.
- Text and notes autosave on blur; tag additions/removals and reorder operations save immediately.
- Collapsing an accordion flushes valid pending edits first. Invalid edits remain expanded.

For copying:

- Create a new ID, append to the target array, and copy metadata values.
- Never retain a live reference between source and copy.
- If the target URL already exists, perform no write and return that record's ID so the UI can select it.

## Workspace behavior

The background service worker serializes action-click handlers so overlapping initial clicks cannot both create a workspace. For each click, use the clicked tab's window and query only Protab's exact extension URL:

```ts
chrome.tabs.query({
  windowId: clickedTab.windowId,
  url: chrome.runtime.getURL('workspace.html'),
})
```

Then:

1. Focus the window with `chrome.windows.update()` and activate the existing workspace with `chrome.tabs.update()` when found.
2. Otherwise create `workspace.html` in that window with `chrome.tabs.create()`.
3. On query failure, do not call `tabs.create`; log contextual diagnostics and perform a fresh query on the next click.

Do not enumerate or read ordinary tab URLs. Do not enforce global workspace uniqueness or attempt to close manually duplicated workspace tabs. Closing a workspace has no effect on durable data.

The workspace loads persisted state before presenting editable controls. Use a stable loading state rather than briefly rendering the first-use empty state. Select the first ordered project by default; selection remains local to each workspace instance.

Forms and dialogs must have explicit submit/cancel behavior. Accordion field edits autosave according to the storage rules. Use confirmation dialogs for destructive project and URL deletion, with the project dialog reporting how many URLs will be removed.

When a selected project is deleted, select the project that moves into its array position, or the preceding project if it was last. A non-empty project list always has a selection. On canceled deletion restore focus to the trigger; after successful deletion focus the selected successor, nearest surviving URL row, or the applicable create action because the original trigger no longer exists.

## Visual implementation

Translate the token values from `stitch_core_artifacts/DESIGN.md` into CSS custom properties. Use the artifact's structure, not its generated utility classes.

At the 1280 × 1024 reference viewport:

- Sidebar is 240 px.
- Top bar is compact, approximately 48 px high.
- Main body uses 40 px outer spacing and 12–24 px internal gaps.
- Saved URL rows are compact, use 1 px warm-grey boundaries, and avoid prominent shadows.
- Main canvas receives more width than the reserved Current Tabs pane.
- Text truncates safely instead of forcing horizontal page overflow.

Use semantic buttons, forms, lists, headings, dialogs, and disclosure controls. Visual icon buttons require accessible names and tooltips where their meaning is not obvious.

The generated image contains pinning, statuses, navigation sections, search, export, live tabs, and tab actions that Phase 1 intentionally omits. Do not leave nonfunctional replicas of those controls. The Current Tabs pane is the sole allowed future-facing placeholder because it preserves the core three-pane information architecture.

## Test strategy

### Domain and storage tests

Cover:

- Project and saved-record validation
- URL serialization and every identity rule
- Same-project deduplication and cross-project allowance
- Case-insensitive tag deduplication and limits
- Automatic/custom title transitions, including URL-only edits and simultaneous URL/title edits
- Array ordering and reorder operations
- Copy snapshot independence and duplicate-target behavior
- Project cascade deletion
- Empty storage initialization, valid V1 loading, invalid data handling, and unsupported future version handling
- Failed writes retaining drafts and previously committed state
- Overlapping commands from two workspace clients preserving both successful mutations

Use an in-memory implementation of the storage adapter for most tests and a focused Chrome-storage mock for adapter contract tests.

### Workspace tests

Cover:

- Loading, first-use, empty-project, and blocking read-only storage-error states
- Project CRUD, selection, ordering, and confirmed deletion
- URL CRUD, accordion semantics, autosave, validation, ordering, copying, and deletion
- Tag suggestions across projects without metadata synchronization
- Focus restoration for menus/dialogs and keyboard alternatives for ordering
- Absence of all deferred controls named in `what.md`

### Background tests

With a narrow Chrome API test double, cover:

- Focus an existing workspace in the clicked window
- Create a workspace when that window has none
- Ignore a workspace in another window
- Overlapping action clicks create at most one workspace
- Query failure does not call `tabs.create`, logs context, and performs a fresh query on the next click
- Create failure logs context and the next click performs a fresh query

### Manual Chrome tests

Complete the checklist in `what.md` against the production build. Record the Chrome version and any deviations in the implementing thread or pull request. Automated tests do not replace the two-window, restart-persistence, console, and visual checks.

## Atomic commit sequence

Keep each commit buildable and all existing checks green:

1. `chore: add installable extension and test baseline`
2. `feat: add versioned local project storage`
3. `feat: add project workspace and creation flow`
4. `feat: add project organization actions`
5. `feat: add saved URL accordions`
6. `feat: add URL ordering tags and project copying`
7. `feat: focus one workspace per Chrome window`
8. `docs: add Phase 1 loading and test instructions`

Tests belong in the same commit as the behavior they verify. Do not defer Phase 1 test coverage to a final test-only commit.

## Completion evidence

Before declaring Phase 1 complete, provide:

- Commit list matching the sequence above or an explanation for any merge/split
- Output of `npm test`, `npm run lint`, and `npm run build`
- Production build location and unpacked-loading steps
- Manual checklist results, including browser version
- A 1280 × 1024 workspace screenshot for visual review
- Any deviations or unresolved risks that affect Phase 2
