# Phase 4D — What to build

## Outcome

Add safe update handling, protected live tabs, and a first-use quickstart. Users can update Protab without losing durable project data, prevent important live tabs from being closed by any Protab close workflow, and learn the core save–close–reopen loop from a concise guide.

Phase 4D is titled **Safe updates, protected tabs, and quickstart**.

## Prerequisite

Phase 4B is complete. The extension has durable V2 project storage, archive/export/import, quick-capture, hover filing, drag-to-rearrange, settings, and the shared programmatic-close workflow used by filing, activation, Close all, and quick-capture close behavior.

---

## Feature 1: Selective legacy data import

### Goal

When users update Protab from a version with an older durable schema, the old data is preserved as a backup and presented as an importable resource. Users review what’s in the old data, select which projects to import, and explicitly import them. This replaces silent automatic migration with a transparent, user-controlled flow.

### Durable data scope

Migration applies to the durable project state stored under `protab.state`:

- projects
- saved URLs
- titles and title provenance
- tags
- notes
- URL ordering
- project ordering
- archive state
- future durable metadata added by later schemas

Migration does not treat live tab ownership, active project state, close attempts, or manual live-tab pins as durable project data. Those remain runtime/session state and may be reconstructed or cleared safely.

### Detection behavior

On startup or state load:

1. Read raw stored durable state.
2. If no state exists, initialize the current empty state.
3. If the state is already current, validate and continue.
4. If the state uses an older supported schema, validate the old shape.
5. Store the raw old data as a migration backup (without overwriting `protab.state`).
6. Initialize with an empty current-schema state.
7. Notify connected workspaces that legacy data is available.
8. Auto-open the Settings panel with the legacy data import section visible.

The old data is NOT silently migrated. It remains available as a backup for selective import.

If migration or validation fails:

- do not overwrite `protab.state`
- do not delete or close tabs
- do not attempt partial repair silently
- show a clear error state with recovery options where possible

If the stored state has a future unsupported schema version:

- do not downgrade it
- do not overwrite it
- show an unsupported-version error explaining that this Protab build cannot read newer data

### Import UI in Settings

When legacy data is detected, Settings shows a prominent import section at the top:

- **Old version warning**: A one-time dismissable warning that the old extension version should be removed to avoid storage conflicts.
- **Project list**: Each project from the old data is shown with its name, URL count, and archived count. All projects are selected by default with checkboxes.
- **Select all / deselect all**: Toggle all projects.
- **Import selected**: Primary action button that imports the selected projects.
- **Dismiss**: Secondary action that hides the import section (data remains available in Settings recovery area).

After import:
- Show a success message with the number of imported projects.
- Projects with the same name as existing projects are skipped (not overwritten).
- Merged state is broadcast to all connected workspaces.

### Import confirmation

Before importing, a confirmation dialog shows:
- The list of selected projects with URL counts.
- A note that projects with duplicate names will be skipped.

### Backup recovery area

The migration backup is also available in the Settings recovery section:
- **Export migration backup** — downloads the backup as JSON for manual safekeeping.
- **Restore migration backup** — confirms and restores the backup into `protab.state` (parses through the migration pipeline).

### User-facing copy

Detection copy:
> Previous version data found

Warning copy:
> If you still have the previous version of Protab installed, please remove it to avoid conflicts. Both versions share the same storage.

Import description:
> Protab found data from a previous version (schema vX). Select which projects to import into your current workspace.

Success copy:
> Successfully imported N projects.

Duplicate copy:
> Projects with the same name as existing projects will be skipped.

---

## Feature 2: Live-tab Pin / protected tabs

### Goal

Prevent Protab from closing tabs that should remain live, such as video calls, background music, currently playing videos, or tabs the user explicitly wants to keep open during cleanup.

### Protected sources

A live tab is protected if any of these are true:

1. **Pinned in Protab** — the user manually pins the live tab in the Current Tabs pane.
2. **Chrome pinned** — the tab is pinned with Chrome's native tab pinning.
3. **Playing audio** — Chrome reports the tab as audible.

All protected tabs use the same protected visual style, with source-specific labels so users understand why the tab is protected.

Suggested labels:

- `Pinned`
- `Chrome pinned`
- `Playing audio`

### Manual Protab pin behavior

Manual Protab pinning is session-only per live tab.

- Pinning applies to the exact live tab instance.
- It is not saved to the URL record.
- It does not permanently protect the URL.
- It disappears when the live tab is closed.
- It may be cleared when the browser or extension session resets.
- Protab must not guess that a future tab with the same URL should be pinned.

The Current Tabs pane provides a clear control to pin or unpin a live tab. The action must be keyboard accessible.

### Protected close behavior

Every Protab close workflow must respect protected tabs:

- drag-to-file tab close
- keyboard **File to project…** close
- hover `A` filing close
- **File all unassigned tabs**
- quick-capture close behavior when enabled
- project activation
- **Close all**
- archive-and-close when archiving an open URL
- any retry path that would issue another programmatic close request

If a protected tab would otherwise be closed, Protab skips the close request for that tab and reports it as skipped/protected. It must not call `chrome.tabs.remove()` for protected tabs.

### Skip and summarize

Protected tabs do not block the whole action. They are skipped and summarized.

Example summaries:

> 6 URLs saved or reused. 4 tabs closed. 2 tabs skipped because they were pinned or playing audio.

