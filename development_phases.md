# V0 delivery phases

Each phase ends with an installable, demonstrable extension. Commits within a phase should stay independently reviewable and keep all checks green.

Phase 1 establishes the exact development commands. The intended command contract is:

- `npm test` — automated tests
- `npm run lint` — static checks
- `npm run build` — production extension build

Every later phase runs all three commands plus its manual Chrome checks.

## Phase 1 — Persistent project workspace

**Outcome:** An installable extension that opens as a dedicated full-page workspace and is already useful as a local project-based URL organizer.

### Atomic commits

1. Add the installable Chrome extension, repeatable build, test baseline, and documented local loading steps.
2. Add versioned local persistence for projects and saved URL records, including automatic/custom title provenance, validation, and version-dispatch tests.
3. Add the three-pane workspace shell with keyboard-accessible project creation and selection.
4. Add project rename, ordering, confirmation, and deletion when no live-tab ownership exists yet.
5. Add basic saved URL creation, editing, and deletion with titles, multiple tags, and notes.
6. Add URL ordering, global tag autocomplete, and one-time cross-project metadata copying.
7. Add toolbar behavior that opens or focuses one workspace per Chrome window.

### Definition of done

- Project and URL management works without any live-tab integration.
- The same URL is deduplicated within one project and allowed across different projects.
- Data survives workspace reloads and a normal Chrome restart.
- Empty states explain how later tab-filing behavior will work without presenting dead controls.

### Tests

- Run `npm test`, `npm run lint`, and `npm run build`.
- Cover project and record CRUD, ordering, URL deduplication, title provenance, tag autocomplete, storage validation, and version dispatch with automated tests.
- Load the built unpacked extension in Chrome. In each of two windows, click the toolbar twice and verify it focuses that window's single workspace.
- Create two projects, copy the same URL between them, edit their tags and notes independently, reload, and verify later edits do not synchronize.
- Restart Chrome and verify projects, records, ordering, and edits persist.

### Entry decisions

Resolve and record URL equivalence rules and project deletion behavior before implementing their corresponding commits.

## Phase 2 — Live-tab visibility and ownership

**Outcome:** The workspace accurately shows the current window's tabs, groups them by project or **Unassigned**, and can open saved records with explicit ownership.

### Atomic commits

1. Add a current-window tab inventory that excludes Protab and handles unsupported pages or missing permissions clearly.
2. Add one-owner-per-tab associations and grouped project and **Unassigned** sections.
3. Add keyboard-accessible **Assign to…** without closing or changing saved records.
4. Add individual **Open** behavior that focuses the most recently used matching instance or creates an owned tab, refreshing only automatic titles.
5. Add **Open another copy**, multiple-instance counts, and independent ownership for identical live URLs.
6. Add best-effort ownership reconciliation that preserves ownership through navigation and retains the original URL for later drift detection.
7. Complete the chosen project-deletion behavior for projects that own live tabs.

### Definition of done

- The right pane follows only the Chrome window containing the workspace.
- Tabs opened from a saved record immediately appear under the correct project.
- Multiple instances of one URL can coexist and have independent owners.
- Ambiguous matches become unassigned and display their candidate projects.
- Navigating an owned tab preserves its ownership provenance and saved URL, but displays the drifted live row under **Unassigned** with **Navigated from saved URL**.

### Tests

- Run all automated checks; cover tab grouping, assignment without closing, ownership precedence, navigation, ambiguous matching, automatic-title refresh, custom-title preservation, project deletion, focus-existing, and open-another behavior with Chrome API test doubles.
- Open two Chrome windows with different tabs and verify each workspace view uses only its own window.
- Open one saved URL twice through the two available actions and verify focus-versus-new-instance behavior.
- Navigate an owned tab away from its saved URL and verify it appears under Unassigned with **Navigated from saved URL** while the saved record and provenance remain unchanged.
- Save one URL in two projects, remove recoverable ownership in the test setup, and verify the live tab becomes unassigned while both records remain.

### Entry decision

Choose and document the supported URL schemes and live-owned project deletion policy before implementing them.

## Phase 3 — Deliberate tab filing

**Outcome:** The core declutter loop works under the approved programmatic-close policy: users can file an unassigned tab, persist its context, and request closure without false unsaved-change guarantees.

### Atomic commits

1. Add the shared programmatic close workflow with persist-first ordering, explicit confirmation, independent close observation, and honest API failure reporting.
2. Add drag-to-project filing plus a keyboard equivalent, with title/hostname fallback, deduplication, ownership updates, and programmatic-close handling.
3. Add **File all unassigned tabs**, excluding owned tabs, Protab, and unsupported pages, with clear partial-success reporting.
4. Add the initial automatic tag suggestions without overwriting or locking user tags.

### Definition of done

- A filed tab becomes a durable URL record before the selected close flow begins.
- Existing records are reused rather than duplicated.
- API and partial-operation failures are reported without rolling back successfully saved records.
- Bulk filing affects only unassigned, saveable tabs in the current window.
- The UI does not imply that Protab can detect unknown unsaved page state.

### Tests

- Run all automated checks; verify save-before-close ordering, programmatic close, API rejection, surviving-tab attention, deduplication, partial bulk success, hostname fallback, and editable/removable tag suggestions.
- Drag an unassigned tab into a project and reopen it from its saved accordion.
- Complete the same filing workflow without using drag and drop.
- Bulk-file a mix of unassigned, project-owned, workspace, and restricted tabs; verify only eligible unassigned tabs are filed.
- Verify the close flow's wording and behavior on a page with unsaved form state; it must describe programmatic close accurately and never promise a cancellable native warning.

