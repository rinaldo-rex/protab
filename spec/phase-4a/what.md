# Phase 4A — What to build

## Outcome

Add project export/import and tab archiving. Users can export a single project or all projects as self-contained HTML files, and import projects from HTML or ZIP files via drag-and-drop. Within a project, saved URLs can be archived to separate active work from completed reference material.

## Prerequisite

Phase 4 is complete and its Activate, Open all, Close all, and active-state recovery are the current V0 behavior.

---

## Export

### Single project export

- Export the selected project as a single self-contained HTML file.
- The HTML file contains all project data: name, all saved URLs (active and archived), titles, tags, notes, and archived status.
- Links in the HTML are clickable and open in a new tab.
- The HTML is read-only: no editable fields, no accordions, no interactive state.
- Inline all required CSS (Inter font, Stitch tokens, layout styles) so the file works offline.
- Inline only the icons used in the export view (Folder, Tag, ExternalLink, Archive).
- Show archived URLs in a clearly labeled "Archived" section below active URLs.
- The export filename is `protab-{project-name}.html` (sanitized for filesystem).

### Export all projects

- Export all projects as a ZIP file containing one HTML file per project.
- Each HTML file follows the same format as single-project export.
- The ZIP filename is `protab-export-{date}.html`.
- Show the "Export all" action in the projects sidebar heading area.

### Export menu placement

- **Single project**: Add "Export" to the project actions menu (⋯) alongside Activate, Open all, Close all.
- **All projects**: Add "Export all" button in the sidebar heading area (next to "Projects" label).

### Export data model

The HTML includes:
- Project name
- For each saved URL (active and archived):
  - Title (with source: automatic/custom)
  - URL (clickable)
  - Tags (displayed as pills)
  - Notes (if any)
  - Archived status (if archived, show archived date)
- Export timestamp
- Total count of active and archived URLs

---

## Import

### Drag-and-drop import

- Users can import projects by dragging HTML or ZIP files onto the sidebar.
- The sidebar shows a drop zone at the bottom: "Drop HTML or ZIP to import".
- Clicking the drop zone opens a file picker for HTML/ZIP files.
- An "Import from file" button is also available on the empty first-use state.

### File type detection

- HTML files are parsed as single project exports.
- ZIP files are extracted and each HTML file inside is parsed as a project import.
- Unsupported file types show an error dialog.

### Conflict resolution

- If an imported project has the same name as an existing project, a confirmation dialog appears.
- Options:
  - **Merge**: Add imported URLs to the existing project (skip duplicates).
  - **Create new**: Create a new project with a user-configurable suffix (default: " (imported)").
  - **Cancel**: Abort the import.
- If no conflict exists, the project is imported directly.

### ZIP import

- ZIP files may contain multiple HTML exports.
- Each HTML file is parsed independently.
- Projects without name conflicts are auto-imported.
- If any project has a conflict, a dialog is shown for that project.

---

## Archive

### Data model change

Add `archivedAt` field to `SavedUrl`:

```ts
interface SavedUrl {
  id: string
  url: string
  title: string
  titleSource: 'automatic' | 'custom'
  tags: string[]
  notes: string
  archivedAt: number | null  // timestamp when archived, null if active
}
```

This requires a schema migration from V1 to V2.

### Project sections

- The project workspace shows two sections: **Active** and **Archived**.
- Active URLs appear first (same as current behavior).
- Archived URLs appear below, in a collapsible "Archived" section.
- The Archived section header shows the count: "Archived (3)".
- The section is collapsed by default.

### Archive action

- **Right-click context menu**: Right-clicking a saved URL accordion shows a context menu with "Archive" option.
- **Keyboard shortcut**: When hovering over an accordion, show a hint: "Archive (R)". Pressing R archives the URL.
- **Confirmation for open tabs**: If the tab is currently open in the browser, show a confirmation: "This tab is currently open. Archive it anyway?" with options to archive and close, archive only, or cancel.

### Unarchive action

- Right-clicking an archived URL shows "Unarchive" option.
- Keyboard shortcut: When hovering over an archived accordion, show hint: "Unarchive (R)".
- Pressing R on an archived accordion unarchives it (moves back to Active).

### Archive consequences

- **Activation**: Archived URLs are NOT opened when activating a project. Only active URLs are considered.
- **Open all (project header)**: Only opens active URLs. Renamed to "Open all active" for clarity.
- **Open all (archive section)**: The Archived section has a "..." menu with "Open all archived" option.
- **Close all**: Only targets active owned tabs. Archived tabs are unaffected.
- **Export**: Includes both active and archived URLs (clearly labeled).

### Archive keyboard shortcuts

- **Scope**: Shortcuts are active when hovering over a saved URL accordion.
- **R**: Archive (if active) or Unarchive (if archived).
- **N**: Open note editor (focus the notes textarea).
- **Visual hint**: Show shortcut hints on hover: "Archive (R)" / "Note (N)" / "Unarchive (R)".
- **Conflict avoidance**: Shortcuts only work when:
  - Not in a text input/textarea
  - Hovering over an accordion
  - The project is selected

---

## Acceptance criteria

- **P4A-A1:** Export single project produces a self-contained HTML file with all project data.
- **P4A-A2:** Exported HTML links are clickable and open in new tabs.
- **P4A-A3:** Export all produces a ZIP with one HTML per project.
- **P4A-A4:** Archived URLs appear in a separate collapsible section.
- **P4A-A5:** Archiving an open tab shows confirmation with close options.
- **P4A-A6:** R shortcut archives/unarchives when hovering over accordion.
- **P4A-A7:** N shortcut focuses note editor when hovering over accordion.
- **P4A-A8:** Activation does not open archived URLs.
- **P4A-A9:** "Open all" on project header only opens active URLs.
- **P4A-A10:** "Open all archived" opens only archived URLs.
- **P4A-A11:** Export includes both active and archived URLs.
- **P4A-A12:** Schema migration from V1 to V2 preserves all existing data.
- **P4A-A13:** Import from HTML creates a new project with all saved URLs.
- **P4A-A14:** Import from ZIP creates multiple projects.
- **P4A-A15:** Import conflict dialog offers merge and create-new options.
- **P4A-A16:** Merge adds URLs to existing project, skipping duplicates.

## Manual acceptance checklist

1. Export a single project and verify the HTML file opens correctly offline.
2. Verify all URLs in the export are clickable.
3. Verify archived URLs appear in a separate "Archived" section.
4. Export all projects and verify the ZIP contains one HTML per project.
5. Archive a URL via right-click and verify it moves to the Archived section.
6. Archive a URL via R shortcut and verify the same behavior.
7. Archive a currently-open tab and verify the confirmation dialog.
8. Unarchive a URL and verify it returns to the Active section.
9. Activate a project and verify archived URLs are not opened.
10. Run "Open all" and verify only active URLs are opened.
11. Run "Open all archived" and verify only archived URLs are opened.
12. Verify N shortcut focuses the note editor.
13. Verify shortcuts don't work when typing in text fields.
14. Verify schema migration preserves all existing URLs and metadata.
15. Import a project HTML file and verify all URLs are imported.
16. Import a ZIP file and verify multiple projects are created.
17. Import a project with a name conflict and verify the merge/create-new dialog appears.
18. Merge an imported project and verify URLs are added to the existing project.
19. Create a new project from import with a suffix and verify it's created correctly.

## Explicitly out of scope

Memory consumption display, cloud sync, settings UI, pinning, task statuses, advanced search/filtering, nested projects, and Chrome Web Store publishing.
