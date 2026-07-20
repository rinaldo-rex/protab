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
- A tab remains project-owned during navigation. A drifted instance whose current URL differs from its saved record is not eligible for Open reuse, and Protab reviews detected drift before close operations.
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

The final V0 policy—automatic programmatic close with explicit Protab confirmation, or a user-close handoff through Chrome's normal UI—must be chosen before Phase 3. Any attention banner will represent actual operation state such as pending/surviving tabs or API failures, not inferred unsaved changes.

## Persistence

- Projects, URL records, metadata, ordering, and schema version live in `chrome.storage.local` and survive normal browser restarts.
- Uninstalling the extension or clearing extension data removes local data; backup and sync are outside V0.
- Tab ownership and active-project state are restored best-effort because Chrome window and tab identities may change across restarts.
- Stored data must use an explicit schema version so later releases can migrate it.

## Deferred features

Settings UI, pinning, recent/archive/timeline views, task statuses, advanced search/filtering, nested projects, import/export, cloud sync, and split-view management are not part of V0.

## Decisions required before implementation reaches them

- Extension close policy given that native warnings are conditional and cancellation has no direct extension result
