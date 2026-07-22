# Phase 4B Manual Testing Checklist

This checklist validates Phase 4B behavior (quick-capture, hover shortcuts, drag-to-rearrange, and settings) against the production build in Chrome.

## Setup

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `dist/` directory.
5. Pin Protab if desired, then click its toolbar action to open the full-page workspace.
6. Create at least two projects with saved URLs.

---

## Quick-capture popup

### Access methods

- [ ] Click the extension icon in the toolbar.
- [ ] Verify a popup opens anchored to the icon (tooltip style).
- [ ] Verify the popup has a "Open workspace" link at the bottom.
- [ ] Close the popup with Escape.
- [ ] Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) on any Chrome tab.
- [ ] Verify the same popup opens.
- [ ] Close the popup with Escape.
- [ ] Right-click the extension icon in the toolbar.
- [ ] Verify a context menu appears with "Open workspace in new tab".
- [ ] Click "Open workspace in new tab".
- [ ] Verify the workspace opens in a new tab.

### Open workspace from popup

- [ ] Open the popup by clicking the icon.
- [ ] Click the "Open workspace" link at the bottom.
- [ ] Verify the workspace opens in a new tab.
- [ ] Verify the popup closes.
- [ ] Open the popup again and press `Ctrl+Enter`.
- [ ] Verify the workspace opens in a new tab and the popup closes.
- [ ] Verify a small keyboard hint badge (e.g. `Ctrl+↵`) appears next to the "Open workspace" link.

### Basic capture

- [ ] Open the quick-capture popup via icon click or shortcut.
- [ ] Verify the popup uses the dark theme matching the workspace sidebar.
- [ ] Type `Need to read this #blog @Work` and press Enter.
- [ ] Verify a green checkmark appears with "Saved to Work."
- [ ] Verify the popup auto-closes after 1.5 seconds.
- [ ] Open the Protab workspace and verify the URL was saved to "Work" with tag "blog" and note "Need to read this."

### Capture with multiple tags

- [ ] Press `Ctrl+Shift+X` on another tab.
- [ ] Type `Check later #code #review @Research` and press Enter.
- [ ] Verify the URL is saved with both tags "code" and "review."

### Capture without note

- [ ] Press `Ctrl+Shift+X` on another tab.
- [ ] Type `#video @Learning` and press Enter.
- [ ] Verify the URL is saved with tag "video" and no note.

### Capture without tags

- [ ] Press `Ctrl+Shift+X` on another tab.
- [ ] Type `Interesting article @Articles` and press Enter.
- [ ] Verify the URL is saved with note "Interesting article" and no tags.

### Error: missing project

- [ ] Press `Ctrl+Shift+X` on any tab.
- [ ] Type `Some note #tag` (no @Project) and press Enter.
- [ ] Verify an error appears: "Please specify a project with @ProjectName."
- [ ] Verify the popup stays open (does not auto-close).

### Error: project not found

- [ ] Press `Ctrl+Shift+X` on any tab.
- [ ] Type `@NonExistent` and press Enter.
- [ ] Verify an error appears: "Project 'NonExistent' not found."
- [ ] Verify the popup stays open (does not auto-close).

### Auto-close behavior

- [ ] Quick-capture a URL successfully.
- [ ] Verify the success message appears.
- [ ] Verify the popup auto-closes after approximately 1.5 seconds.
- [ ] If an error occurs, verify the popup does NOT auto-close.

### Duplicate URL handling

- [ ] Quick-capture a URL that is already saved in a project.
- [ ] Type `Additional note #newtag @ProjectName` and press Enter.
- [ ] Verify the existing record is updated (not duplicated).
- [ ] Verify the new tag is added.
- [ ] Verify the note is appended with a separator.

### Autocomplete

- [ ] Press `Ctrl+Shift+X` and type `#`.
- [ ] Verify a dropdown appears with existing tags.
- [ ] Type more characters to filter the list.
- [ ] Use arrow keys to navigate and Enter to select.
- [ ] Press Escape to dismiss the dropdown.
- [ ] Type `@` and verify project names appear.
- [ ] Select a project from the dropdown.

---

## Hover shortcut 'Add (A)'

### Basic filing

- [ ] Open the Protab workspace with the Current Tabs pane visible.
- [ ] Hover over an unassigned tab row.
- [ ] Verify an "Add (A)" hint appears on the left side.
- [ ] Press the `A` key.
- [ ] Verify a toast appears: "Saved to project."
- [ ] Verify the toast auto-dismisses after 3 seconds.

### No project selected

- [ ] Deselect all projects (click away from any project).
- [ ] Hover over a tab row and press `A`.
- [ ] Verify a toast appears: "Select a project first."

### Toast behavior

- [ ] Hover over a tab row and press `A`.
- [ ] When the toast appears, hover over it.
- [ ] Verify the toast stays visible (pauses auto-dismiss).
- [ ] Move the mouse away from the toast.
- [ ] Verify the toast dismisses after the remaining duration.

### Keyboard scope

- [ ] Hover over a tab row.
- [ ] Press `A` while focused on a text input (e.g., URL field).
- [ ] Verify the character 'a' is typed, not triggering the shortcut.

---

## Drag-to-rearrange saved URLs

