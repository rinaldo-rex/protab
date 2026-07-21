# Phase 4A Manual Testing Checklist

This checklist validates Phase 4A behavior (export, import, and archive) against the production build in Chrome.

## Setup

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `dist/` directory.
5. Pin Protab if desired, then click its toolbar action to open the full-page workspace.
6. Create at least two projects with saved URLs.

---

## Schema migration

- [ ] Create projects with saved URLs in a previous version (Phase 4 or earlier).
- [ ] Load the Phase 4A build.
- [ ] Verify all existing projects and URLs are preserved.
- [ ] Verify no data is lost or corrupted.

## Archive via context menu

- [ ] Right-click a saved URL accordion.
- [ ] Verify a context menu appears with "Archive" option.
- [ ] Click "Archive".
- [ ] Verify the URL moves to the "Archived" section.
- [ ] Verify the archived section header shows "Archived (1)".
- [ ] Verify the archived section is collapsed by default.
- [ ] Expand the archived section.
- [ ] Verify the archived URL is displayed with reduced opacity.
- [ ] Verify the archived URL shows an "Archived" badge.

## Unarchive via context menu

- [ ] Right-click an archived URL accordion.
- [ ] Verify the context menu shows "Unarchive" option.
- [ ] Click "Unarchive".
- [ ] Verify the URL moves back to the Active section.
- [ ] Verify the archived section count decreases.

## Archive via keyboard shortcut

- [ ] Hover over an active saved URL accordion.
- [ ] Verify shortcut hints appear: "Archive (R)" and "Note (N)".
- [ ] Press `R` key.
- [ ] Verify the URL is archived and moves to the Archived section.

## Unarchive via keyboard shortcut

- [ ] Expand the archived section.
- [ ] Hover over an archived URL accordion.
- [ ] Verify shortcut hints show "Unarchive (R)".
- [ ] Press `R` key.
- [ ] Verify the URL is unarchived and moves back to Active.

## Archive confirmation for open tabs

