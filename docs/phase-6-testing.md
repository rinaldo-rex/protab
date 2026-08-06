# Phase 6 Manual Testing Checklist

This checklist validates Phase 6 behavior (nested projects) against the production build in Chrome.

## Setup

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `dist/` directory.
5. Pin Protab if desired, then click its toolbar action to open the full-page workspace.
6. Create at least three root projects, then create a nested structure for testing:
   - `Client work` (root) → `API docs` (sub-project) → `Auth` (sub-sub-project)
   - `Personal` (root) with a saved URL
   - `Side project` (root) with a saved URL

> **Driving note.** These flows run against the real production build. If you drive them with pi-browser-harness, follow the guidance in `TESTING.md` (observe first, refs over coordinates); "Load unpacked" always stays a manual step.

---

## Feature 1: Data model and migration (schema V3)

> **Note:** Protab does not auto-migrate old data in place. When the durable data uses an older schema (V2 or earlier), it is preserved as a migration backup and offered for selective import from Settings. This applies to the V2 → V3 bump exactly as it did for V1 → V2 in Phase 4D.

### Legacy V2 data on startup (V2 → V3)

> **Note:** Create a V2 fixture by manually writing to `chrome.storage.local` under `protab.state` with `schemaVersion: 2` and valid flat project data (projects without `parentId`).

- [ ] Prepare a V2 fixture in `chrome.storage.local` under `protab.state` with `schemaVersion: 2` and valid project data.
- [ ] Load (or reload) the extension.
- [ ] Verify the workspace opens and Settings is shown automatically (legacy data available).
- [ ] Verify the Settings legacy-data section lists the old projects with their URL counts.
- [ ] Open DevTools → Application → Storage → Local Storage.
- [ ] Verify `protab.state.migrationBackup.latest` exists and contains the original V2 raw data (`fromSchemaVersion: 2`, `toSchemaVersion: 3`).
- [ ] Import the legacy projects (select all → import).
- [ ] Verify every imported project becomes a **root** (it has no parent) and all URLs/tags/notes are intact.
- [ ] To verify the backup path instead: use **Settings → restore migration backup**, then verify a confirmation explains the current data will be replaced; cancel (no change), then restore and verify the migrated projects appear.

### No migration needed (current V3 schema)

- [ ] Load the extension with existing V3 data (normal use after Phase 6).
- [ ] Verify no legacy-data notice appears and Settings does NOT show the legacy section.

### Future schema rejection

- [ ] Manually write `protab.state` with `schemaVersion: 99` and valid shape.
- [ ] Reload the extension.
- [ ] Verify the workspace shows an error ("created by a newer version", "unsupported schema version", or the blocking read-only state).
- [ ] Verify `protab.state` was NOT overwritten (still has `schemaVersion: 99`).
- [ ] Verify no tabs were closed.

### Invalid tree rejection (structural)

- [ ] Manually write `protab.state` with `schemaVersion: 3` where a project's `parentId` references a missing project (a dangling parent).
- [ ] Reload the extension.
- [ ] Verify the workspace enters the blocking storage-error state and leaves the raw value untouched.
- [ ] Repeat with a **cycle** (A → B → A) and verify the same blocking behavior.
- [ ] Verify no tabs were closed in any case.

> **Why this passes:** storage validation checks structure (parents exist, no cycles); sibling-name collisions and `:` in names are write-time rules (see Feature 3) so legacy flat data always loads.

---

## Feature 2: Sidebar tree and navigation

### Tree rendering

- [ ] Verify the sidebar shows `Client work` and that `API docs` is nested beneath it, indented.
- [ ] Verify `Auth` is nested (and indented) beneath `API docs`.
- [ ] Verify each folder shows a chevron (▶/▼) on the left.
- [ ] Hover over a project name and verify a tooltip shows its full path (e.g. `Client work:API docs:Auth`).

### Expand / collapse

- [ ] Click the chevron next to `Client work`.
- [ ] Verify `API docs` and `Auth` collapse out of the list.
- [ ] Click the chevron again; verify they re-appear.
- [ ] Verify collapse state survives navigating between projects (it is per-session UI state).

### Counts

- [ ] Verify leaf projects show their own URL count (e.g. `(1)` on `Personal`).
- [ ] Verify `Client work` shows an **aggregated** count that includes URLs in `API docs` and `Auth` (the whole subtree), not just its own (folders hold no URLs of their own).
- [ ] Archive a URL inside `API docs`; verify `Client work` shows `(n + 1)` with the `+1` archived marker.

### Selection and drill-in

- [ ] Click `Client work` and verify the canvas shows its sub-project `API docs` as a row and any URLs in its `Misc` leaf.
- [ ] Click the `API docs` row in the canvas; verify the canvas switches to `API docs`.
- [ ] Click `Auth` and verify it behaves like a normal leaf project.

### Folder canvas

