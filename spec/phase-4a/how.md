# Phase 4A — How to build it

This document fixes the implementation boundaries for project export and tab archiving on top of the completed Phase 4 code. Phase 4A adds two independent features: self-contained HTML export and per-URL archiving with keyboard shortcuts.

Local names and component decomposition may vary when tests, ordering, safety, and product behavior remain equivalent.

## Technology and completed Phase 4 baseline

Retain the existing stack and command contract:

- TypeScript in strict mode
- React and Vite
- Manifest V3 background service worker and full-page `workspace.html`
- Vitest, jsdom, Testing Library, and ESLint
- Plain CSS using the committed Stitch tokens
- Locally bundled Inter and icons
- npm with committed lockfile

Required checks remain:

```sh
npm test
npm run lint
npm run build
```

Extend the actual Phase 4 seams rather than replacing them:

- `src/background/index.ts` remains the service-worker composition root.
- `src/background/tabs/coordinator.ts` owns live-tab operations.
- `src/domain/types.ts` contains `PersistedStateV1`, `Project`, `SavedUrl`.
- `src/storage/commandQueue.ts` serializes durable mutations.
- `src/workspace/App.tsx` is the main workspace layout.
- `src/workspace/SavedUrlAccordion.tsx` displays individual saved URLs.
- `src/workspace/ProjectActions.tsx` contains the project action menu.

Do not let React call Chrome APIs, write storage, or decide eligibility from stale props. The background revalidates every operation.

---

## Feature 1: Export

### Export HTML template

Create a pure function that generates a self-contained HTML string:

```ts
function generateExportHtml(project: Project, options: { includeArchived: boolean }): string
```

The HTML template includes:

1. **Inline CSS**: All required styles (Inter font as base64, Stitch tokens, layout, typography).
2. **Minimal icons**: Only SVG paths for Folder, Tag, ExternalLink, Archive icons.
3. **Project header**: Project name, export timestamp, active/archived counts.
4. **Active URLs section**: List of active saved URLs with title, URL (link), tags, notes.
5. **Archived URLs section** (if `includeArchived`): Labeled "Archived" with archived date.

### HTML structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{project.name} — Protab Export</title>
  <style>
    /* Inlined CSS: Inter font, tokens, layout */
  </style>
</head>
<body>
  <header>
    <h1>{project.name}</h1>
    <p>Exported {timestamp} · {activeCount} active · {archivedCount} archived</p>
  </header>
  <section class="active-urls">
    <h2>Active URLs</h2>
    <!-- URL cards -->
  </section>
  <section class="archived-urls">
    <h2>Archived</h2>
    <!-- Archived URL cards with archived date -->
  </section>
</body>
</html>
```

### URL card structure

```html
<article class="url-card">
  <h3><a href="{url}" target="_blank" rel="noopener">{title}</a></h3>
  <p class="url">{url}</p>
  <div class="tags">
    <span class="tag">{tag}</span>
    <!-- ... -->
  </div>
  {notes && <p class="notes">{notes}</p>}
  {archivedAt && <p class="archived-date">Archived {formattedDate}</p>}