### Entry decisions

The V0 programmatic-close policy and initial domain-to-tag mapping are recorded. A configurable close preference remains post-V0; its cross-workflow scope is intentionally undecided.

## Phase 4 — Deliberate project focus

**Outcome:** A user can activate one project for the current window and use project-wide controls without affecting unassigned tabs or other windows.

### Atomic commits

1. Add distinct selected and active project states with a clear **Activate** action and active-project indicator.
2. Add activation behavior using the shared programmatic-close workflow, leaving unassigned tabs open and pulsing their group.
3. Add keyboard-accessible, idempotent **Open all** with clear partial-failure reporting.
4. Add keyboard-accessible **Close all** using the shared programmatic-close workflow without deleting saved records.
5. Add changed-URL detection and confirmation before activation or bulk closing touches a navigated project-owned tab.
6. Add per-window focus isolation and safe handling when active-project recovery is uncertain.

### Definition of done

- Selecting a project never closes or opens a tab.
- Activating a project never opens tabs and never closes unassigned tabs.
- Open all does not create accidental duplicates; Close all never deletes saved records.
- Project actions in one window do not affect another window.
- Navigated tabs receive an explicit warning, and partial operation failures remain visible and actionable.

### Tests

- Run all automated checks; cover activation target selection, unassigned preservation, changed-URL confirmation, idempotent Open all, Close all, each action's partial failures, and window isolation.
- In one window, create owned tabs for two projects plus an unassigned tab; activate one project and verify only the other project's tabs are targeted.
- Repeat with a project-owned tab navigated away from its saved URL and verify confirmation appears before closing.
- Activate different projects in two windows and verify each window remains independent.

## Phase 4A — Export and archive

**Outcome:** Users can export projects as self-contained HTML files and archive saved URLs to separate active work from reference material.

### Atomic commits

1. Add V1→V2 schema migration with `archivedAt` field on saved URLs.
2. Add archive/unarchive commands and handlers in the domain and background layers.
3. Add archived section UI with collapsible display below active URLs.
4. Add archive context menu, keyboard shortcuts (`R` to archive/unarchive, `N` to focus notes), and shortcut hints on hover.
5. Add single project HTML export with inlined CSS, fonts, and icons.
6. Add export all projects as ZIP using `fflate`.
7. Add import via drag-and-drop or file picker for HTML and ZIP files, with conflict resolution.

### Definition of done

- Archived URLs appear in a separate collapsible section and are excluded from activation and Open all.
- Export produces self-contained HTML files that work offline with clickable links.
- Import recreates projects from exported HTML or ZIP files, with merge or create-new options for conflicts.
- Keyboard shortcuts work when hovering over any accordion (collapsed or expanded) via a global listener scoped by hover state.
- Schema migration preserves all existing data.

### Tests

- Run all automated checks; cover schema migration, archive/unarchive commands, export HTML generation, ZIP creation, and import parsing.
- Export a single project and verify offline HTML with all URLs, tags, and notes.
- Export all projects and verify ZIP contains one HTML per project.
- Archive a URL via context menu, keyboard shortcut, and the `⋯` menu; verify it moves to the Archived section.
- Unarchive a URL and verify it returns to Active.
- Verify archived URLs are not opened during activation or Open all.
- Import an HTML file with no conflict and verify project is created.
- Import an HTML file with a conflict and verify merge/create-new dialog.
- Import a ZIP and verify all projects are imported.
- Verify shortcuts `R` and `N` work on hover, including on collapsed accordions.

## Phase 5 — V0 recovery and release hardening

**Outcome:** The complete V0 workflow is resilient across restarts, failures, upgrades, keyboard use, and realistic multi-window sessions.

### Atomic commits

1. Harden startup reconciliation and, only if a real preceding schema exists, its migration while guaranteeing startup never closes tabs.
2. Audit focus management and accessible announcements across project, filing, pulse, confirmation, and failure flows.
3. Complete the V0 end-to-end regression suite.
4. Update installation, usage, privacy, and troubleshooting documentation for release.

### Definition of done

- Restarting or upgrading preserves durable data and never triggers a close operation.
- Every action is keyboard accessible and important state changes are announced.
- Partial failures explain what happened and retain all successfully persisted data.
- The README contains exact build, loading, and first-use instructions.
- All V0 behavior in `design_decisions.md` is covered by an automated or named manual test.

### Tests

- Run the complete automated check suite and production build from a clean checkout.
- Load the production build into a fresh Chrome profile and complete the full workflow: create, file, activate, reopen, duplicate, close, and restart.
- If a real previous schema exists, upgrade its fixture without data loss; otherwise verify that a future schema is rejected non-destructively.
- Exercise the workflow using keyboard-only navigation and a screen reader's basic announcements.
- Repeat the restart and activation matrix with two windows, duplicate URLs across projects, changed URLs, unassigned tabs, and forced Chrome API failures.

## Out of scope for these phases

Settings UI remains post-V0. A future automatic-close preference may default on and offer user-close handoff, but its scope across filing, activation, and Close all requires a later product decision. Pinning, task statuses, advanced search/filtering, nested projects, cloud sync, and Chrome Web Store publishing also remain post-V0 work.