- [ ] Select a folder that has a `Misc` leaf with URLs; verify a **"Misc (this folder's URLs)"** heading lists those URLs.
- [ ] Select an empty folder (no children, no `Misc` URLs); verify the "This folder is empty" state and a **New sub-project** affordance.
- [ ] Select a folder that has children but no `Misc` URLs; verify the "No URLs in Misc yet" state plus the sub-project list.

---

## Feature 3: Creating sub-projects

### New sub-project via context menu

- [ ] Right-click `Client work` (or any folder/leaf).
- [ ] Verify the menu contains **New sub-project**.
- [ ] Choose it; verify the inline form label reads **"Sub-project name (inside Client work)"**.
- [ ] Type `Design` and press Enter.
- [ ] Verify `Design` appears nested under `Client work`.

### Misc auto-wrap (the documented contract)

- [ ] Create a root project `Blog` and add a saved URL to it.
- [ ] Right-click `Blog` → **New sub-project**, name it `Writing`.
- [ ] Verify `Blog` now contains a **`Misc`** sub-project holding its former URL, plus `Writing`.
- [ ] Verify `Blog` itself shows no direct URLs (its badge reflects the subtree including `Misc`).
- [ ] Add ANOTHER sub-project under `Blog`; verify it reuses the existing `Misc` leaf (no duplicate `Misc`).

### Inline validation

- [ ] In the sub-project form, type a name that already exists among siblings (e.g. `API docs` under `Client work`).
- [ ] Verify an inline error appears and the project is not created.
- [ ] Create a root project named `A:B` (contains `:`).
- [ ] Verify an inline error explains that `:` is reserved, and the project is not created.
- [ ] Type a blank name; verify the existing "Enter a project name." error appears.

### Rename rules

- [ ] Rename a folder to match a sibling; verify the dialog shows an error and the name is unchanged.
- [ ] Rename a project to include `:`; verify the same reserved-character error.

---

## Feature 4: Arrange by dragging

### Nest onto a row

- [ ] Reset to: `Side project` is a root.
- [ ] Drag `Side project` and drop it **onto the `Client work` row**.
- [ ] Verify `Side project` becomes a child of `Client work` (nested/indented).
- [ ] Verify the whole subtree moved with it (if it had URLs/sub-projects, they came along).

### Misc wrap on nest

- [ ] Create a root `Notes` with a saved URL.
- [ ] Drag `Notes` onto `Client work`.
- [ ] Verify `Client work` gains a `Misc` leaf holding `Notes`'s URL (or merges into an existing one) and `Notes` becomes a child.

### Cycle rejection

- [ ] Drag `Client work` onto its own descendant `API docs`.
- [ ] Verify an error banner appears (a project cannot be nested inside its own sub-project) and the tree is unchanged.
- [ ] Drag a project onto itself; verify it is a no-op.

### Reorder within a group

- [ ] Within `Client work`, drag `API docs` to the **gap above** `Design`.
- [ ] Verify `API docs` now sits above `Design` (reordered, not nested).
- [ ] Drag across branches using a folder's child gaps (e.g. from `Client work`'s children into `Blog`'s children) and verify it lands in the target group at the chosen position.
- [ ] Drag a root project to a **root-level gap** and verify root order changes.

### Highlighting / affordances

- [ ] While dragging a project over another row, verify a clear "nest target" highlight appears.
- [ ] While dragging over a gap, verify the reorder line highlight appears.

---

## Feature 5: Subtree operations

### Activation (subtree-scoped)

- [ ] Have tabs owned by both `API docs` (inside `Client work`) and `Personal`.
- [ ] Activate `Client work`.
- [ ] Verify the `Personal` tab is closed (with confirmation), while the `API docs` tab **stays open** — even though its owner is a descendant, not the activated folder itself.
- [ ] Verify unassigned and protected tabs remain untouched (as in prior phases).

### Open all

- [ ] From `Client work`'s context menu choose **Open all active**.
- [ ] Verify every non-archived URL across `Client work`, `API docs` (and its children, and `Misc`) is opened, and already-open ones are focused rather than duplicated.

### Close all

- [ ] Have tabs owned inside `Client work`'s subtree open.
- [ ] From `Client work`'s context menu choose **Close all**.
- [ ] Verify tabs owned anywhere in the subtree are closed (after confirmation); tabs owned outside the subtree are untouched.

### Delete subtree

- [ ] Right-click `Client work` → **Delete project**.
- [ ] Verify the confirmation names the folder AND lists "its N sub-projects" plus the total saved-URL count across the subtree.
- [ ] Confirm; verify the whole subtree disappears.
- [ ] Have a tab owned by a descendant; verify after deletion it remains open and moves to **Unassigned**.

### Archive subtree

- [ ] Right-click a folder → **Archive**.
- [ ] Verify the folder and every descendant are archived; the archived section shows the folder as a single top-level entry (not its descendants separately).
- [ ] Unarchive; verify the whole subtree returns.

---

## Feature 6: Quick capture with paths

### Path syntax and autocomplete

