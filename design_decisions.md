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
- A tab remains project-owned during navigation. If its current URL differs from the URL it opened from, Protab warns before an automatic focus or bulk-close action.

## Opening and closing

- **Open** focuses the most recently used matching live instance when one exists; otherwise it opens a project-owned tab.
- **Open another copy** always creates another project-owned instance. Shift-click may provide the same shortcut.
- **Open all** opens saved URLs that are not already open; it is separate from activation.
- **Close all** closes all live instances owned by that project without deleting saved records.
- **File all unassigned tabs** saves and closes only unassigned tabs in the current window. It skips the workspace and unsupported browser pages.
- Dragging an unassigned tab into a project saves it and attempts to close it. If that URL already exists in the project, no duplicate record is created.

### Close safety

Chrome does not expose whether a page has unsaved changes. More importantly, extension-initiated `chrome.tabs.remove()` does not provide the cancellable native `beforeunload` flow used by Chrome's tab close button: a page cannot reliably keep the tab open, and a successful call resolves only after the tab is destroyed.

For every extension-initiated close, Protab always persists required project data first. It can also warn when a project-owned tab has navigated away from its saved URL and report API or partial-operation failures. It must not claim that it can detect unknown unsaved page state or that a native warning can cancel a programmatic close.

The final V0 policy—automatic programmatic close with explicit Protab confirmation, or a user-close handoff that preserves native protection—must be chosen before Phase 3. Any attention banner will represent actual Protab/API failures, not inferred unsaved changes.

## Persistence

- Projects, URL records, metadata, ordering, and schema version live in `chrome.storage.local` and survive normal browser restarts.
- Uninstalling the extension or clearing extension data removes local data; backup and sync are outside V0.
- Tab ownership and active-project state are restored best-effort because Chrome window and tab identities may change across restarts.
- Stored data must use an explicit schema version so later releases can migrate it.

## Deferred features

Settings UI, pinning, recent/archive/timeline views, task statuses, advanced search/filtering, nested projects, import/export, cloud sync, and split-view management are not part of V0.

## Decisions required before implementation reaches them

- Exact URL equivalence rules for duplicate detection, including fragments, query parameters, and trailing slashes
- Supported URL schemes and handling of restricted Chrome pages
- Project deletion behavior when that project owns live tabs
- Initial domain-to-tag suggestion rules
- Extension close policy given that programmatic closes cannot preserve native unsaved-change cancellation
