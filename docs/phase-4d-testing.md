# Phase 4D Manual Testing Checklist

This checklist validates Phase 4D behavior (safe migrations, protected tabs, and quickstart guide) against the production build in Chrome.

## Setup

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `dist/` directory.
5. Pin Protab if desired, then click its toolbar action to open the full-page workspace.
6. Create at least two projects with saved URLs for testing.

---

## Feature 1: Safe automatic migration

### Migration on startup (V1 → V2)

> **Note:** To test migration, you need a fixture using an older schema (V1). You can create one by manually writing to `chrome.storage.local` before loading the extension.

- [ ] Prepare a V1 fixture in `chrome.storage.local` under `protab.state` with `schemaVersion: 1` and valid project data.
- [ ] Load the extension (or reload it from `chrome://extensions`).
- [ ] Verify the workspace opens and all projects and saved URLs are present.
- [ ] Verify a brief toast or banner appears: **"Protab updated your saved data format."**
- [ ] Open DevTools on the workspace page, go to Application → Storage → Local Storage.
- [ ] Verify `protab.state` now has `schemaVersion: 2`.
- [ ] Verify `protab.state.migrationBackup.latest` exists and contains the original V1 raw data.

### Migration backup in Settings

- [ ] Click the gear icon in the sidebar header to open Settings.
- [ ] Scroll to the **Data Recovery** section.
- [ ] Verify it shows the migration info: schema version range and date.
- [ ] Click **Export** next to "Export migration backup."
- [ ] Verify a JSON file downloads (`protab-migration-backup.json`).
- [ ] Open the JSON file and verify it contains the pre-migration raw state (`schemaVersion: 1`).
- [ ] Click **Restore** next to "Restore migration backup."
- [ ] Verify a confirmation dialog appears explaining that current project data will be replaced.
- [ ] Click **Cancel** and verify nothing changes.
- [ ] Click **Restore** again, then click **Restore backup** in the dialog.
- [ ] Verify a success notice appears: "Migration backup restored successfully."
- [ ] Verify the workspace shows the restored project data.

### No migration needed (current schema)

- [ ] Load the extension with existing V2 data (normal use).
- [ ] Verify no migration toast/banner appears.
- [ ] Open Settings and verify the **Data Recovery** section does NOT appear.

### Future schema rejection

- [ ] Manually write `protab.state` to `chrome.storage.local` with `schemaVersion: 99` and valid shape.
- [ ] Reload the extension.
- [ ] Verify the workspace shows an error: **"This Protab data was created by a newer version."**
- [ ] Verify the existing data in `protab.state` was NOT overwritten (still has `schemaVersion: 99`).
- [ ] Verify no tabs were closed.

### Invalid data rejection

- [ ] Manually write `protab.state` to `chrome.storage.local` with `schemaVersion: 1` but invalid shape (e.g., `projects: "not-an-array"`).
- [ ] Reload the extension.
- [ ] Verify the workspace shows an error about invalid data.
- [ ] Verify the existing data was NOT overwritten.
- [ ] Verify no tabs were closed.

### Backup write failure safety

- [ ] This is difficult to test manually. Automated tests verify that if the backup write fails, `protab.state` is not replaced.

---

## Feature 2: Protected tabs

### Manual Protab pin

- [ ] Open the workspace with the Current Tabs pane visible.
- [ ] Hover over an unassigned tab row.
- [ ] Verify a **Pin** button appears on the right side of the tab row.
- [ ] Click **Pin**.
- [ ] Verify the button changes to **Unpin**.
- [ ] Verify a **Pinned** badge appears on the tab row.
- [ ] Verify the tab row gets a left-border highlight (blue).
- [ ] Click **Unpin**.
- [ ] Verify the badge and highlight disappear.

### Keyboard pin/unpin

- [ ] Hover over a tab row.
- [ ] Press `Tab` to focus the **Pin** button.
- [ ] Press `Enter` or `Space` to pin.
- [ ] Verify the badge appears.
- [ ] Press `Enter` or `Space` again to unpin.
- [ ] Verify the badge disappears.

### Chrome-pinned tab protection

- [ ] Pin a tab using Chrome's native tab pinning (right-click tab → Pin).
- [ ] Verify Protab shows a **Chrome pinned** badge on that tab row.
- [ ] Verify the tab row has the left-border highlight.

### Audible tab protection

- [ ] Open a tab playing audio (e.g., a YouTube video).
- [ ] Verify Protab shows a **Playing audio** badge on that tab row.
- [ ] Verify the tab row has the left-border highlight.

### Multiple protection reasons