- [ ] From any tab press `Ctrl+Shift+X` (`Cmd+Shift+X`).
- [ ] Type `@Client` and verify the autocomplete offers `@Client work` **and** its sub-projects with the `:` split: `@Client work:API docs`, `@Client work:Design`, `@Client work:Side project`, …
- [ ] Keep typing `@Client work:AP` and verify it narrows to `@Client work:API docs`.
- [ ] Select a suggestion and verify the full path fills in.

### Resolve and capture

- [ ] Capture `some note #blog @Client work:API docs` and submit.
- [ ] Verify the URL is saved under `API docs` (the leaf), not under `Client work`.
- [ ] Verify the tags and note appear in `API docs`.

### Capture into a folder → Misc

- [ ] Capture `@Client work` (just the folder).
- [ ] Verify the URL lands in `Client work`'s `Misc` leaf (created if missing) and the success message shows the folder name.
- [ ] Capture the same URL again into `Client work`; verify it is reused (tags appended / note concatenated) rather than duplicated, and no second record appears in `Misc`.

### Auto-create missing path

- [ ] In Settings, verify **"Allow creating new projects"** is enabled.
- [ ] Capture `@Newroot:Fresh sub` where neither exists.
- [ ] Verify `Newroot` and `Fresh sub` are created in a chain and the URL lands in `Fresh sub`.
- [ ] Disable creation in Settings; capture a nonexistent path and verify it shows an error naming the project path, and the popup stays open.

### Existing-save chips

- [ ] Open quick capture on a tab whose URL is already saved inside a nested project.
- [ ] Verify the "Already saved in" chip shows the full path (e.g. `Client work:Misc` or `Client work:API docs`), and clicking it fills `@` that path.

---

## Feature 7: Export / import round-trip

### Export a folder (includes subtree)

- [ ] Right-click `Client work` → **Export**.
- [ ] Verify the downloaded HTML opens offline and is fully styled/clickable.
- [ ] Verify the header count equals the subtree total (URLs in `Client work`'s `Misc`, `API docs`, `Auth`, etc.).
- [ ] Verify the HTML contains titled nested sections for each sub-project (`API docs`, `Auth`, `Design`, `Misc`) with their own URL cards.

### Import rebuilds the tree

- [ ] Delete `Client work` (or import into a fresh profile).
- [ ] Drag the exported HTML onto the sidebar import zone.
- [ ] Verify the whole tree is recreated with the same names and nesting (folders → children), and all URLs/tags/notes are restored.

### Export all → ZIP per root

- [ ] Use **Export all** in the sidebar.
- [ ] Verify the ZIP contains one HTML per **root** project (never one per sub-project), each embedding its subtree.

### Merge by path (import conflict)

- [ ] Import an exported `Client work` HTML while a `Client work` already exists (same root name).
- [ ] Verify the conflict dialog appears (merge vs. create-with-suffix).
- [ ] Choose **Merge**; verify the root URLs merge (duplicates skipped) and sub-projects either merge by path or are created fresh where missing.
- [ ] Choose **Create new**; verify a suffixed root (`Client work (2)` style) is created with the full subtree.

---

## Feature 8: Filing live tabs into folders

- [ ] In the current-window tabs pane, hover an unassigned tab and press `A` while a **folder** is selected.
- [ ] Verify the URL is saved into that folder's `Misc` leaf and the tab closes (honoring protection rules from Phase 4D).
- [ ] Verify the Current Tabs group for the owned tab is labeled with the leaf's path (e.g. **`Client work:Misc`**), not loosely "Client work".
- [ ] Verify **File all unassigned** into a folder also routes to its `Misc` leaf and reports normal counts.

---

## Console and network review

- [ ] Open the background service worker console.
- [ ] Perform Phase 6 operations (create sub-project, Misc wrap, nest/reorder drags, subtree activation/delete/archive, path quick-capture, nested export/import).
- [ ] Verify no unhandled errors.
- [ ] Open the Network tab; verify no Protab fetches (all operations are local).

## Manifest permissions

- [ ] Verify `manifest.json` still contains `["storage", "tabs", "activeTab", "contextMenus"]`.
- [ ] Verify no host permissions or content scripts were added by Phase 6.

## Production build

- [ ] Run `npm run build` and verify it completes without errors.
- [ ] Run `npm test` and verify all tests pass (Phase 6 baseline: 247 passing).
- [ ] Run `npm run lint` on product code (`src/`) and verify no lint errors (known pre-existing ES issues exist only in `.pi/skills/web-test/scripts/*.js` — out of product scope).
- [ ] Load the production build from `dist/` and verify all Phase 6 features above.

## Copy review

- [ ] Verify the empty/comment copy explains the `Misc` leaf as a **documented behavior**, never a surprise (see design_decisions.md "Nested projects" section).
- [ ] Verify validation copy for `:` calls it a reserved path separator (no ambiguous wording).
- [ ] Verify delete-subtree copy shows the sub-project count and total URL count before confirming.
- [ ] Verify no UI text implies Protab can detect unsaved form state or video calls (per prior phases).
