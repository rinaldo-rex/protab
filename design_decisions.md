# Design decisions

This document records the product behavior that implementation and tests must preserve.

## Workspace and focus

- **Dedicated extension page:** The primary UI is a full-page extension tab. Each Chrome window has at most one workspace; the toolbar focuses that window's workspace or creates it.
- **Selection is not activation:** Selecting a project only displays it. An explicit **Activate** action changes the current window's focus.
- **Activation is current-window only:** It closes live tabs owned by other projects, leaves unassigned tabs open, and does not open the activated project's URLs.
- **Unassigned warning:** After activation, remaining unassigned tabs receive a visible pulse or notification.
- **Non-destructive startup:** Browser startup and session recovery never trigger automatic tab closing. If active-project recovery is ambiguous, the window starts with no active project.

## Saved URLs

- A project contains saved URL records, not browser tabs.
- Each record has a URL, automatic or custom title, multiple free-form tags, optional notes, and stable ordering.
- A URL is unique within one project but may be saved in multiple projects with independent titles, tags, and notes.
- V0 saves only HTTP(S) URLs without embedded credentials. Duplicate comparison uses the complete browser-serialized URL, preserving path casing, meaningful trailing slashes, query strings, and fragments.
- Duplicating a record into another project copies its metadata once; later edits do not synchronize.
- Filing a live tab saves the record before attempting to close the tab.
- Pinning is deferred.

### Titles and tags

- Filing captures the current browser title, falling back to the hostname.
- Automatic titles may refresh after a successful open; user-edited titles are never overwritten.
- Tags use a global autocomplete vocabulary, but each saved record chooses its tags independently.
- Auto-detected tags are suggestions that users may edit or remove; domain detection never assigns a project.

## Live tabs and ownership

- The right pane shows tabs from the current Chrome window only, grouped by project and **Unassigned**.
- Each live tab instance has zero or one project owner. Many instances of the same URL are allowed and may have different owners.
- Opening from a saved record establishes explicit ownership. After recovery, a unique saved-URL match may restore ownership.
- If the same URL is saved in multiple projects and explicit ownership cannot be recovered, only the live tab becomes unassigned; all saved records remain unchanged.
- An ambiguous tab may be assigned to a project without closing it or changing saved records.
- A tab opened from a saved record retains ownership provenance during navigation so Protab can detect drift. While its current URL differs from the saved record, the row appears under **Unassigned** as **Navigated from saved URL**, is not eligible for Open reuse, and requires a fresh filing decision. Later close operations review that provenance rather than silently treating the current page as the saved URL.
- Deleting a project never closes its live tabs; those tabs remain open and become unassigned.

## Opening and closing

- **Open** operates in the workspace's Chrome window and focuses the most recently used owned instance whose current URL exactly matches the saved record; otherwise it opens a project-owned tab.
- **Open another copy** always creates another project-owned instance. Shift-click may provide the same shortcut.
- **Open all** opens saved URLs that are not already open in the workspace's Chrome window; it is separate from activation.
- **Close all** closes live instances owned by that project in the workspace's Chrome window without deleting saved records.
- **File all unassigned tabs** saves and closes only unassigned tabs in the workspace's Chrome window. It skips the workspace and unsupported browser pages.
- Dragging an unassigned tab into a project saves it and attempts to close it. If that URL already exists in the project, no duplicate record is created.

### Close safety

Chrome does not expose whether a page has unsaved changes. An extension-initiated `chrome.tabs.remove()` can encounter Chrome's native `beforeunload` flow when a page is eligible: choosing **Stay** can leave the tab open, but Chrome gives the extension no cancellation result and the removal promise may remain pending until that tab is eventually destroyed. Native warnings are not guaranteed because normal browser eligibility and suppression rules still apply.

For every extension-initiated close, Protab always persists required project data first. It independently observes tab removal and reports closed, pending/surviving, and failed outcomes without awaiting a cancellation result. It can also review detected navigation drift. It must not claim that it can detect unknown unsaved page state or guarantee that a native warning will appear.

For V0, Protab uses **programmatic close with explicit confirmation**. It persists required project data first, rechecks the reported URL, establishes ownership for a still-live stable tab, and then requests closure. It independently observes tab removal and reports closed, pending/surviving, skipped, and failed outcomes without awaiting a cancellation result indefinitely. It does not claim that it can detect unknown unsaved page state or guarantee that a native warning will appear.

Programmatic close is intentionally fixed for V0 because it implements the core declutter loop. A post-V0 Settings feature may make automatic closing configurable, defaulting to enabled and offering a user-close handoff when disabled. Whether that future preference applies to every Protab close workflow or filing only remains an explicit product decision for that post-V0 specification.