- [ ] Open a saved URL in Chrome (so it's a live tab).
- [ ] Right-click the saved URL accordion and click "Archive".
- [ ] Verify a confirmation dialog appears: "This tab is currently open. What would you like to do?"
- [ ] Verify three options: Cancel, Archive only, Archive and close.
- [ ] Click "Cancel".
- [ ] Verify the URL is not archived.
- [ ] Click "Archive only".
- [ ] Verify the URL is archived but the tab remains open.
- [ ] Archive another open tab and click "Archive and close".
- [ ] Verify the URL is archived and the tab is closed.

## Note shortcut

- [ ] Hover over a saved URL accordion (collapsed or expanded).
- [ ] Press `N` key.
- [ ] If collapsed, verify the accordion expands and the notes textarea is focused.
- [ ] If expanded, verify the notes textarea is focused directly.

## Shortcuts scope

- [ ] Hover over a saved URL accordion.
- [ ] Verify shortcut hints appear.
- [ ] Move the mouse away from the accordion.
- [ ] Verify shortcut hints disappear.
- [ ] Press `R` or `N` while not hovering.
- [ ] Verify no action is triggered.

## Shortcuts don't work in text inputs

- [ ] Expand a saved URL accordion.
- [ ] Click in the URL, title, or notes field.
- [ ] Press `R` or `N`.
- [ ] Verify the character is typed into the field, not triggering archive/note actions.

## Action menu positioning

- [ ] Click the "..." button on a project in the workspace header.
- [ ] Verify the menu appears anchored to the button, not at the top-right of the screen.
- [ ] Click the "..." button on a saved URL accordion.
- [ ] Verify the menu appears anchored to the button.

## Activation excludes archived URLs

- [ ] Create a project with 3 active URLs.
- [ ] Archive one of the URLs.
- [ ] Activate the project.
- [ ] Verify only the 2 active URLs are opened (not the archived one).

## Open all active

- [ ] Select a project with active and archived URLs.
- [ ] Click the project actions menu (⋯).
- [ ] Verify "Open all active" is shown (not "Open all").
- [ ] Click "Open all active".
- [ ] Verify only active URLs are opened.
- [ ] Verify archived URLs are not opened.

## Export single project

- [ ] Select a project with active and archived URLs.
- [ ] Open the project actions menu (⋯).
- [ ] Verify "Export" option is available.
- [ ] Click "Export".
- [ ] Verify a file download starts: `protab-{project-name}.html`.
- [ ] Open the downloaded HTML file in a browser.
- [ ] Verify the file works offline (no internet needed).
- [ ] Verify the project name is displayed in the header.
- [ ] Verify active URLs are listed under "Active URLs (N)".
- [ ] Verify archived URLs are listed under "Archived (N)" section.
- [ ] Verify each URL card shows title, clickable URL, tags, and notes.
- [ ] Click a URL in the export.
- [ ] Verify it opens in a new tab.

## Export all projects

- [ ] Create at least 2 projects with saved URLs.
- [ ] In the sidebar, find the "Export all" button (download icon next to project count).
- [ ] Click "Export all".
- [ ] Verify a ZIP file download starts: `protab-export-DD-MMM-YYYY.zip`.
- [ ] Extract the ZIP file.
- [ ] Verify it contains one HTML file per project.
- [ ] Open each HTML file.
- [ ] Verify each file works offline and contains the correct project data.

## Import from HTML (no conflict)

- [ ] Export a project as HTML.
- [ ] Delete the project from Protab.
- [ ] Drag the exported HTML file onto the sidebar import drop zone.
- [ ] Verify the project is recreated with all URLs.
- [ ] Alternatively, click the import drop zone and use the file picker.

## Import from HTML (with conflict)

- [ ] Export a project as HTML.
- [ ] Do NOT delete the original project.
- [ ] Drag the exported HTML file onto the sidebar import drop zone.
- [ ] Verify a conflict dialog appears: "A project named X already exists".
- [ ] Click "Merge".
- [ ] Verify URLs are added to the existing project (duplicates skipped).
- [ ] Import the same file again.
- [ ] Click "Create new".
- [ ] Verify a new project is created with the suffix (e.g., "Project (imported)").

## Import from ZIP

- [ ] Export all projects as a ZIP.
- [ ] Delete some projects from Protab.
- [ ] Drag the exported ZIP file onto the sidebar import drop zone.
- [ ] Verify deleted projects are recreated.
- [ ] Verify existing projects show a conflict dialog or are merged.

## Import error handling

- [ ] Drag a non-HTML, non-ZIP file (e.g., .txt, .pdf) onto the import drop zone.
- [ ] Verify an error dialog appears: "Unsupported file type".
- [ ] Drag an HTML file that is not a Protab export.
- [ ] Verify an error dialog appears.

## Export HTML structure

- [ ] Open an exported HTML file.
- [ ] Verify it has proper styling (Inter font, layout, colors).
- [ ] Verify the Protab branding/footer is visible.
- [ ] Verify tags are displayed as pills.
- [ ] Verify archived URLs show an "Archived" label with date.
- [ ] Verify the export timestamp is correct.

## Filename sanitization

- [ ] Create a project with special characters in the name (e.g., "My Project! @#$").
- [ ] Export the project.
- [ ] Verify the filename is sanitized: `protab-my-project-.html`.
- [ ] Export all projects.
- [ ] Verify project filenames in the ZIP are sanitized.

## Console and network review

- [ ] Open the background service worker console.
- [ ] Perform Phase 4A operations (archive, unarchive, export, import).
- [ ] Verify no unhandled errors.
- [ ] Open the Network tab.
- [ ] Verify no Protab fetches (all operations are local).

## Manifest permissions

- [ ] Verify `manifest.json` contains only `["storage", "tabs"]`.
- [ ] Verify no host permissions, content scripts, or other permissions are declared.

## Production build

- [ ] Run `npm run build` and verify it completes without errors.
- [ ] Run `npm test` and verify all tests pass.
- [ ] Run `npm run lint` and verify no lint errors.
- [ ] Load the production build from `dist/` directory.
- [ ] Verify all Phase 4A features work in the production build.
