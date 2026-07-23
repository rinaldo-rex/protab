# Phase 4D — What to build

## Outcome

Add safe update handling, protected live tabs, and a first-use quickstart. Users can update Protab without losing durable project data, prevent important live tabs from being closed by any Protab close workflow, and learn the core save–close–reopen loop from a concise guide.

Phase 4D is titled **Safe updates, protected tabs, and quickstart**.

## Prerequisite

Phase 4B is complete. The extension has durable V2 project storage, archive/export/import, quick-capture, hover filing, drag-to-rearrange, settings, and the shared programmatic-close workflow used by filing, activation, Close all, and quick-capture close behavior.

---

## Feature 1: Safe automatic migration

### Goal

When users update Protab, existing projects, saved URLs, titles, tags, notes, ordering, and archive metadata must remain available. Older supported durable schemas are automatically migrated to the current schema, saved back once migration succeeds, and recoverable through a visible backup UI.

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

### Migration behavior

On startup or state load:

1. Read raw stored durable state.
2. If no state exists, initialize the current empty state.
3. If the state is already current, validate and continue.
4. If the state uses an older supported schema, validate the old shape.
5. Migrate step-by-step to the current schema.
6. Validate the migrated result.
7. Before replacing `protab.state`, save the pre-migration raw data as the latest migration backup.
8. Write the migrated current-schema state back to `protab.state`.
9. Continue with the migrated state.
10. Show a brief success banner or toast: **Protab updated your saved data format.**

If migration or validation fails:

- do not overwrite `protab.state`
- do not delete or close tabs
- do not attempt partial repair silently
- show a clear error state with recovery options where possible

If the stored state has a future unsupported schema version:

- do not downgrade it
- do not overwrite it
- show an unsupported-version error explaining that this Protab build cannot read newer data

### Migration backup and recovery UI

Phase 4D adds a visible recovery area in Settings.

If a migration backup exists, Settings provides:

- **Export migration backup** — downloads or copies the latest backup as JSON for manual safekeeping.
- **Restore migration backup** — confirms and restores the latest backup into `protab.state`.

Restore must require explicit confirmation and must explain that restoring replaces the current project state with the backed-up state. Restored data is then parsed through the same migration pipeline before use if it is older than the current schema.

The backup is not cloud sync, account backup, or a replacement for project HTML/ZIP export. It is a local recovery aid for automatic schema migration.

### User-facing copy

Success copy should be brief and non-alarming:

> Protab updated your saved data format.

Failure copy should emphasize non-destruction:

> Protab could not update your saved data. Your original data was left unchanged.

Unsupported future-version copy should avoid implying corruption:

> This Protab data was created by a newer version. Install the newer version to open it safely.

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

- **P4D-A1:** Loading an older supported durable schema automatically migrates it to the current schema and writes the migrated state back after successful validation.
- **P4D-A2:** Before overwriting durable state during migration, Protab stores a latest migration backup.
- **P4D-A3:** Migration failure leaves the original durable state untouched and shows a clear non-destructive error.
- **P4D-A4:** Future unsupported schema versions are rejected non-destructively.
- **P4D-A5:** Settings exposes migration backup export and restore when a backup exists.
- **P4D-A6:** Successful automatic migration shows a brief banner or toast.
- **P4D-A7:** Users can manually pin and unpin a live tab from the Current Tabs pane using mouse or keyboard.
- **P4D-A8:** Manually pinned tabs are session-only live-tab state, not saved URL metadata and not URL-wide rules.
- **P4D-A9:** Chrome-pinned tabs and audible tabs appear with protected styling and source-specific labels.
- **P4D-A10:** Every Protab close workflow skips protected tabs and never calls `chrome.tabs.remove()` for them.
- **P4D-A11:** Filing, activation, Close all, quick-capture close, archive-and-close, and retry summaries report protected skipped tabs with reasons.
- **P4D-A12:** Protected tabs do not block an entire bulk operation; unprotected eligible tabs still proceed.
- **P4D-A13:** The UI copy does not claim Protab can detect unsaved changes, video calls, or important page state beyond manual pins, Chrome-pinned state, and audible state.
- **P4D-A14:** `docs/quickstart.md` exists and covers first cleanup, quick capture, activation, reopening, local/no-subscription use, and non-replacement positioning.

## Manual acceptance checklist

1. Load a fixture using an older supported durable schema and verify Protab migrates it, preserves all project data, writes the current schema back, and shows the success banner/toast.
2. Verify the latest migration backup exists after migration.
3. Export the migration backup from Settings and inspect that it contains the pre-migration raw state.
4. Restore the migration backup from Settings and verify Protab confirms before replacing current state.
5. Simulate migration failure and verify the original `protab.state` is unchanged.
6. Simulate a future schema version and verify Protab refuses to overwrite it.
7. Pin an unassigned live tab in Protab and run **File all unassigned tabs**; verify the pinned tab is skipped and summarized.
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
