# Phase 4B — What to build

## Outcome

Add zero-friction tab capture, keyboard-accessible filing shortcuts, drag-to-rearrange ordering, and minimal settings. Users can capture tabs from anywhere via a quick-capture popup, file tabs from the Current Tabs pane with a single keystroke, and reorder saved URLs and projects by dragging.

## Prerequisite

Phase 4 is complete. The extension has per-window active project state, activate/open-all/close-all operations, and the shared programmatic-close workflow.

---

## Feature 1: Quick-capture popup

### Access methods

There are three ways to open the quick-capture popup:

1. **Keyboard shortcut**: `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) opens the popup from any Chrome tab.
2. **Context menu**: Right-click the extension icon and select "Quick capture (Ctrl+Shift+X)".
3. **Settings link**: The settings panel shows the shortcut and a link to customize it at `chrome://extensions/shortcuts`.

The extension icon click opens the full-page workspace (not the popup).

### Popup UI

- A compact popup window that opens as a focused window (not anchored to the icon).
- Uses the same dark theme as the workspace sidebar for visual consistency.
- A single smart text input that starts as one line and expands if the user types long text or presses `Shift+Enter`.
- A submit button (or `Enter` to submit).
- A cancel button (or `Escape` to cancel and close the popup).
- On success, shows a green checkmark with "Saved to ProjectName" and auto-closes after 1.5 seconds.

### Input format

The text input supports a structured format:

```
<note> #<tag1> #<tag2> @<project>
```

**Examples:**

| Input | Note | Tags | Project |
|---|---|---|---|
| `Need to read this #blog @Work` | Need to read this | `blog` | Work |
| `Check later #code #review @Research` | Check later | `code`, `review` | Research |
| `#video @Learning` | *(empty)* | `video` | Learning |
| `Interesting article @Articles` | Interesting article | *(none)* | Articles |

**Parsing rules:**

- `#<word>` is parsed as a tag. Multiple tags are allowed.
- `@<word or phrase>` is parsed as a project name. Only the last `@` is used; everything after it is the project name.
- Everything else (before the first `#` or `@`) is the note.
- If no `@Project` is specified, show an error: "Please specify a project with @ProjectName."
- If the project doesn't exist, show an error: "Project 'X' not found."
- If no `#tag` is specified, the URL is saved without tags.

### Autocomplete

When the user types `#` or `@`, an inline autocomplete dropdown appears below the cursor:

- **`#` autocomplete**: Shows matching existing tags from all projects. If no match, shows "+ Create 'xyz'" option.
- **`@` autocomplete**: Shows matching existing project names (fuzzy match). If no match, shows error.
- User can navigate with arrow keys, select with `Enter` or click, and dismiss with `Escape`.

### Duplicate URL handling

If the current tab's URL is already saved in the target project:

- Do not create a duplicate record.
- Add any new tags from the input to the existing record (skip tags that already exist).
- Append the note to the existing record's notes (with a separator).
- Show toast: "Updated existing record in ProjectName."

### Execution

On submit (`Enter`):

1. Parse the input to extract note, tags, and project name.
2. Validate: project must exist, at least one `@Project` required.
3. If validation fails, show error in popup. Do not close.
4. Query the active tab from the last focused normal window (not the popup window).
5. Execute `FILE_LIVE_TAB` command through the background (reuse Phase 3 primitive).
6. If the URL already exists in the project, execute `UPDATE_SAVED_URL` to add new tags and append note.
7. Show a green checkmark in the popup with "Saved to ProjectName."
8. The popup auto-closes after 1.5 seconds.
9. The tab remains open; the user closes it when ready.

### Error handling

- Project not found: Show error in popup, keep popup open.
- Storage failure: Show error in popup, keep popup open.
- Tab unavailable: Show error in popup, keep popup open.
- Chrome API failure: Show error in popup, keep popup open.

### Permissions

The quick-capture popup uses the `activeTab` permission to access the current tab's URL and title. This permission is granted temporarily when the user invokes the shortcut.

New manifest permissions: `["storage", "tabs", "activeTab"]`

---

## Feature 2: Hover shortcut 'Add (A)'

### Trigger

Press `A` while hovering over a tab row in the **Current Tabs** pane.

- The shortcut only works when a tab row is hovered.
- It files the hovered tab to the currently selected project in the workspace.
- If no project is selected, show a toast: "Select a project first."

### Behavior

Silent filing with toast feedback:

1. Capture the hovered tab's URL and title.
2. Execute `FILE_LIVE_TAB` command through the background (reuse Phase 3 primitive).
3. If the URL already exists in the selected project, show toast: "URL already saved in ProjectName."
4. If filing succeeds, show a toast overlay on the tab row: "Saved to ProjectName."
5. The toast auto-dismisses after 3 seconds.
6. The tab is closed using the shared programmatic-close workflow.
7. If close fails (e.g., unsaved form), the toast changes to: "Saved. Tab needs attention."

### Toast behavior

- The toast appears as an overlay on the tab row that was filed.
- It auto-dismisses after 3 seconds.
- If the user hovers over the toast, it stays visible (pause auto-dismiss).
- The toast has a close button for manual dismiss.

---

## Feature 3: Drag-to-rearrange saved URLs

### Visual

- A hamburger icon (☰) appears on the left side of each saved URL accordion when hovering.
- The icon is the drag handle; dragging it reorders the URL within the project.
- The icon is hidden when not hovering (hover-only visibility).

### Behavior

- Dragging the handle initiates HTML5 drag-and-drop.
- A placeholder shows where the URL will be dropped.
- On drop, the URL is reordered in the project.
- The new order is persisted immediately.

