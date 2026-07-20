# Phase 2 — What to build

## Outcome

Connect the persistent workspace to Chrome's live tabs without closing any of them. The Current Tabs pane shows only the workspace window, makes project ownership understandable, and lets saved URLs open with explicit ownership.

Phase 2 is complete when users can distinguish project-owned and unassigned tabs, resolve ambiguous ownership, focus an existing project tab, and intentionally open another copy.

## Prerequisite

Phase 1 is implemented and passes its acceptance checklist. Phase 2 must extend its storage and Chrome boundaries rather than replacing them.

## Current-window inventory

- Show every ordinary tab in the Chrome window containing the workspace.
- Exclude all Protab workspace tabs.
- Never show tabs from another window.
- Keep the list current as tabs are created, updated, activated, moved within the window, or removed.
- Show title, hostname or URL summary, favicon when safely available, and ownership state.
- HTTP(S) tabs are saveable. Other schemes remain visible but are marked unsupported and cannot be assigned or saved in V0.
- Missing permissions or Chrome API failures produce an explicit pane error without affecting persistent project data.

## Ownership model

- Each live tab has zero or one project owner.
- Multiple live tabs with the same URL remain distinct instances and may have different owners.
- Ownership is established when Protab opens a saved URL or when the user explicitly assigns an ambiguous matching tab.
- Runtime ownership survives extension service-worker suspension.
- A browser restart uses best-effort reconciliation and never closes, opens, moves, or rewrites a tab.
- A tab retains ownership provenance when it navigates. Preserve the URL and saved-record identity that established ownership so later phases can detect navigation drift, but display the drifted row under **Unassigned** as **Navigated from saved URL** until a fresh filing decision.

After runtime ownership is unavailable:

1. If the current URL is saved in exactly one project, associate the live tab with that project.
2. If it is saved in multiple projects, leave the tab unassigned and show those projects as candidates.
3. If it matches no saved record, leave it unassigned.

Reconciliation changes only live ownership. It never creates, edits, moves, or deletes saved records.

## Groups and assignment

- Group live tabs under their owning project and an **Unassigned** section.
- Follow persistent project ordering; show Unassigned last.
- Group headers show counts and may collapse independently as workspace-local UI state.
- Preserve each tab's Chrome tab-strip order within its group.
- Selecting a live-tab row focuses that Chrome tab.

**Assign to…** is available only when an unassigned tab's exact URL already exists in one or more projects. It selects one existing project record as owner, keeps the tab open, and does not alter saved metadata. Filing a new unassigned URL remains Phase 3.

## Opening saved URLs

Each saved URL accordion gains **Open** and an overflow action **Open another copy**.

**Open** uses this precedence in the workspace's Chrome window:

1. Focus the most recently used live instance already owned by the same saved record whose current exact URL still matches that record.
2. Otherwise, if an exact matching unassigned tab can be associated unambiguously with this record, assign and focus it.
3. Otherwise create a new tab owned by the selected project and saved record.

Never steal a matching tab owned by another project. Open a separate instance instead.

A drifted instance retains ownership provenance for counts, Open exclusion, and later close review, but appears under **Unassigned** rather than its former project group. Open creates or reuses a current exact match instead of focusing the drifted tab.

**Open another copy** always creates a new owned tab, even when matching instances exist. Shift-clicking Open may provide the same shortcut. The saved accordion shows the number of instances it currently owns.

When a page loads successfully, an automatic title may refresh from the browser tab title. A custom title is never overwritten.

## Project deletion with live tabs

- Confirm deletion and report both the number of saved URLs removed and owned live tabs affected.
- Delete the project and its saved records using the Phase 1 behavior.
- Keep every owned live tab open and move it to Unassigned.
- Never invoke tab closing as part of project deletion.

## Interface changes

- Replace the Phase 1 Current Tabs placeholder with grouped live data.
- Use the Stitch right-pane proportions and compact row density, but not its fake content or Clear all control.
- Distinguish selected browser tab, project ownership, unsupported state, and ambiguous state without relying on color alone.
- Truncate long titles visually while preserving an accessible full label.
- Every row and ownership action is keyboard accessible.
- Do not add Activate, Open all, Close all, filing, drag-and-drop, or automatic domain tags yet.

## Error behavior

- A failed tab query leaves persistent project data untouched and exposes a retry action.
- A failed focus or create operation identifies the affected saved URL and permits retry.
- If a tab disappears during an action, reconcile the inventory without treating it as persistent-data corruption.
- Runtime ownership pointing to a missing project or saved record is discarded and the live tab becomes unassigned.
- Startup and reconciliation never call a tab-create, tab-remove, or project mutation operation.

## Acceptance criteria

- **P2-A1:** The Current Tabs pane accurately follows only its workspace window and excludes Protab tabs.
- **P2-A2:** Project and Unassigned groups update after tab lifecycle events without a workspace reload.
- **P2-A3:** Each live tab has at most one owner; identical instances can retain different owners.
- **P2-A4:** Explicit ownership provenance survives navigation and service-worker suspension; drifted rows appear under Unassigned.
- **P2-A5:** Restart reconciliation assigns only unique matches and leaves ambiguous matches unassigned with candidates.
- **P2-A6:** Assign to keeps a matching tab open and changes no saved record.
- **P2-A7:** Open focuses an eligible existing instance or creates one according to the stated precedence.
- **P2-A8:** Open another copy always creates another owned instance.
- **P2-A9:** Automatic titles may refresh after successful opening; custom titles remain unchanged.
- **P2-A10:** Deleting a project keeps its live tabs open and makes them unassigned.
- **P2-A11:** Unsupported tabs remain visible but cannot be assigned or saved.
- **P2-A12:** No Phase 2 action closes a browser tab.

## Manual acceptance checklist

1. Open two Chrome windows with different tabs and verify each workspace shows only its own window.
2. Create and close ordinary tabs and verify the pane updates without reload.
3. Open a saved URL, navigate it elsewhere, and verify it moves to Unassigned with **Navigated from saved URL** without changing the saved URL or losing provenance.
4. Use Open twice and confirm the second action focuses the existing owned instance.
5. Use Open another copy and confirm two separately listed instances.
6. Open identical URLs from different projects and verify their owners remain independent.
7. Create an ambiguous duplicate-URL case, remove runtime ownership, and verify it becomes unassigned with candidates.
8. Assign that tab to one candidate and verify it remains open and no saved metadata changes.
9. Delete a project with live tabs and verify those tabs remain open under Unassigned.
10. Restart Chrome and verify reconciliation is non-destructive.
11. Exercise the right pane and opening actions using keyboard only.
12. Verify unsupported Chrome and extension pages are visible, clearly marked, and not assignable.

## Explicitly out of scope

Tab closing, drag or keyboard filing, File all unassigned tabs, Activate, Open all, Close all, changed-URL close warnings, automatic domain tags, pinning, statuses, search, archive/history, settings, import/export, and sync.
