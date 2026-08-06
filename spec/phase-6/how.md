# Phase 6 — How to build it

This document fixes the implementation boundaries for nested projects on top of the completed Phase 4D/5 code. Phase 6 preserves Protab's local-first, persist-first, close-honest design and the command/state contract while making project structure a tree.

Local names and component decomposition may vary when tests, ordering, safety, and product behavior remain equivalent.

## Technology and baseline

Retain the existing stack: TypeScript strict, React + Vite, MV3 service worker, browser popup, full-page `workspace.html`, Vitest + Testing Library + jsdom, ESLint, plain Stitch-token CSS, locally bundled Inter + icons, npm with committed lockfile.

Required checks stay:

```sh
npm test
npm run lint
npm run build
```

Note: `.pi/skills/web-test/scripts/*.js` currently trips ESLint (`return` outside of function). Those are harness scripts, not product code; leave them in place and scope linting of product code only. If straightforward, add an ESLint ignore for `.pi/` rather than surfacing noise.

## Fixed seams (extend, do not replace)

- `src/domain/types.ts` — add `PersistedStateV3`, `ProjectV3` (`parentId`), `SavedUrlV3`, and re-point the `PersistedState` / `Project` / `SavedUrl` aliases.
- `src/domain/migration.ts` — add pure `migrateV2ToV3`.
- `src/storage/schema.ts` — `CURRENT_SCHEMA_VERSION = 3`; `validateProjects` gains tree validation (dangling `parentId`, cycles, sibling-name collisions, `:` in names) alongside all existing record rules.
- `src/domain/tree.ts` (new) — pure subtree/path helpers shared by workspace and background (`childrenOf`, `siblingsOf`, `isDescendant`, `subtreeIds`, `subtreeProjects`, `subtreeSavedUrls`, `pathOf`, `resolvePath`, `bootstrapChildren` for the Misc rules).
- `src/domain/commands.ts` + `src/domain/applyCommand.ts` — add `CREATE_SUBPROJECT` and `REPARENT_PROJECT`; broaden `REORDER_PROJECT` to sibling scope; broaden `DELETE_PROJECT` and `ARCHIVE_PROJECT` to subtrees; route folder-targeted saves to `Misc` (Rule B). Extend `CommandResultMeta` with `deletedProjectIds` / subtree id set as needed.
- `src/domain/validation.ts` — sibling-uniqueness and `:` checks; keep `findProject` semantics (global id lookup) intact for command paths.
- `src/background/messages.ts` + `src/background/tabs/coordinator.ts` + `src/background/tabs/filing.ts` + `src/background/tabs/chromeTabs.ts` — subtree-aware activation (close tabs outside subtree), Open all / Close all over subtree, delete-subtree ownership cleanup (tabs of deleted leaves → Unassigned, not closed). The Chrome tabs adapter is untouched; only the project-set computations change, via `tree.ts`.
- `src/workspace/useWorkspace.ts` / `client.ts` — unchanged protocol; folder selection starts returning a folder view.
- `src/popup/QuickCapture.tsx` + `src/domain/captureParser.ts` — path parse (`:`), path resolution + auto-create chain, and descendant `:`-split autocomplete.
- `src/workspace/App.tsx` — sidebar becomes a tree (expand/collapse, indent, path breadcrumb), drag-to-nest, context-menu "New sub-project", subtree counts and subtree dialogs; canvas renders folder vs leaf views.
- `src/workspace/export/generateHtml.ts` + `parseImport.ts` — nested serialization/parse and path-based merge.
- `src/domain/liveTabs.ts`, `ownershipStore.ts`, `activeProjectStore.ts`, `closeTracker.ts`, `CurrentTabsPane.tsx`, `SavedUrlAccordion.tsx` — unchanged except where their call sites consume subtree id sets from events/meta.

Do not let React call Chrome tabs APIs, mutate durable project state directly, or synthesize close results. The background revalidates subtree membership immediately before side effects.

## Feature 1 — Data model and migration

Chain migrations, never rewrite older ones in place:

```ts
migrateV1ToV2(state: PersistedStateV1): PersistedStateV2
migrateV2ToV3(state: PersistedStateV2): PersistedStateV3
```

`migrateV2ToV3` sets `parentId: null` on every project and stamps `schemaVersion: 3`. Pure: no Chrome APIs, no storage writes, no tab ops, injectable clock only where a timestamp is part of the contract.

`validateProjects` becomes tree-aware. All existing checks stay (id/name/titles/tags/notes/URL uniqueness per project). New checks:

- `parentId` is `null` or a string that references an existing project id.
- Walking `parentId` from any project terminates at `null` (no cycles). Because ids are unique and parents must exist, a depth-bounded walk detects cycles.
- Within one sibling group, `name` is unique case-insensitively.
- Names do not contain `:`.
- Keep `StorageDataError('invalid' | 'unsupported-version')` semantics; a future schema still throws `unsupported-version`.

### Tests

