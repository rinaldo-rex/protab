# Phase 6 — Nested projects (What to build)

## Outcome

Projects can be organized into a single-rooted tree of folders and leaves. A **folder** contains sub-projects; a **leaf** contains saved URLs. Saved URLs are never stranded: every URL belongs to exactly one reachable project in the tree, and durable meaning (ownership, activation, counts, export, import) is **subtree-scoped**. Users can create, relocate, rename, archive, and delete whole subtrees, and can target any node from quick capture using a `:`-separated path such as `@Client work:API docs`.

Phase 6 is titled **Nested projects**.

## Prerequisite

Phase 4D/5 is complete. Durable V2 storage, archive/export/import, quick capture, hover filing, drag-to-rearrange, settings, protected tabs, and the shared programmatic-close workflow all exist and pass their tests. Migration already flows through `storage/schema.ts` → `domain/migration.ts`, and both workspace and background read the same `PersistedState`.

---

## Feature 1 — Data model and migration (schema V3)

### Shape

Keep the flat project array and introduce an adjacency edge:

```ts
interface ProjectV3 {
  id: string        // unchanged: globally unique
  name: string      // unchanged
  parentId: string | null  // NEW: id of the containing project, or null for a root project
  savedUrls: SavedUrlV3[]  // unchanged (a leaf project holds URLs)
  archivedAt: number | null
}
```

- `PersistedStateV3 = { schemaVersion: 3, projects: ProjectV3[] }`.
- `SavedUrlV3` is identical to `SavedUrlV2`. No URL record changes.
- The tree is **single-rooted**: every project is reachable by following `parentId` from some `null` root, and `parentId` always references an existing project (or `null`). No cycles, no dangles. A project's `parentId` may not equal its own id or an id inside its own subtree.
- `projectId` remains the global identity used by live-tab ownership, the active-project store, and every command. Subtree behavior is derived from the tree, not stored separately.

### Migration V2 → V3

- `domain/migration.ts` adds `migrateV2ToV3`, which copies each project unchanged and sets `parentId: null`. Existing data becomes a flat forest of root projects.
- `CURRENT_SCHEMA_VERSION` in `storage/schema.ts` becomes `3`.
- `validateProjects` is generalized to validate the tree: it accepts `parentId` (string or null), enforces that every `parentId` references a present project, rejects cycles, and preserves all existing URL/tag/name checks.
- The V1 → V2 → V? path continues to work; the legacy-data backup/selective-import flow is unchanged in behavior but now migrates all the way to V3 before presenting legacy options.

---

## Feature 2 — Names, paths, and identity

- **Sibling uniqueness.** Two children of the same parent may not share a name (case-insensitive). Roots share one name space. Other branches may reuse names freely (`A:Foo` and `B:Foo` are both legal).
- **Canonical path.** The address of a project is its colon-joined sibling names from the root: `Parent:Child:Leaf`. This is the string used by quick capture and by import merging.
- **Reserved character.** `:` is not allowed in a project name (it is the path separator). Existing names containing `:` cannot be created/moved but existing V2 data is untouched by migration; validation of new writes rejects `:`.
- **No empty names** (existing rule) and names remain ≤ 80 chars.
- The sidebar may show a project's full path as a `title`/breadcrumb and may truncate long ones; the canonical form lives in the path helper, not in the stored record.

---

## Feature 3 — Folder/leaf semantics and the Misc leaf

A project node is either a **leaf** (holds saved URLs) or a **folder** (holds sub-projects). A node in both states is a transient that the product resolves, never silently:

- **Rule A (auto-wrap).** When a child is added to a node that has saved URLs, the node's URLs are first moved into a leaf child named `Misc` (created if needed; merged into an existing `Misc` child if one is present). Only then is the new child created. The node becomes a folder; its URLs now live in `Misc`.
- **Rule B (filing target).** When a save is targeted at a folder (via quick capture, the Add URL form, hover-filing, or File all), the URL is stored in that folder's `Misc` leaf, creating it if missing. A folder never accumulates its own direct URLs.
- **Rule C (stable state).** As a result, in any settled tree, every node with children has an empty `savedUrls` array, and every URL is stored in a node with no children (a leaf). The only way a node holds both is mid-operation, during a single atomically-applied command.