## Persistence

- Projects, URL records, metadata, ordering, and schema version live in `chrome.storage.local` and survive normal browser restarts.
- Uninstalling the extension or clearing extension data removes local data; backup and sync are outside V0.
- Tab ownership and active-project state are restored best-effort because Chrome window and tab identities may change across restarts.
- Stored data must use an explicit schema version so later releases can migrate it.

## Archiving

- A saved URL may be archived to separate active work from completed reference material.
- Archiving sets a timestamp (`archivedAt`); unarchiving clears it.
- Archived URLs appear in a separate collapsible section below active URLs.
- **Activation** and **Open all** only consider active URLs. Archived URLs are excluded.
- **Export** includes both active and archived URLs, clearly labeled.
- Archiving is available via right-click context menu or `R` keyboard shortcut when hovering.
- `N` keyboard shortcut focuses the notes field, expanding the accordion if collapsed.
- Keyboard shortcuts are global listeners scoped to the hovered accordion — they work whether the accordion is focused or not.
- If a URL is currently open when archived, a confirmation dialog offers: archive and close, archive only, or cancel.
- Unarchiving requires no confirmation.
- Schema migration from V1 to V2 adds `archivedAt: null` to all existing URLs.

## Export and import

- A project can be exported as a self-contained HTML file with inlined CSS, fonts (base64), and SVG icons.
- Exported HTML files work offline — no internet connection required.
- Links in exported HTML are clickable and open in new tabs.
- All projects can be exported as a ZIP file containing one HTML per project.
- Export filenames are sanitized: `protab-{name}.html` for single, `protab-export-DD-MMM-YYYY.zip` for all.
- Projects can be imported by dragging HTML or ZIP files onto the sidebar import zone, or by clicking to browse.
- If an imported project name conflicts with an existing project, the user can merge (add URLs, skip duplicates) or create a new project with a suffix.
- If no conflict exists, import proceeds automatically.
- Import parses the same HTML structure that export produces.

## Deferred features

Settings UI, pinning, task statuses, advanced search/filtering, nested projects, cloud sync, and Chrome Web Store publishing are not part of V0.

## Quick capture and shortcuts

- **Quick-capture popup:** A customizable keyboard shortcut (default `Ctrl+Shift+X`) opens a browser popup for capturing the current tab to a project. The popup uses a smart text input that parses `#tag` and `@Project` with inline autocomplete.
- **Input format:** `note #tag1 #tag2 @Project`. Multiple tags are allowed; only one project. The `@Project` is required; missing it shows an error.
- **Duplicate handling:** If the URL already exists in the target project, quick-capture updates the existing record by adding new tags and appending the note. No duplicate records are created.
- **Project matching:** Fuzzy match on project names. If no match, show an error and keep the popup open.
- **Hover shortcut 'A':** Pressing `A` while hovering over a tab row in Current Tabs files it to the currently selected project with a toast overlay. No confirmation dialog; silent filing with brief feedback.
- **Toast behavior:** Toasts appear on the affected UI element and auto-dismiss after a configurable duration (default 3 seconds). Hovering pauses auto-dismiss.

## Drag-to-rearrange

- **Saved URL reordering:** A hover-only hamburger icon (☰) appears on the left side of each saved URL accordion. Dragging it reorders the URL within the project. The `Move up` and `Move down` options are removed from the action menu.
- **Project reordering:** The entire project row in the sidebar is draggable. Clicking selects the project; holding and dragging (with a 5px movement threshold) reorders it. The `Move up` and `Move down` options are removed from the project action menu.
- **Keyboard reorder:** Deferred. Keyboard users cannot reorder URLs or projects in Phase 4B. This may be added later if requested.

## Settings

- **Settings access:** A gear icon next to the "Protab" brand text in the sidebar header opens a settings panel.
- **Settings UI:** An inline panel replaces the project canvas and Current Tabs pane. Clicking a project in the sidebar returns to the normal workspace view.
- **Configurable settings:** Quick-capture shortcut (display only; Chrome manages the binding), default close behavior (whether quick-capture closes the tab), and toast duration (2s, 3s, 5s, or manual dismiss).
- **Settings persistence:** Settings are stored in `chrome.storage.local` and survive browser restarts.

## Permissions

- **New permission:** `activeTab` is added to allow the quick-capture popup to access the current tab's URL and title. This permission is granted temporarily when the user invokes the shortcut.
- **Manifest changes:** The manifest adds `activeTab` to permissions and a `commands` entry for the shortcut.

## Decisions required after V0

- Whether a future automatic-close setting governs every Protab close workflow or filing only
- Whether keyboard reorder for URLs and projects should be added (deferred from Phase 4B)
