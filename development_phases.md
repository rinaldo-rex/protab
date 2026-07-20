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
2. Add versioned local persistence for projects and saved URL records, including automatic/custom title provenance and migration tests.
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
- Cover project and record CRUD, ordering, URL deduplication, title provenance, tag autocomplete, and storage migration with automated tests.
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
- Navigating an owned tab does not change its owner or overwrite its saved URL.

### Tests

- Run all automated checks; cover tab grouping, assignment without closing, ownership precedence, navigation, ambiguous matching, automatic-title refresh, custom-title preservation, project deletion, focus-existing, and open-another behavior with Chrome API test doubles.
- Open two Chrome windows with different tabs and verify each workspace view uses only its own window.
- Open one saved URL twice through the two available actions and verify focus-versus-new-instance behavior.
- Navigate an owned tab away from its saved URL and verify it remains in its project group while the saved record remains unchanged.
- Save one URL in two projects, remove recoverable ownership in the test setup, and verify the live tab becomes unassigned while both records remain.

### Entry decision

Choose and document the supported URL schemes and live-owned project deletion policy before implementing them.

## Phase 3 — Deliberate tab filing

**Outcome:** The core declutter loop works under an explicitly chosen close policy: users can file an unassigned tab, persist its context, and complete the close flow without false unsaved-change guarantees.

### Atomic commits

1. Add the chosen shared close workflow with persist-first ordering, explicit confirmation or user-close handoff, and honest API failure reporting.
2. Add drag-to-project filing plus a keyboard equivalent, with title/hostname fallback, deduplication, ownership updates, and close-policy handling.
3. Add **File all unassigned tabs**, excluding owned tabs, Protab, and unsupported pages, with clear partial-success reporting.
4. Add the initial automatic tag suggestions without overwriting or locking user tags.

### Definition of done

- A filed tab becomes a durable URL record before the selected close flow begins.
- Existing records are reused rather than duplicated.
- API and partial-operation failures are reported without rolling back successfully saved records.
- Bulk filing affects only unassigned, saveable tabs in the current window.
- The UI does not imply that Protab can detect unknown unsaved page state.

### Tests

- Run all automated checks; verify save-before-close ordering, deduplication, the selected close policy, API rejection, partial bulk success, hostname fallback, and editable/removable tag suggestions.
- Drag an unassigned tab into a project and reopen it from its saved accordion.
- Complete the same filing workflow without using drag and drop.
- Bulk-file a mix of unassigned, project-owned, workspace, and restricted tabs; verify only eligible unassigned tabs are filed.
- Verify the close flow's wording and behavior on a page with unsaved form state; it must match the chosen policy and never promise a cancellable native warning.

### Entry decision

Choose and document both the extension close policy and the small initial domain-to-tag mapping before starting this phase.

## Phase 4 — Deliberate project focus

**Outcome:** A user can activate one project for the current window and use project-wide controls without affecting unassigned tabs or other windows.

### Atomic commits

1. Add distinct selected and active project states with a clear **Activate** action and active-project indicator.
2. Add activation behavior using the chosen close policy, leaving unassigned tabs open and pulsing their group.
3. Add keyboard-accessible, idempotent **Open all** with clear partial-failure reporting.
4. Add keyboard-accessible **Close all** using the chosen close policy without deleting saved records.
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

## Phase 5 — V0 recovery and release hardening

**Outcome:** The complete V0 workflow is resilient across restarts, failures, upgrades, keyboard use, and realistic multi-window sessions.

### Atomic commits

1. Harden startup reconciliation and schema migration while guaranteeing startup never closes tabs.
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
- Upgrade from a fixture containing the previous storage schema and verify migration without data loss.
- Exercise the workflow using keyboard-only navigation and a screen reader's basic announcements.
- Repeat the restart and activation matrix with two windows, duplicate URLs across projects, changed URLs, unassigned tabs, and forced Chrome API failures.

## Out of scope for these phases

Settings UI, pinning, archive/history, statuses, advanced search/filtering, nested projects, import/export, cloud sync, and Chrome split-view management remain post-V0 work.
