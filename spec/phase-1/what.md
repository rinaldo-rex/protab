# Phase 1 — What to build

## Outcome

Deliver an installable Chrome extension that opens a dedicated Protab workspace and works as a persistent, local project-based URL organizer without reading or changing live browser tabs.

At the end of this phase, a user can create projects, manually save and organize URLs with titles, tags, and notes, close and reopen Chrome, and find the same data intact.

## Sources

- Product behavior: [`design_decisions.md`](../../design_decisions.md)
- Phase boundary: [`development_phases.md`](../../development_phases.md#phase-1--persistent-project-workspace)
- Visual direction: [`screen.png`](../../stitch_core_artifacts/screen.png) and [`DESIGN.md`](../../stitch_core_artifacts/DESIGN.md)

The product documents override the Stitch mockup where they differ.

## User journeys

### Open the workspace

- Clicking the extension toolbar action opens Protab in a full-page extension tab.
- Clicking it again in the same Chrome window focuses that window's existing Protab tab.
- A different Chrome window may have its own Protab workspace.

### Manage projects

- Create a project with a non-empty name.
- Select a project without activating browser focus mode; activation does not exist in Phase 1.
- Rename and reorder projects.
- Delete a project only after confirming that its saved URLs will also be deleted.
- After deleting the selected project, select the project now at the same position or the preceding project if the deleted project was last.
- If the last project is deleted, return to the first-use empty state.

### Manage saved URLs

- Add an HTTP or HTTPS URL manually to the selected project.
- Optionally provide a title, multiple tags, and notes while adding it.
- If the title is omitted, use the URL's hostname and mark the title as automatic.
- Expand a URL accordion to edit its URL, title, tags, and notes. Edits autosave without a separate Save button and are retained when the accordion collapses.
- Reorder and delete URL records.
- Copy a URL record to another project as a one-time metadata snapshot.
- A URL can exist once in each project, but not twice in the same project.

### Use tags

- Add and remove multiple free-form tags.
- Tag entry suggests tags already used anywhere in Protab.
- Suggestions do not restrict new tags.
- Tags are independent per saved record, even when the same URL exists in multiple projects.

## URL identity and validation

Phase 1 resolves URL equivalence as follows:

- Accept only `http:` and `https:` URLs.
- Reject URLs containing embedded usernames or passwords.
- Parse and serialize with the browser `URL` implementation before storage and comparison.
- Compare the complete serialized URL, including path, query string, and fragment.
- Preserve path casing, query parameter order, fragments, and meaningful trailing slashes. Do not strip tracking parameters.
- Scheme and hostname casing and default ports follow browser serialization.

When an edited or newly entered URL duplicates another record in the same project, do not create or overwrite a record. Identify and focus the existing accordion. Copies across projects are allowed.

## Metadata rules

- Project names: trim surrounding whitespace; 1–80 characters.
- Titles: trim surrounding whitespace; 1–200 characters.
- Notes: optional; at most 4,000 characters.
- Tags: trim whitespace; 1–32 characters each; at most 20 per URL.
- Tag duplicates are case-insensitive. Preserve the casing of the first accepted value for display.
- Changing an automatic title makes it custom. A custom title must never be silently overwritten in later phases.
- New projects and URLs appear at the end of their current ordering.

When copying a URL into another project:

- Copy URL, title and title provenance, tags, and notes.
- Subsequent edits remain independent.
- If the target already contains the URL, leave its metadata unchanged and focus the existing target record.

## Phase 1 interface

### Layout

Use the Stitch desktop composition and warm-minimal visual system:

- Fixed dark project sidebar, approximately 240 px wide.
- Compact top bar and warm off-white workspace background.
- Main project canvas with URL accordions.
- Reserved right pane labeled **Current Tabs** with an honest empty-state explanation; it contains no fake tabs or working tab actions until Phase 2.
- Desktop-first target matching the 1280 × 1024 reference. Narrow desktop widths may compress the right pane, but mobile navigation is not required in Phase 1.

### Sidebar

Include only:

- Protab name
- Projects heading
- Ordered project list and selected-project indicator
- **New project** action

Do not include Recent, Archive, Timeline, Settings, or Support placeholders.

### Project canvas

- Selected project name and project overflow menu
- **Add URL** action
- Ordered saved URL accordions
- Clear first-use and empty-project states; whenever projects exist, one is selected

Each accordion header includes its title, compact tag summary, expand/collapse control, and overflow menu. Its expanded body contains URL, editable title, tag editor, and notes. Copy, reorder, and delete actions live in an overflow menu or equivalent compact controls.

Do not include pinning, statuses, Open, Open another copy, Open all, Close all, Activate, Export, search, or file-open-tabs controls.

### Visual behavior

- Follow the committed grey-sepia color tokens, Inter typography, 4 px spacing rhythm, compact density, and soft-square corners.
- Prefer tonal separation and 1 px borders over shadows.
- Use subtle background shifts for hover and selected states.
- Provide visible keyboard focus; do not rely on color alone.
- Bundle all runtime assets locally. No CDN scripts, fonts, icons, or images are permitted.

## Accessibility

- All controls are reachable and operable by keyboard.
- Accordion headers expose expanded/collapsed state.
- Canceled menus and dialogs restore focus to their trigger. After successful deletion, focus moves to the selected successor, nearest surviving URL, or relevant create action.
- Validation and persistence errors are announced and remain visible until addressed or dismissed.
- Project and URL reordering has keyboard controls; drag-only ordering is not acceptable.
- Form fields have persistent labels rather than placeholder-only names.

## Error behavior

- Invalid input remains in the editor with a specific inline message.
- A persistence failure retains the user's current edit and displays a non-destructive error banner.
- Corrupt or unsupported stored data must not crash the workspace; it is handled by the storage boundary described in `how.md`.
- No operation in Phase 1 may open, close, assign, inspect, or move a non-Protab browser tab. Toolbar discovery may query only the clicked window for Protab's exact extension URL.

## Acceptance criteria

- **P1-A1:** The production build loads as an unpacked Manifest V3 extension without errors.
- **P1-A2:** The toolbar never creates another Protab workspace when its clicked window already has one and never reuses another window's workspace. Manually duplicated extension tabs are outside this guarantee.
- **P1-A3:** Project create, select, rename, reorder, and confirmed delete work by mouse and keyboard.
- **P1-A4:** URL create, expand, edit, autosave, reorder, copy, and delete work by mouse and keyboard.
- **P1-A5:** Same-project duplicates are prevented using the stated URL rules; cross-project duplicates remain independent.
- **P1-A6:** Automatic/custom title provenance and all metadata rules are preserved in storage.
- **P1-A7:** Global tag suggestions include locally used tags without synchronizing records.
- **P1-A8:** Projects, records, ordering, and metadata survive workspace reload and normal Chrome restart.
- **P1-A9:** The UI follows the Stitch visual language while omitting every deferred control listed above.
- **P1-A10:** The workspace makes no external network requests for data, fonts, scripts, icons, or telemetry.

## Manual acceptance checklist

1. Build and load the unpacked extension in a clean Chrome profile.
2. In two Chrome windows, click the toolbar action twice per window and verify one independent workspace per window.
3. Create, rename, reorder, and delete projects, including deletion of the final project.
4. Create two projects and save the same URL in both with different titles, tags, and notes.
5. Attempt the same-project duplicate variants covered by the URL identity rules.
6. Copy a record to another project, edit both copies, and verify no later synchronization.
7. Reload the workspace, restart Chrome, and verify all durable state.
8. Complete project and URL management using keyboard only.
9. Inspect the extension service worker and workspace consoles for errors. Separately clear and record both DevTools Network panels while exercising the workspace; verify there are no HTTP(S) requests.
10. Compare the 1280 × 1024 workspace against the Stitch reference for layout, hierarchy, palette, density, and typography—not for deferred features.

## Explicitly out of scope

Live-tab inventory or ownership, browser tab opening/closing, filing, activation, bulk tab actions, auto-detected tags, search/filtering, pinning, statuses, archive/history, settings, import/export, sync, responsive mobile navigation, and production release packaging.