> Activation complete. 3 other-project tabs closed. 1 Chrome-pinned tab kept open.

Summaries should include enough detail to identify protected tabs and their protection reason.

### Relationship to unassigned tabs

Protection is independent of ownership.

- An unassigned tab can be protected.
- A project-owned tab can be protected.
- A drifted tab can be protected.
- Chrome-pinned and audible tabs are protected regardless of project owner.

Activation still leaves ordinary unassigned tabs open as before. Phase 4D adds the stronger rule that protected tabs are also kept open, even if they are owned by another project and would otherwise be activation targets.

### Safety copy

Protected tabs are a user-directed safety rule, not an unsaved-change detector. The UI must not imply that Protab can detect whether a page contains unsaved form state, an active call, or important work beyond the explicit and Chrome-reported signals above.

---

## Feature 3: Quickstart guide

Add `docs/quickstart.md` as a separate introductory guide.

The quickstart should explain:

- the pain Protab addresses: mixed-context tab clutter and resource-heavy reminder tabs
- the core mental model: saved URLs are durable, live tabs are temporary
- first cleanup flow for a messy window
- creating projects
- filing tabs
- quick-capture input with `#tag` and `@Project`
- activation as deliberate focus, not selection
- reopening saved URLs
- local/no-subscription use
- what Protab is not: not a replacement for bookmarks, read-it-later tools, or session managers
- important safety notes around unassigned tabs and close behavior

The guide may include screenshot placeholders but does not require actual images in Phase 4D.

Phase 4D creates the quickstart document only. Linking it from the README is deferred unless explicitly requested later.

---

## Acceptance criteria

- **P4D-A1:** Loading an older supported durable schema stores the old data as a backup and presents it as an importable resource with project-level selection.
- **P4D-A2:** The migration backup contains the pre-migration raw state and is created before any state is overwritten.
- **P4D-A3:** Detection failure leaves the original durable state untouched and shows a clear non-destructive error.
- **P4D-A4:** Future unsupported schema versions are rejected non-destructively.
- **P4D-A5:** Settings exposes the legacy data import section (when available) and migration backup export/restore.
- **P4D-A6:** Legacy data import shows a project checklist with URL counts and allows selective import.
- **P4D-A7:** Users can manually pin and unpin a live tab from the Current Tabs pane using mouse or keyboard.
- **P4D-A8:** Manually pinned tabs are session-only live-tab state, not saved URL metadata and not URL-wide rules.
- **P4D-A9:** Chrome-pinned tabs and audible tabs appear with protected styling and source-specific labels.
- **P4D-A10:** Every Protab close workflow skips protected tabs and never calls `chrome.tabs.remove()` for them.
- **P4D-A11:** Filing, activation, Close all, quick-capture close, archive-and-close, and retry summaries report protected skipped tabs with reasons.
- **P4D-A12:** Protected tabs do not block an entire bulk operation; unprotected eligible tabs still proceed.
- **P4D-A13:** The UI copy does not claim Protab can detect unsaved changes, video calls, or important page state beyond manual pins, Chrome-pinned state, and audible state.
- **P4D-A14:** `docs/quickstart.md` exists and covers first cleanup, quick capture, activation, reopening, local/no-subscription use, and non-replacement positioning.

## Manual acceptance checklist

1. Load a fixture using an older supported durable schema and verify Protab detects the legacy data, stores it as a backup, and auto-opens Settings with the import section visible.
2. Verify the import section shows all projects with URL counts and archived counts, all selected by default.
3. Verify the old version warning is shown and can be dismissed.
4. Select a subset of projects and click Import; verify only those projects appear in the workspace.
5. Verify projects with duplicate names are skipped (existing projects are not overwritten).
6. Export the migration backup from Settings and inspect that it contains the pre-migration raw state.
7. Restore the migration backup from Settings and verify Protab confirms before replacing current state.
8. Simulate detection failure and verify the original `protab.state` is unchanged.
9. Simulate a future schema version and verify Protab refuses to overwrite it.
10. Pin an unassigned live tab in Protab and run **File all unassigned tabs**; verify the pinned tab is skipped and summarized.
8. Pin a project-owned live tab in Protab and run **Close all**; verify the pinned tab is skipped and summarized.
9. Activate another project while a protected other-project tab is open; verify the protected tab remains open and the summary explains why.
10. Chrome-pin a tab and verify Protab shows protected styling and skips it during all relevant close workflows.
11. Play audio in a tab and verify Protab shows protected styling and skips it during all relevant close workflows.
12. Verify protected skipped tabs do not prevent unprotected eligible tabs from being saved/closed.
13. Verify retrying a close action still rechecks protection before calling `chrome.tabs.remove()`.
14. Verify manual pin/unpin works using keyboard-only controls.
15. Close a manually pinned tab, open the same URL again, and verify the new tab is not automatically manually pinned by URL.
16. Review all new copy and confirm it does not imply unsaved-change detection or guaranteed video-call detection.
17. Open `docs/quickstart.md` and verify it is useful without screenshots.

## Explicitly out of scope

- Detecting video calls through content scripts.
- Detecting unsaved forms or page-specific application state.
- Persistent URL-based protection.
- Saved-record protection flags.
- Per-action protection settings.
- Cloud backup or sync.
- Replacing Chrome native tab pinning.
- README quickstart link.
- Phase 5 release hardening and complete accessibility audit.