- Migration: V2 fixture → V3; every project gets `parentId: null`; empty state; invalid V2 still throws.
- `parsePersistedStateWithMetadata` reports `migrated: true`, `originalSchemaVersion: 2`, `currentSchemaVersion: 3`; writes the legacy backup through the `MigrationStorageAdapter` flow (existing 4D behavior, now ending at V3).
- Validation: dangling parent, child cycle (A→B→A), self-parent, sibling duplicate name, `:` in name, and every legacy invalid-data rule.

## Feature 2 — Paths and identity

`tree.ts` provides:

```ts
pathOf(state, id, sep = ':')          // 'Root:Child:Leaf'
resolvePath(state, path)              // exact path → project | undefined
siblingsOf(state, id)                 // in stored order
childrenOf(state, id)                 // in stored order
isDescendant(state, id, ancestorId)   // strict
subtreeIds(state, id)
subtreeProjects(state, id)
subtreeSavedUrls(state, id)           // leaves' URLs; folder contributions via Rule C
```

Path building walks `parentId` up to `null` and reverses. `resolvePath` splits on `:` and descends by exact (case-insensitive) sibling name. Guard against project names containing `:` at the validation layer so paths stay unambiguous.

### Tests

- Round-trip: `resolvePath(state, pathOf(state, id)) === id` for leaves and folders.
- Paths with spaces: `Client work:API docs`.
- Case-insensitive resolution.
- `subtreeIds` includes the node; `subtreeSavedUrls` sums leaves; `isDescendant` is strict for direct children and deeper.

## Feature 3 — Misc leaf rules

`bootstrapChildren(state, projectId)` (or an equivalent applied inside `applyCommand`) implements Rule A: if the node has `savedUrls` and we are about to add a child, copy the URLs into a `Misc` child (reuse an existing `Misc` sibling; else create a new leaf id), then clear the node's `savedUrls`, then create the requested child — all within a single command result (one durable write).

Rule B: `saveTarget(state, projectId)` returns the project itself when it is a leaf, else its `Misc` leaf (creating it). `CREATE_SAVED_URL`, `FILE_LIVE_TAB`, and `COPY_SAVED_URL` resolve their target through `saveTarget`. If creation is impossible (folder, and `Misc` name conflicts with a sibling that is a folder), throw a clear `DomainError`.

All rule machinery is documented in `design_decisions.md`, `what.md`, and the quickstart, so `Misc` is never a silent surprise.

### Tests

- Add first child to a project with URLs → `Misc` exists with those URLs, node's `savedUrls` empty, child created.
- Add child to a project that already has `Misc` → reuses it, no duplicate.
- Save/filing into a folder → lands in `Misc` (created on demand).
- Save into a leaf → unchanged behavior.

## Feature 4 — Commands

- `CREATE_SUBPROJECT`: parent exists? sibling collision? `:` in name? → auto-wrap (Rule A) → create child.
- `REPARENT_PROJECT { projectId, newParentId, toIndex? }`: remove from old siblings; cycle/self check (`isDescendant(newParent, projectId)` → reject); destination sibling collision (accounting for the moved project itself) → reject; Rule A on destination if it holds URLs; insert at `toIndex` (default end).
- `REORDER_PROJECT`: sibling-scoped (`siblingsOf`), preserving the existing `moveItem` bounds/`INVALID_ORDER` behavior.
- `DELETE_PROJECT`: collect `subtreeIds`, remove all, return `deletedProjectIds` in meta. Command stays one; the UI/background consume the set for successor selection and ownership cleanup.
- `ARCHIVE_PROJECT`: apply to `subtreeIds`, return the set.
- `RENAME_PROJECT`: enforce sibling uniqueness + no `:`.

Keep `Command` a serializable discriminated union; add fields, do not break the message protocol (`ClientMessage`/`BackgroundResponse` unchanged except meta shape).

### Tests

- Create subproject inside root; under folder with URLs (wrap); sibling collision rejects; parent missing rejects.
- Reparent to root / to another folder / cycle rejects / collision rejects / with `toIndex`.
- Reorder within siblings and within roots; invalid order throws.
- Delete folder deletes descendants; meta carries all ids; deleting leaf deletes one.
- Archive folder archives descendants; meta carries ids.

## Feature 5 — Subtree background operations

`coordinator.ts` / `filing.ts` currently compute "other projects' tabs" from flat lists. Replace flat comparisons with `subtreeIds`:

- Activate(p): the excluded set is `subtreeIds(p)`; close candidates are tabs owned by projects **not** in that set.
- Open all(p): URLs from `subtreeSavedUrls(p)` that aren't already open.
- Close all(p): tabs owned by `subtreeIds(p)`.
- Delete(p): after durable delete, mark every ownership entry with a `projectId` in `deletedProjectIds` as orphaned → Unassigned; do **not** close them.
- Active-project store: unchanged (single `projectId`); only the in-subtree test changes.

Keep the prepare → confirm → summarize flow and the honest close reporting. Protected-tab logic is untouched.

### Tests