</article>
```

### Font inlining

Inter font files are already bundled in the extension. For export:

1. Read the font files as base64 during build time.
2. Inline them in the HTML `<style>` block as `@font-face` rules.
3. This makes the HTML fully self-contained (no external dependencies).

Use Vite's `?url` import or a build plugin to inline fonts:

```ts
import interLatin400 from '../../assets/inter-latin-400-normal.woff2?base64'
import interLatin500 from '../../assets/inter-latin-500-normal.woff2?base64'
import interLatin600 from '../../assets/inter-latin-600-normal.woff2?base64'
```

### Icon inlining

Inline only the SVG paths needed for export (not the full icon library):

```ts
const icons = {
  folder: '<svg><!-- path --></svg>',
  tag: '<svg><!-- path --></svg>',
  externalLink: '<svg><!-- path --></svg>',
  archive: '<svg><!-- path --></svg>',
}
```

### Export all (ZIP)

Use a lightweight ZIP library (e.g., `fflate` or `jszip`):

1. Generate one HTML file per project using `generateExportHtml`.
2. Bundle them into a ZIP file.
3. Trigger download as `protab-export-{date}.zip`.

Add `fflate` as a dependency (6KB gzipped):

```sh
npm install fflate
```

### Export triggers

**Single project export**:
- Add "Export" to `ProjectActions.tsx` menu.
- On click: generate HTML, create Blob, trigger download.

**Export all**:
- Add "Export all" button in sidebar heading area in `App.tsx`.
- On click: generate HTML for each project, create ZIP, trigger download.

### Download helper

```ts
function downloadFile(filename: string, content: Blob): void {
  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### Filename sanitization

```ts
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 50)
}
```

---

## Feature 2: Archive

### Schema migration (V1 → V2)

Update `PersistedStateV1` to `PersistedStateV2`:

```ts
interface PersistedStateV2 {
  schemaVersion: 2
  projects: ProjectV2[]
}

interface ProjectV2 {
  id: string
  name: string
  savedUrls: SavedUrlV2[]
}

interface SavedUrlV2 {
  id: string
  url: string
  title: string
  titleSource: 'automatic' | 'custom'
  tags: string[]
  notes: string
  archivedAt: number | null  // NEW: timestamp when archived, null if active
}
```

Migration logic:

```ts
function migrateV1ToV2(state: PersistedStateV1): PersistedStateV2 {
  return {
    schemaVersion: 2,
    projects: state.projects.map((project) => ({
      ...project,
      savedUrls: project.savedUrls.map((url) => ({
        ...url,
        archivedAt: null,  // All existing URLs are active
      })),
    })),
  }
}
```

### Archive command

Add a new command type:

```ts
type Command =
  | ExistingCommand
  | {
      type: 'ARCHIVE_SAVED_URL'
      projectId: string
      savedUrlId: string
      archived: boolean  // true = archive, false = unarchive
    }
```

The command:

1. Resolves the latest project and saved URL.
2. Sets `archivedAt` to `Date.now()` if archiving, `null` if unarchiving.
3. Returns the updated state.

### Archive confirmation for open tabs

When archiving a URL that's currently open:

1. Check if any live tab is owned by this `{projectId, savedUrlId}`.
2. If yes, show confirmation dialog: "This tab is currently open. Archive it anyway?"
3. Options:
   - **Archive and close**: Archive the URL and close the tab (using Phase 3 close workflow).
   - **Archive only**: Archive the URL, keep the tab open (ownership remains).
   - **Cancel**: Do nothing.

Protocol:

```ts
{ kind: 'PREPARE_ARCHIVE_URL'; projectId: string; savedUrlId: string }
{ kind: 'CONFIRM_ARCHIVE_URL'; operationId: string; action: 'archive-close' | 'archive-only' }
{ kind: 'CANCEL_ARCHIVE_URL'; operationId: string }
```

### Unarchive

Unarchive is simpler: just set `archivedAt: null`. No confirmation needed.

```ts
{ kind: 'UNARCHIVE_URL'; projectId: string; savedUrlId: string }
```

### UI: Project sections

Update the project workspace in `App.tsx` to show two sections:

```tsx
{selected && (
  <>
    {/* Active URLs */}
    <div className="url-list" aria-label={`Active URLs in ${selected.name}`}>
      {activeUrls.map((record) => (
        <SavedUrlAccordion key={record.id} ... />
      ))}
    </div>

    {/* Archived URLs */}
    {archivedUrls.length > 0 && (
      <div className="archived-section">
        <button
          className="archived-heading"
          aria-expanded={archivedExpanded}
          onClick={() => setArchivedExpanded(!archivedExpanded)}
        >
          <span>Archived ({archivedUrls.length})</span>
          <ChevronDown />
        </button>
        {archivedExpanded && (
          <div className="url-list archived">
            {archivedUrls.map((record) => (
              <SavedUrlAccordion key={record.id} ... archived />
            ))}
          </div>
        )}
      </div>
    )}
  </>
)}
```

### UI: Context menu

Add right-click context menu to `SavedUrlAccordion`:

```tsx
const handleContextMenu = (event: React.MouseEvent) => {
  event.preventDefault()
  setContextMenu({ x: event.clientX, y: event.clientY })
}

// Context menu items:
// - Archive / Unarchive
// - Open in new tab
// - Copy URL
```

### UI: Keyboard shortcuts

Add keyboard event handler to `SavedUrlAccordion`:

```tsx
const handleKeyDown = (event: React.KeyboardEvent) => {
  // Only when hovering and not in text input
  if (isHovering && !isTextInput(event.target)) {
    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault()
      toggleArchive()
    }
    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault()
      focusNotes()
    }
  }
}
```

### UI: Shortcut hints

Show hints on hover:

```tsx
<div className="shortcut-hints">
  {isArchived ? (
    <span className="shortcut-hint">Unarchive (R)</span>
  ) : (
    <span className="shortcut-hint">Archive (R)</span>
  )}
  <span className="shortcut-hint">Note (N)</span>
</div>
```

### UI: "Open all" renaming

- Project header: Rename "Open all" to "Open all active".
- Archived section menu: Add "Open all archived" option.

### Archive and activation

Update the activation logic in `coordinator.ts`:

- When preparing activation, exclude archived URLs from the "other project tabs" calculation.
- When opening all URLs (Open all), only open active URLs.

The archive status is in the durable state, so the background can filter:

```ts
const activeUrls = project.savedUrls.filter((url) => !url.archivedAt)
```

### Archive and Open all

Update `openAllProjectUrls` in `coordinator.ts`:

```ts
// Only open active URLs
const urlsToOpen = project.savedUrls.filter((url) => !url.archivedAt)
```

Add a new message for opening archived URLs:

```ts
{ kind: 'OPEN_ALL_ARCHIVED_URLS'; projectId: string }
```

---

## Suggested source boundaries

```text
src/
├── background/
│   ├── index.ts
│   ├── messages.ts              add archive/unarchive messages
│   └── tabs/
│       ├── coordinator.ts       add archive/unarchive handlers
│       └── ...
├── domain/
│   ├── types.ts                 update to V2 schema
│   ├── commands.ts              add ARCHIVE_SAVED_URL command
│   ├── applyCommand.ts          handle archive command
│   └── migration.ts             V1 → V2 migration logic
├── storage/
│   ├── commandQueue.ts          add migration support
│   └── schema.ts                update schema validation
├── workspace/
│   ├── App.tsx                  add archived section, export buttons
│   ├── SavedUrlAccordion.tsx    add context menu, keyboard shortcuts
│   ├── ProjectActions.tsx       add Export action
│   ├── ArchiveConfirmDialog.tsx new: confirmation for archiving open tabs
│   ├── ExportAllButton.tsx      new: export all projects
│   └── export/
│       ├── generateHtml.ts      new: HTML export generation
│       ├── inlineStyles.ts      new: inlined CSS for export
│       ├── inlineFonts.ts       new: inlined fonts (base64)
│       └── createZip.ts         new: ZIP creation for export all
└── styles/
    └── global.css               add archived section styles
```

---

## Test strategy

### Migration tests

Cover:

- V1 → V2 migration preserves all existing URLs
- All migrated URLs have `archivedAt: null`
- Migration is idempotent (running twice produces same result)
- Invalid V1 data is handled gracefully

### Archive command tests

Cover:

- Archive sets `archivedAt` to current timestamp
- Unarchive sets `archivedAt` to null
- Archive preserves all other URL metadata
- Archive does not affect other URLs in the project
- Archive does not affect live tab ownership

### Export tests

Cover:

- Export HTML contains all project data
- Export HTML links are clickable (have `href` and `target="_blank"`)
- Export HTML includes archived section when `includeArchived: true`
- Export HTML excludes archived section when `includeArchived: false`
- Export all ZIP contains one HTML per project
- Filename sanitization removes special characters

### Archive UI tests

Cover:

- Active and archived sections are separate
- Archived section is collapsed by default
- Right-click shows context menu with Archive/Unarchive
- R shortcut archives when hovering over active accordion
- R shortcut unarchives when hovering over archived accordion
- N shortcut focuses notes textarea
- Shortcuts don't work when typing in text fields
- Confirmation dialog appears when archiving open tab
- "Open all active" only opens active URLs
- "Open all archived" only opens archived URLs

### Manual Chrome tests

Complete `what.md` against the production build, including:

- Export single project and verify offline HTML
- Export all projects and verify ZIP contents
- Archive via right-click and keyboard shortcut
- Archive open tab with confirmation
- Unarchive and verify return to active section
- Verify activation excludes archived URLs
- Verify Open all only opens active URLs
- Verify keyboard shortcuts work on hover
- Verify shortcuts don't conflict with text input

---

## Atomic commit sequence

1. `feat: add V1→V2 schema migration with archivedAt field`
2. `feat: add archive/unarchive commands and handlers`
3. `feat: add archived section UI with collapsible display`
4. `feat: add archive context menu and keyboard shortcuts`
5. `feat: add single project HTML export`
6. `feat: add export all projects as ZIP`
7. `docs: add Phase 4A loading and test instructions`

Commit 1 introduces the migration without any UI changes. Commit 2 adds the backend logic. Commits 3 and 4 add the UI. Commits 5 and 6 add export functionality. Commit 7 adds documentation.

---

## Completion evidence

Before declaring Phase 4A complete, provide:

- commit list matching the sequence above or an explanation for any split/merge
- output of `npm test`, `npm run lint`, and `npm run build`
- production build location and unpacked-loading steps
- manual checklist results with Chrome version and OS
- evidence that export HTML works offline
- evidence that export HTML links are clickable
- evidence that archive/unarchive works via right-click and keyboard
- evidence that archived URLs are excluded from activation and Open all
- evidence that schema migration preserves all existing data
- evidence of keyboard shortcut behavior (hover scope, text input exclusion)
- console and Network review results
- exact manifest permissions
- deviations, unresolved risks, and interfaces Phase 5 must preserve