These rules are a **documented contract, not a silent surprise**: this document, the quickstart/README, and `design_decisions.md` describe the `Misc` behavior explicitly so users know why a folder shows a `Misc` leaf after they add a sub-project or file into a folder.

The `Misc` name is reserved the same way `:` is: if a node's `Misc` child exists, saving/wrapping reuses it instead of creating duplicates.

---

## Feature 4 — Commands (domain)

`applyCommand` gains subtree support. All existing commands remain, with semantics extended where the tree requires it.

- `CREATE_SUBPROJECT { parentId: string; name: string }` — validates the parent exists, validates sibling uniqueness, applies Rule A (auto-wrap), then creates the child with `parentId`. Root creation remains `CREATE_PROJECT` (sets `parentId: null`).
- `RENAME_PROJECT { projectId; name }` — validates sibling uniqueness and the `:` restriction against the project's parent.
- `REPARENT_PROJECT { projectId; newParentId: string | null; toIndex?: number }` — moves a project (with its whole subtree) to become the `toIndex`-th child of `newParentId` (or a root when `null`; default `toIndex` = end of the target's children). Applies Rule A if the target has URLs. Rejects:
  - reparenting under the project's own descendant (cycle),
  - reparenting a project under itself,
  - sibling-name collisions in the destination.
- `REORDER_PROJECT { projectId; toIndex }` — reorders within the project's **own sibling group** (root group when `parentId` is null). Same command name as today; semantics broaden from "root list only" to "sibling list".
- `DELETE_PROJECT { projectId }` — removes the project **and its entire subtree**; meta returns the full deleted id set (`deletedProjectIds`). Live tabs owned by any deleted project become Unassigned and stay open.
- `ARCHIVE_PROJECT { projectId; archived }` — archives/unarchives the **entire subtree**; meta returns the affected id set.
- `CREATE_SAVED_URL` / `FILE_LIVE_TAB` / `COPY_SAVED_URL` — targeted at a folder, these resolve to the folder's `Misc` leaf (Rule B) instead of erroring; targeted at a leaf, behavior is unchanged.

New domain helpers in a dedicated module (e.g. `domain/tree.ts`) shared by workspace and background:

- `childrenOf(state, projectId)` / `siblingsOf(state, projectId)`
- `isDescendant(state, projectId, ancestorId)`
- `subtreeIds(state, projectId): string[]`
- `subtreeProjects(state, projectId): Project[]`
- `subtreeSavedUrls(state, projectId): SavedUrl[]` (all leaves' URLs, plus roots' URLs by Rule C semantics)
- `pathOf(state, projectId, sep = ':'): string`
- `resolvePath(state, path): Project | undefined`
- `bootstrapChildren(state, projectId): ...` — applies the Misc rules during mutations.

---

## Feature 5 — Subtree operations (aggregation)

Activation, Open all, Close all, File all, counts, and export all treat a folder and its descendants as **one unit**.

- **Counts**: a folder's count (sidebar badge, export, dialogs) is the sum over its subtree of active and archived URLs. A leaf shows its own.
- **Activation** (current-window only): closing targets live tabs owned by any project **outside** the activated project's subtree; tabs owned within the subtree are kept. Unassigned and protected tabs remain untouched, as today.
- **Open all**: opens all non-archived URLs across the subtree; already-open URLs are focused, not duplicated.
- **Close all**: closes live tabs owned by any project in the subtree.
- **File all unassigned**: unchanged (it files unassigned tabs into the targeted project; Rule B applies when the target is a folder).
- **Deletion**: deleting a folder deletes the subtree; the confirm dialog shows the subtree's total URL count and how many tabs will become Unassigned.
- **Active project**: the stored active project remains a single leaf/folder `projectId`. Activation of a parent simply changes the "in-subtree" test against that id.

---

## Feature 6 — Quick capture with paths and autocomplete

- **Path syntax.** After `@`, users type `@Parent:Child:Leaf`. `parseCaptureInput` treats the whole `@...` run as the path (names may contain spaces; `:` is reserved, so splits are unambiguous).
- **Resolution.** Exact path match wins. If the path is missing and `allowQuickCaptureCreateProject` is on, the missing chain is auto-created (`mkdir -p` style) and the capture files into the deepest node (Rule B for folders). If creation is off, error and keep the popup open, as today.
- **Autocomplete (the requested behavior).** When the typed fragment names a folder, the suggestions surface that folder's sub-projects using the `:` split, e.g. typing `@TestProj` offers `@TestProj:SubA`, `@TestProj:SubB`, plus deeper descendants as the user types. Also list non-nesting matches (a project whose path contains the fragment). Selecting a suggestion fills the `:`-joined path.
- **Create-new suggestions** remain (`+ Create '…'` with the full path).
- `@ProjectName` back-compat: a single-segment path that matches a root project still works exactly as today.

---

## Feature 7 — Sidebar tree UI

- **Tree rendering.** The project list renders the tree with indentation per depth and expand/collapse chevrons for folders. State (collapsed/expanded) is transient UI state per mount/session.
- **Selection** still shows the project's URLs; for a folder, the canvas shows the folder's `Misc` leaf URLs if present, plus a sub-project list to drill into (or an expander). (Concrete canvas for folders: see how.md.)
- **Create sub-project.** A folder's context menu gains **New sub-project**; the existing "New project" creates a root. `Shift+N` still creates a root project.
- **Drag to nest.** Dragging a project row onto a folder nests it under that folder (Rule A applies if the target has URLs). Dragging between rows reorders within the current sibling group. Dragging a folder onto one of its own descendants is rejected with a toast/error. The existing 5px movement threshold and reorder affordances are preserved.
- **Context menu** gains subtree language: Activate/Open all/Close all/Archive operate on the subtree; Delete shows the subtree total.
- **Archived projects**: an archived folder collapses its subtree into the archived section as one unit.

---

## Feature 8 — Export / import round-trip

- **Single export** of any node serializes its whole subtree: leaves render their URL cards; folders render a titled, nested section that contains their children's sections. Exported HTML remains self-contained and offline.
- **Import** parses that structure back into the same tree (names/paths), restoring nesting.
- **Export all** produces a ZIP with one HTML per **root** project (each recursive).
- **Conflict handling**: import merges by path (case-insensitive). A conflict at any depth offers merge-into-existing-path or create-as-new (suffixed). Non-conflicting branches import automatically as today.
- Rule C means the round-trip is faithful: `Misc` leaves round-trip as ordinary leaves.

---

## Feature 9 — Scope and safety notes

- No place in the product breaks the "**save before close, close is explicit**" contract. Subtree operations still prepare → confirm → summarize, and success/failure/skipped reporting is preserved.
- Protected tabs (Chrome-pinned, audible, Protab-pinned) are still never closed by any subtree operation.
- Tab ownership stays keyed by leaf `projectId`; only the set of "related" projects (the subtree) expands.

### Out of scope for v1

- Keyboard reordering of the tree, full tree search/filter, moving URLs between subtrees in bulk, dragging URLs between folders, nested `Tags` sections, per-folder color/numbering, and collapsing the sidebar into a pure outliner. These remain deferred; note them in `development_phases.md`.

---

## Acceptance criteria

1. Migration from V2: every existing project becomes a root (`parentId: null`), all URLs/tags/notes/ordering preserved, schema version stamped `3`.
2. Storage validation rejects structural corruption (dangling `parentId`, cycles, self-parenting) and all existing invalid-data rules. Write-time validation (in `applyCommand`) rejects sibling-name collisions and `:` in names — this split keeps legacy flat data (which may contain duplicate root names) always loadable and migratable.
3. Adding the first child to a URL-holding project produces a `Misc` leaf containing those URLs, and the new child; writing an already-folder writes into its `Misc` leaf.
4. Reparenting moves the whole subtree; reparenting into a descendant is rejected; sibling collision into a new parent is rejected.
5. Deleting a folder deletes the subtree and returns every deleted id; its live tabs become Unassigned and are not closed.
6. Activating a folder closes tabs owned outside the subtree only; Open all/Close all/Archive and counts are subtree-scoped.
7. Quick capture resolves `@Parent:Child`, autocompletes descendants with the `:` split, and auto-creates a missing path when permitted.
8. Sidebar renders the tree with expand/collapse, supports nesting via drag, and creates sub-projects from the context menu.
9. Export of a folder includes its subtree; importing a single exported HTML restores the same names and nesting (or merges by path on conflict).
10. `npm test`, `npm run lint` (product code), and `npm run build` pass. New coverage: migration, tree helpers, path parse/autocomplete, command edge cases, export/import round-trip, and workspace UI.