- Coordinator: activation closes tabs owned outside a folder's subtree and keeps tabs owned inside (including in `Misc`).
- Filing/bulk: folder target → `Misc`.
- Delete: ownership entries for all subtree leaves become Unassigned without closing.

## Feature 6 — Quick capture

`captureParser.ts`:

- `parseCaptureInput` — `@Project` token may contain `:`; the regex already takes "everything after the last @"; ensure trailing whitespace handling keeps spaces in names and `:` in the project token.
- `getProjectAutocomplete(partial, projectPaths, allowCreate)` — consider both exact-path matches and **descendant expansion**: if `partial` matches a folder path prefix, append its children with the `:` split (limit to a sane count, e.g. 8 total). Return the canonical path as `value`.
- `resolvePath` used by the popup for capture dispatch.

`QuickCapture.tsx`:

- On submit: `resolvePath(state, parsed.projectName)`; miss + create-allowed → build the missing chain via `CREATE_SUBPROJECT`/`CREATE_PROJECT` messages (reuse the existing create-then-READ_STATE pattern), then capture with the deepest node's id through the existing `FILE_LIVE_TAB`.
- Duplicate-URL handling stays: existing record in the resolved leaf gets tags appended + note concatenated.
- Existing chips ("Already saved in") fill the full `:` path.

### Tests

- Parse `a #t @Par:Child:Leaf` and `@Root` and empty.
- Autocomplete: typing `@TestProj` surfaces `@TestProj:SubA`/`@TestProj:SubB`; deeper partial surfaces grandchildren.
- Resolution + auto-create chain produces the right nesting; creation-off path errors.

## Feature 7 — Sidebar tree UI

`App.tsx` sidebar:

- Build an ordered tree from roots (`parentId == null`) as a recursion; render indentation + chevron for folders; expanded/collapsed is component state (default: expanded).
- Leaf canvas unchanged; folder canvas shows `Misc` leaf URLs + child rows to drill in, or an empty-folder state with a "New sub-project" affordance.
- Context menu: add **New sub-project** (validates sibling name); keep existing items, now wording "Export", "Archive (subtree)" etc.
- Drag-to-nest: a drop on a folder row nests (`REPARENT_PROJECT` with `toIndex` = end) when the source is not the folder or its descendant; a drop between rows reorders (`REORDER_PROJECT`). Reuse the 5px threshold and dragOver highlighting.
- Counts: folder badge = subtree URL count.
- Delete dialog shows subtree counts.
- Auto-select after delete uses `chooseSelection` against surviving roots (extend to the next sibling/orphan).

### Tests (`App.test.tsx`)

- Renders tree with indentation and expand/collapse.
- New sub-project from context menu appears under the parent; `Misc` appears when the parent had URLs.
- Drag-to-nest issues `REPARENT_PROJECT`; cycle attempt surfaces an error and leaves the tree intact.
- Folder counts aggregate; archived folder shows in archived section.

## Feature 8 — Export / import

`generateHtml.ts`:

- Serialize a node recursively: folder → `<section class="subproject"><hX>name</hX>` containing children; leaf → existing URL cards. Preserve root `<title> — Protab Export` detection.
- Root export recursion drives ZIP.

`parseImport.ts`:

- Parse nested sections back into a tree; `ImportedProject` becomes a node with `name` + `children` + `savedUrls`.
- Merge by path: existing path → merge URLs (skip exact duplicates), new path → create chain.

### Tests

- Folder export → parse → same names + nesting (round-trip).
- ZIP of roots → each root HTML is recursive.
- Merge-by-path conflict behavior.

## Feature 9 — Docs

- `design_decisions.md`: add a "Nested projects" section capturing the six locked decisions (pure folders; subtree activation; `:` paths + descendant autocomplete; delete-subtree; **auto-wrap to `Misc`**; auto-create missing path), each stated as a rule, with the explicit non-magic `Misc` note.
- `README.md` + `docs/quickstart.md`: brief nested-projects coverage (folders vs leaves, `Misc`, paths in quick capture).
- `spec/phase-6/what.md` and `how.md`: this document set. Update `development_phases.md` status and the deferred-features list.

## Test summary

New/updated suites: `migration.test.ts`, `storage.test.ts` (validation/tree), `tree.test.ts` (new), `applyCommand.test.ts` (nested commands), `captureParser.test.ts`, `App.test.tsx` (tree UI), `coordinator.test.ts`/`filing.test.ts` (subtree background), `generateHtml.test.ts`/`parseImport.test.ts` (round-trip). Full baseline (209 passing today) must stay green plus the new cases.

## Known risks and mitigations

- **Cycle/validation regression**: tree invariants are enforced in `validateProjects` (storage) and in `applyCommand` (mutation), both unit-tested.
- **Ownership cleanup on delete**: the orphan path is explicit (tabs → Unassigned, never closed) and covered by coordinator tests.
- **`:` in legacy names**: V2 data is untouched by migration; only new creates/renames reject `:`.
- **Autocomplete cap**: descendant expansion + fuzzy matches are bounded (8 suggestions) to keep the popup responsive.