### Visual drag handle

- [ ] Select a project with multiple saved URLs.
- [ ] Hover over a saved URL accordion.
- [ ] Verify a drag handle (grip icon) appears on the left side.
- [ ] Move the mouse away.
- [ ] Verify the drag handle disappears.

### Drag to reorder

- [ ] Hover over a saved URL accordion to show the drag handle.
- [ ] Click and drag the handle.
- [ ] Verify the accordion becomes semi-transparent.
- [ ] Drag it over another accordion.
- [ ] Verify a blue line appears showing the drop position.
- [ ] Release the mouse.
- [ ] Verify the URL is reordered.
- [ ] Refresh the page and verify the order persists.

### Action menu changes

- [ ] Click the `⋯` button on a saved URL accordion.
- [ ] Verify "Move up" and "Move down" are NOT in the menu.
- [ ] Verify "Open another copy" and "Copy to project" are still present.

---

## Drag-to-rearrange projects

### Visual drag behavior

- [ ] In the sidebar, hover over a project row.
- [ ] Click and hold the mouse button.
- [ ] Move the mouse slightly (more than 5px).
- [ ] Verify the project row becomes semi-transparent (drag started).
- [ ] Drag it over another project row.
- [ ] Verify a white line appears showing the drop position.
- [ ] Release the mouse.
- [ ] Verify the project is reordered.

### Click vs drag

- [ ] In the sidebar, click a project row without moving the mouse.
- [ ] Verify the project is selected (not dragged).
- [ ] Click and hold, then move less than 5px and release.
- [ ] Verify the project is selected.

### Action menu changes

- [ ] Right-click or click `⋯` on a project in the workspace header.
- [ ] Verify "Move up" and "Move down" are NOT in the menu.
- [ ] Verify "Rename," "Activate," "Open all active," "Close all," "Export," and "Delete project" are still present.

---

## Settings panel

### Access settings

- [ ] In the sidebar header, find the gear icon next to "Protab."
- [ ] Click the gear icon.
- [ ] Verify the settings panel opens in the center pane.
- [ ] Verify the Current Tabs pane is hidden.

### Extension Page settings

- [ ] Verify "Close tab after filing" toggle is present.
- [ ] Verify the default is enabled (toggle is active).
- [ ] Click the toggle to disable it.
- [ ] Verify the toggle changes state.

### Extension Popup settings

- [ ] Verify "Close tab after capture" toggle is present.
- [ ] Verify the default is disabled (toggle is inactive).
- [ ] Click the toggle to enable it.
- [ ] Verify the toggle changes state.
- [ ] Verify "Open workspace shortcut" dropdown is present.
- [ ] Verify the default is "Ctrl+Enter".
- [ ] Change the dropdown to "Ctrl+Shift+Enter".
- [ ] Open the popup and press `Ctrl+Shift+Enter`.
- [ ] Verify the workspace opens.
- [ ] Change the dropdown to "Alt+Enter".
- [ ] Open the popup and press `Alt+Enter`.
- [ ] Verify the workspace opens.
- [ ] Verify the keyboard hint badge in the popup footer updates to match the selected shortcut.

### General settings

- [ ] Verify "Quick-capture shortcut" shows `Ctrl+Shift+X`.
- [ ] Click the "Change" link.
- [ ] Verify it opens `chrome://extensions/shortcuts` in a new tab.
- [ ] Verify "Toast duration" dropdown is present.
- [ ] Change the dropdown to "5 seconds."
- [ ] Verify the setting is saved.

### Back to workspace

- [ ] Click the back arrow in the settings header.
- [ ] Verify the workspace view is restored.
- [ ] Verify the Current Tabs pane is visible again.

### Settings persistence

- [ ] Change the "Close tab after filing" toggle.
- [ ] Change the "Toast duration" dropdown.
- [ ] Refresh the page.
- [ ] Open settings again.
- [ ] Verify the settings are preserved.

---

## Keyboard accessibility

- [ ] Open the quick-capture popup using only the keyboard.
- [ ] Navigate the autocomplete dropdown using arrow keys.
- [ ] Select an option using Enter.
- [ ] Submit the form using Enter.
- [ ] Cancel using Escape.
- [ ] Navigate the settings panel using Tab and Enter.
- [ ] Toggle switches using Enter or Space.

---

## Console and network review

- [ ] Open the background service worker console.
- [ ] Perform Phase 4B operations (quick-capture, hover 'A', drag-to-reorder, settings).
- [ ] Verify no unhandled errors.
- [ ] Open the Network tab.
- [ ] Verify no Protab fetches (all operations are local).

## Manifest permissions

- [ ] Verify `manifest.json` contains `["storage", "tabs", "activeTab", "contextMenus"]`.
- [ ] Verify `default_popup` is set to `popup.html`.
- [ ] Verify no host permissions or content scripts are declared.
- [ ] Verify the `commands` section defines `quick-capture` with `Ctrl+Shift+X`.

## Production build

- [ ] Run `npm run build` and verify it completes without errors.
- [ ] Run `npm test` and verify all tests pass.
- [ ] Run `npm run lint` and verify no lint errors.
- [ ] Load the production build from `dist/` directory.
- [ ] Verify all Phase 4B features work in the production build.