### Menu changes

- Remove "Move up" and "Move down" from the saved URL `⋯` action menu.
- Keep all other menu items (Open another copy, Copy to project, Delete URL, Archive).

### Keyboard reorder

Keyboard reorder is deferred for now. If users request it, we can add `Ctrl+Shift+Arrow` or a grab-and-drop pattern later.

---

## Feature 4: Drag-to-rearrange projects

### Visual

- The entire project row in the sidebar is draggable.
- Clicking selects the project (existing behavior).
- Holding and dragging reorders the project.
- A movement threshold distinguishes click vs drag (e.g., 5px movement before drag starts).

### Behavior

- Dragging a project row initiates HTML5 drag-and-drop.
- A placeholder shows where the project will be dropped.
- On drop, the project is reordered in the sidebar.
- The new order is persisted immediately.

### Menu changes

- Remove "Move up" and "Move down" from the project `⋯` action menu.
- Keep all other menu items (Rename, Activate, Open all, Close all, Delete project).

### Keyboard reorder

Keyboard reorder is deferred for now.

---

## Feature 5: Minimal settings

### Access point

A gear icon (⚙) next to the "Protab" brand text in the sidebar header.

### UI

- Clicking the gear icon opens a settings panel in the center pane.
- The settings panel replaces the project canvas and the Current Tabs pane.
- A back button or clicking a project in the sidebar returns to the normal workspace view.

### Settings

The settings panel is divided into two sections: **Extension Page** (workspace behavior) and **Extension Popup** (quick-capture behavior).

#### Extension Page

| Setting | Type | Default | Description |
|---|---|---|---|
| Close tab after filing | Toggle | Enabled | When pressing 'A' to file a tab from the Current Tabs pane, close the tab after saving. |

#### Extension Popup

| Setting | Type | Default | Description |
|---|---|---|---|
| Close tab after capture | Toggle | Disabled | When using quick-capture, close the tab after saving. Default keeps the tab open. |

#### General

| Setting | Type | Default | Description |
|---|---|---|---|
| Quick-capture shortcut | Display field (read-only) | `Ctrl+Shift+X` | Shows the current shortcut. Users change it via `chrome://extensions/shortcuts`. |
| Toast duration | Dropdown | 3 seconds | How long success/error toasts stay visible. Options: 2s, 3s, 5s, Manual dismiss. |

### Persistence

Settings are stored in `chrome.storage.local` as part of the durable state or a separate settings key.

---

## Acceptance criteria

- **P4B-A1:** The quick-capture popup opens on the configured shortcut and captures the current tab's URL.
- **P4B-A2:** The popup parses `#tag` and `@Project` correctly, with inline autocomplete.
- **P4B-A3:** Missing or invalid project shows an error; the popup stays open.
- **P4B-A4:** Duplicate URLs update the existing record (add tags, append note) without creating duplicates.
- **P4B-A5:** The popup shows a green checkmark on success; the user closes it manually.
- **P4B-A6:** Pressing `A` while hovering over a tab row files it to the selected project with a toast.
- **P4B-A7:** The toast appears on the tab row and auto-dismisses after the configured duration.
- **P4B-A8:** Saved URL accordions show a hover-only drag handle for reordering.
- **P4B-A9:** Project rows are draggable for reordering; click-to-select still works.
- **P4B-A10:** Move up/Move down are removed from both URL and project action menus.
- **P4B-A11:** The settings gear icon opens an inline panel with two sections (Extension Page, Extension Popup) containing close behavior toggles, plus General section with shortcut display and toast duration.
- **P4B-A12:** All new interactions are keyboard accessible (popup submit/cancel, autocomplete navigation, settings navigation).

## Manual acceptance checklist

1. Press the quick-capture shortcut on any tab; verify the popup opens.
2. Type `Need to read this #blog @Work` and press Enter; verify the URL is saved to "Work" with tag "blog" and note.
3. Type `#video @NonExistent` and press Enter; verify an error appears and the popup stays open.
4. Type `@Work` (no note) and press Enter; verify the URL is saved without a note.
5. Type `#blog #tech @Work` and press Enter; verify both tags are added.
6. Quick-capture a URL already saved in the project; verify tags are added and note is appended (no duplicate).
7. Hover over a tab row in Current Tabs and press `A`; verify the tab is filed with a toast.
8. Verify the toast appears on the tab row and auto-dismisses after 3 seconds.
9. Hover over a saved URL accordion; verify the drag handle (☰) appears.
10. Drag the handle to reorder URLs; verify the new order persists.
11. Drag a project row in the sidebar; verify the new order persists.
12. Click a project row; verify it still selects the project (no drag conflict).
13. Open the `⋯` menu on a saved URL; verify Move up/Move down are absent.
14. Open the `⋯` menu on a project; verify Move up/Move down are absent.
15. Click the gear icon; verify the settings panel opens with two sections (Extension Page, Extension Popup).
16. Verify the shortcut field shows `Ctrl+Shift+X` and links to `chrome://extensions/shortcuts`.
17. Change the toast duration; verify toasts use the new duration.
18. Disable 'Close tab after capture' in Extension Popup section; verify quick-capture doesn't close the tab.
19. Enable 'Close tab after filing' in Extension Page section; verify hover 'A' closes the tab.
20. Complete all actions using keyboard only.

## Explicitly out of scope

- Keyboard reorder for URLs and projects (deferred).
- Content script injection (using browser popup instead).
- Multiple project targeting in quick-capture (one project per capture).
- Auto-create projects on quick-capture (must exist).
- Sync, cloud backup, import/export of settings.