- [ ] Pin a tab in Chrome AND have it play audio.
- [ ] Verify Protab shows both **Chrome pinned** and **Playing audio** badges.
- [ ] Also manually pin it in Protab.
- [ ] Verify all three badges appear.

### Protected tabs skipped by File all unassigned

- [ ] Manually pin an unassigned tab in Protab.
- [ ] Select a project and use **File all unassigned** from the project menu.
- [ ] Verify the pinned tab is NOT filed or closed.
- [ ] Verify the filing summary reports: "X tabs saved, Y tabs closed, 1 tab skipped because it was pinned."
- [ ] Verify unprotected unassigned tabs were still filed and closed.

### Protected tabs skipped by Close all

- [ ] Manually pin a tab that is owned by a project.
- [ ] Use **Close all** for that project.
- [ ] Verify the pinned tab is NOT closed.
- [ ] Verify the summary reports the protected skip with reason.
- [ ] Verify unprotected owned tabs were still closed.

### Protected tabs skipped by activation

- [ ] Manually pin a tab owned by another project.
- [ ] Activate a different project.
- [ ] Verify the pinned tab remains open.
- [ ] Verify the activation summary explains: "1 Chrome-pinned tab kept open" (or similar).
- [ ] Verify other (unprotected) other-project tabs were closed.

### Protected tabs skipped by hover 'A' filing

- [ ] Manually pin an unassigned tab.
- [ ] Hover over it and press `A`.
- [ ] Verify the filing result shows the tab was saved but not closed (protected skip).
- [ ] Verify the tab remains open.

### Protected tabs skipped by quick-capture close

- [ ] Enable "Close tab after capture" in Settings.
- [ ] Manually pin the current tab.
- [ ] Use quick-capture (`Ctrl+Shift+X`) to capture the tab.
- [ ] Verify the URL is saved.
- [ ] Verify the tab is NOT closed (protected).

### Protected tabs skipped by retry

- [ ] File a tab, let it fail to close (e.g., Chrome rejected the request).
- [ ] Manually pin that tab.
- [ ] Click **Retry** on the filing result.
- [ ] Verify the retry skips the now-protected tab.

### Session-only behavior

- [ ] Manually pin a tab.
- [ ] Close that tab.
- [ ] Open the same URL in a new tab.
- [ ] Verify the new tab is NOT automatically pinned.

### Two-window isolation

- [ ] Open two Chrome windows with Protab workspaces.
- [ ] Manually pin a tab in window A.
- [ ] Verify window B does not show that tab as pinned.
- [ ] Verify pinning in window A doesn't affect tabs in window B.

---

## Feature 3: Quickstart guide

- [ ] Navigate to `docs/quickstart.md` in the project directory.
- [ ] Verify the file exists and is readable.
- [ ] Verify it explains the pain Protab addresses (mixed-context tab clutter).
- [ ] Verify it explains the core mental model (saved URLs are durable, live tabs are temporary).
- [ ] Verify it covers first cleanup of a messy window.
- [ ] Verify it explains quick-capture syntax (`#tag @Project`).
- [ ] Verify it explains selection vs activation.
- [ ] Verify it explains protected tabs.
- [ ] Verify it mentions local/no-subscription use.
- [ ] Verify it includes non-replacement positioning (not bookmarks, read-it-later, session manager).
- [ ] Verify it includes safety notes about unassigned tabs and close behavior.
- [ ] Verify it does NOT claim Protab can detect unsaved changes or video calls.

---

## Console and network review

- [ ] Open the background service worker console.
- [ ] Perform Phase 4D operations (migration, pin/unpin, protected close workflows).
- [ ] Verify no unhandled errors.
- [ ] Open the Network tab.
- [ ] Verify no Protab fetches (all operations are local).

## Manifest permissions

- [ ] Verify `manifest.json` contains `["storage", "tabs", "activeTab", "contextMenus"]`.
- [ ] Verify no host permissions or content scripts are declared.

## Production build

- [ ] Run `npm run build` and verify it completes without errors.
- [ ] Run `npm test` and verify all tests pass.
- [ ] Run `npm run lint` and verify no lint errors.
- [ ] Load the production build from `dist/` directory.
- [ ] Verify all Phase 4D features work in the production build.

## Copy review

- [ ] Verify no UI text claims Protab can detect unsaved form state.
- [ ] Verify no UI text claims Protab can detect video calls or active meetings.
- [ ] Verify migration success copy is brief and non-alarming.
- [ ] Verify migration failure copy emphasizes non-destruction.
- [ ] Verify future-schema copy avoids implying corruption.
- [ ] Verify protection badges use exact labels: "Pinned", "Chrome pinned", "Playing audio".
