# Phase 4B — How to build it

This document fixes the implementation boundaries for zero-friction capture, keyboard shortcuts, drag-to-rearrange, and minimal settings on top of the completed Phase 4 code. Phase 4B reuses the existing filing primitive, command queue, and workspace patterns.

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

- `src/background/index.ts` remains the service-worker composition root and registers Chrome listeners once.
- `src/background/tabs/coordinator.ts` owns validated workspace subscriptions, current-window operations, inventory refreshes, and per-window serialization.
- `src/background/tabs/chromeTabs.ts` is the narrow Chrome tabs/windows adapter.
- `src/background/tabs/ownershipStore.ts` remains the validated `chrome.storage.session` repository.
- `src/background/tabs/filing.ts` owns single/bulk filing orchestration and the shared close primitive.
- `src/background/tabs/closeTracker.ts` owns non-blocking close observation and attention state.
- `CommandQueue` remains the only serializer for durable project mutations.
- `PersistedStateV1` remains the durable project schema.
- `src/background/messages.ts`, `src/workspace/useLiveTabs.ts`, and `CurrentTabsPane.tsx` remain the product-level live protocol and UI channel.

Do not let React call Chrome APIs, write storage, decide eligibility from stale props, or synthesize successful results. The background revalidates every operation.

---

## Feature 1: Quick-capture popup

### Manifest changes

Add `activeTab` permission and a `commands` entry:

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "tabs", "activeTab"],
  "commands": {
    "quick-capture": {
      "suggested_key": {
        "default": "Ctrl+Shift+X",
        "mac": "Command+Shift+X"
      },
      "description": "Open quick-capture popup"
    }
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "Quick capture"
  }
}
```

### Popup architecture

Create a separate entry point for the popup:

```text
src/
├── popup/
│   ├── index.html
│   ├── main.tsx
│   ├── QuickCapture.tsx
│   └── popup.css
```

The popup communicates with the background via `chrome.runtime.sendMessage` (same as the workspace). It does not use a long-lived port connection.

### Popup component

```tsx
// QuickCapture.tsx
interface QuickCaptureProps {
  onSubmit: (note: string, tags: string[], projectId: string) => void
  onCancel: () => void
}

// Smart input: single line, expands on Shift+Enter or long text
// Inline autocomplete for # and @
```

### Text parsing

Implement a pure function to parse the input:

```ts
interface ParsedCapture {
  note: string
  tags: string[]
  projectName: string
}

function parseCaptureInput(input: string): ParsedCapture {
  // 1. Find the last @<project> (everything after the last @ is the project name)
  // 2. Find all #<tag> occurrences
  // 3. Everything else is the note
  // 4. Trim and normalize
}
```

Rules:
- `@` at the end of the string starts the project name.
- Multiple `#tag` are allowed; each `#` starts a new tag.
- Tags end at whitespace or another `#` or `@`.
- Project name ends at the end of the string (no termination character needed).
- If no `@` is found, `projectName` is empty → error.

### Autocomplete

Implement an inline autocomplete dropdown:

```ts
interface AutocompleteOption {
  type: 'tag' | 'project' | 'create-tag'
  label: string
  value: string
}
```

When the user types `#`:
1. Extract the partial tag after `#`.
2. Search existing tags across all projects (from `PersistedStateV1`).
3. Show matching tags as options.
4. If no exact match, show "+ Create 'xyz'" option.
5. User selects with arrow keys + `Enter` or click.

When the user types `@`:
1. Extract the partial project name after `@`.
2. Search existing project names (fuzzy match).
3. Show matching projects as options.
4. If no match, show "No project found" (error state).

### Background message

Add a new message type for quick-capture:

```ts
// In messages.ts
export type LiveTabRequest =
  | ExistingRequests
  | { kind: 'QUICK_CAPTURE_TAB'; projectId: string; note: string; tags: string[] }

export type LiveTabMessage =
  | ExistingMessages
  | { kind: 'QUICK_CAPTURE_RESULT'; success: boolean; projectName: string; error?: string }
```

### Background handler

In `coordinator.ts`, add a `quickCaptureTab` method:

```ts
private async quickCaptureTab(client: ClientSubscription, projectId: string, note: string, tags: string[]): Promise<void> {
  // 1. Get current tab (from the sender's window, not the workspace)
  // 2. Validate: project exists, tab is fileable
  // 3. Execute FILE_LIVE_TAB command (reuse Phase 3 primitive)
  // 4. If URL already exists, execute UPDATE_SAVED_URL to add tags and append note
  // 5. Post QUICK_CAPTURE_RESULT
}
```

### Popup lifecycle

1. User presses shortcut → Chrome opens popup.
2. Popup queries current tab info via `chrome.tabs.query({ active: true, currentWindow: true })`.
3. User types and presses `Enter`.
4. Popup sends `QUICK_CAPTURE_TAB` message to background.
5. Background processes and returns result.
6. Popup shows green checkmark or error.
7. User closes popup manually.

### Settings storage

Store settings in `chrome.storage.local` as a separate key, independent of project state:

```ts
const SETTINGS_STORAGE_KEY = 'protab.settings.v1'

interface ProtabSettings {
  schemaVersion: 1
  pageCloseBehavior: boolean // Extension page: true = close tab after filing (default: true)
  popupCloseBehavior: boolean // Extension popup: true = close tab after capture (default: false)
  toastDuration: number // milliseconds: 2000, 3000, 5000, or 0 (manual)
}
```

The shortcut is display-only; Chrome manages the actual shortcut binding at `chrome://extensions/shortcuts`. The settings panel shows the current shortcut (default: `Ctrl+Shift+X`) and links to Chrome's shortcut page.

---

## Feature 2: Hover shortcut 'Add (A)'

### Keyboard listener

Add a global keyboard listener in `CurrentTabsPane.tsx` that activates when a tab row is hovered:

```tsx
const [hoveredTabId, setHoveredTabId] = useState<number | null>(null)

useEffect(() => {
  if (!hoveredTabId) return

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'a' || event.key === 'A') {
      event.preventDefault()
      if (hoveredTabId && selectedProjectId) {
        model.prepareFileTab(hoveredTabId, selectedProjectId)
        // Skip confirmation: directly confirm
        // Or: use a silent filing path
      }
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [hoveredTabId, selectedProjectId, model])
```

### Silent filing path

Add a new message type for silent filing (no confirmation):

```ts
// In messages.ts
export type LiveTabRequest =
  | ExistingRequests
  | { kind: 'SILENT_FILE_TAB'; tabId: number; projectId: string }
```

The background handler:
1. Validates tab and project.
2. Executes `FILE_LIVE_TAB` command.
3. Establishes ownership.
4. Issues close request (using shared close primitive).
5. Posts result (success/failure).

### Toast component

Create a toast component that overlays the tab row:

```tsx
interface TabToastProps {
  message: string
  type: 'success' | 'error'
  duration: number
  onDismiss: () => void
}
```

The toast:
- Appears as an overlay on the tab row.
- Auto-dismisses after `duration` milliseconds.
- Pauses auto-dismiss on hover.
- Has a close button for manual dismiss.

---

## Feature 3: Drag-to-rearrange saved URLs

### Drag handle

Add a hamburger icon (☰) to the left of each accordion header:

```tsx
<div className="accordion-header">
  <div
    className="drag-handle"
    draggable="true"
    onDragStart={(e) => handleDragStart(e, record.id)}
    onDragOver={(e) => handleDragOver(e, record.id)}
    onDrop={(e) => handleDrop(e, record.id)}
    aria-label="Drag to reorder"
  >
    <GripVertical size={16} /> {/* or custom hamburger icon */}
  </div>
  <button className="accordion-toggle" ...>
    {/* existing content */}
  </button>
</div>
```

### Drag state

Track drag state in the parent component (`App.tsx` or a new `SortableUrlList`):

```tsx
const [draggingUrlId, setDraggingUrlId] = useState<string | null>(null)
const [dragOverUrlId, setDragOverUrlId] = useState<string | null>(null)
```

### Reorder logic

On drop:
1. Calculate the new index based on the drop target.
2. Execute `REORDER_SAVED_URL` command (existing).
3. Persist the new order.

### CSS

```css
.drag-handle {
  cursor: grab;
  opacity: 0;
  transition: opacity 0.15s;
}

.url-accordion:hover .drag-handle {
  opacity: 1;
}

.drag-handle:active {
  cursor: grabbing;
}

.url-accordion.dragging {
  opacity: 0.5;
}

.url-accordion.drag-over {
  border-top: 2px solid var(--primary);
}
```

---

## Feature 4: Drag-to-rearrange projects

### Drag behavior

The project row is already clickable (select). We need to distinguish click vs drag:

```tsx
const [isDragging, setIsDragging] = useState(false)
const dragStartPos = useRef<{ x: number; y: number } | null>(null)

function handleMouseDown(e: React.MouseEvent) {
  dragStartPos.current = { x: e.clientX, y: e.clientY }
}

function handleMouseMove(e: React.MouseEvent) {
  if (!dragStartPos.current) return
  const dx = Math.abs(e.clientX - dragStartPos.current.x)
  const dy = Math.abs(e.clientY - dragStartPos.current.y)
  if (dx > 5 || dy > 5) {
    setIsDragging(true)
    // Start drag
  }
}

function handleMouseUp() {
  if (!isDragging) {
    // It was a click
    model.selectProject(project.id)
  }
  setIsDragging(false)
  dragStartPos.current = null
}
```

Alternatively, use HTML5 drag-and-drop with a movement threshold:

```tsx
<div
  className="project-row"
  draggable="true"
  onDragStart={(e) => {
    // Only start drag if mouse moved > 5px from mousedown
    // Use a custom drag preview
  }}
  onClick={() => model.selectProject(project.id)}
>
```

### Reorder logic

On drop:
1. Calculate the new index based on the drop target.
2. Execute `REORDER_PROJECT` command (existing).
3. Persist the new order.

### CSS

```css
.project-row {
  cursor: pointer;
}

.project-row[draggable="true"] {
  cursor: grab;
}

.project-row.dragging {
  opacity: 0.5;
}

.project-row.drag-over {
  border-top: 2px solid rgba(255,255,255,.5);
}
```

---

## Feature 5: Minimal settings

### Settings panel

Create a new component `SettingsPanel.tsx`:

```tsx
interface SettingsPanelProps {
  settings: ProtabSettings
  onSave: (settings: Partial<ProtabSettings>) => void
  onBack: () => void
}
```

The panel renders in the center pane, replacing the project canvas:

```tsx
{viewMode === 'settings' ? (
  <SettingsPanel settings={settings} onSave={handleSave} onBack={() => setViewMode('workspace')} />
) : (
  {/* existing project canvas */}
)}
```

### Settings fields

The settings panel is divided into two sections:

**Extension Page** (workspace behavior):
1. **Close tab after filing**: Toggle switch. When enabled (default), pressing 'A' to file a tab from the Current Tabs pane closes the tab after saving.

**Extension Popup** (quick-capture behavior):
2. **Close tab after capture**: Toggle switch. When disabled (default), quick-capture keeps the tab open after saving. When enabled, the tab is closed.

**General**:
3. **Quick-capture shortcut**: Display field (read-only) showing the current shortcut (default: `Ctrl+Shift+X`). Includes a link to `chrome://extensions/shortcuts` where users can change it.

4. **Toast duration**: Dropdown with options: 2 seconds, 3 seconds, 5 seconds, Manual dismiss.

### Settings persistence

Store settings in `chrome.storage.local` as a separate key, independent of project state:

```ts
const SETTINGS_STORAGE_KEY = 'protab.settings.v1'

interface ProtabSettings {
  schemaVersion: 1
  pageCloseBehavior: boolean // Extension page: close tab after filing (default: true)
  popupCloseBehavior: boolean // Extension popup: close tab after capture (default: false)
  toastDuration: number // milliseconds: 2000, 3000, 5000, or 0 (manual)
}
```

### Settings initialization

On extension startup, read settings from storage:

```ts
async function readSettings(): Promise<ProtabSettings> {
  const values = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)
  return parseSettings(values[SETTINGS_STORAGE_KEY])
}
```

Pass settings to the workspace via a new hook:

```ts
function useSettings(): [ProtabSettings, (update: Partial<ProtabSettings>) => void] {
  // Read settings on mount
  // Provide update function
}
```

---

## Suggested source boundaries

```text
src/
├── background/
│   ├── index.ts
│   ├── messages.ts              extend with QUICK_CAPTURE_TAB, SILENT_FILE_TAB
│   └── tabs/
│       ├── coordinator.ts       extend with quickCaptureTab, silentFileTab
│       ├── chromeTabs.ts        existing
│       ├── ownershipStore.ts    existing
│       ├── filing.ts            existing shared close primitive
│       ├── closeTracker.ts      existing
│       └── activeProjectStore.ts existing
├── domain/
│   ├── commands.ts              existing
│   ├── applyCommand.ts          existing
│   ├── liveTabs.ts              existing
│   ├── ownership.ts             existing
│   ├── captureParser.ts         new: pure text parsing
│   └── tagSuggestions.ts        existing
├── popup/
│   ├── index.html               new: popup entry point
│   ├── main.tsx                 new: popup React root
│   ├── QuickCapture.tsx         new: main popup component
│   └── popup.css                new: popup styles
├── workspace/
│   ├── App.tsx                  extend with settings view mode
│   ├── SettingsPanel.tsx        new: settings UI
│   ├── CurrentTabsPane.tsx      extend with hover shortcut 'A'
│   ├── SortableUrlList.tsx      new: drag-to-reorder URLs
│   ├── ProjectSidebar.tsx       new: drag-to-reorder projects
│   ├── Toast.tsx                new: toast component
│   └── useSettings.ts           new: settings hook
└── styles/
    ├── global.css               extend with drag, toast, settings styles
    └── popup.css                new: popup-specific styles
```

---

## Test strategy

### Text parsing tests

Cover:
- Single tag, single project
- Multiple tags, single project
- No tag, single project
- No note (starts with # or @)
- Missing @Project → error
- Empty input → error
- @ in the middle of text (not a project)
- # in the middle of text (not a tag)
- Project name with spaces (not supported; @ ends at space)
- Special characters in tags

### Autocomplete tests

Cover:
- # triggers tag autocomplete
- @ triggers project autocomplete
- Fuzzy matching for projects
- "Create new tag" option for unmatched tags
- Arrow key navigation
- Enter to select
- Escape to dismiss

### Quick-capture integration tests

Cover:
- Popup opens on shortcut
- Current tab URL and title are captured
- FILE_LIVE_TAB command is executed
- Duplicate URL updates existing record
- Success shows green checkmark
- Error shows error message
- Popup stays open on error

### Hover shortcut tests

Cover:
- 'A' key files hovered tab to selected project
- No project selected shows toast
- Toast appears on tab row
- Toast auto-dismisses after duration
- Toast pauses on hover

### Drag-to-reorder tests

Cover:
- Drag handle appears on hover
- Drag initiates reorder
- New order is persisted
- Multiple reorders in sequence
- Drag to same position (no-op)

### Drag-to-reorder projects tests

Cover:
- Project row is draggable
- Click still selects project
- Drag initiates reorder
- New order is persisted
- Movement threshold distinguishes click vs drag

### Settings tests

Cover:
- Settings panel opens on gear icon click
- Settings are persisted to storage
- Settings are loaded on startup
- Shortcut display is correct
- Close behavior toggle works
- Toast duration dropdown works

### Manual Chrome tests

Complete `what.md` against the production build, including:
- Quick-capture with various input formats
- Autocomplete for tags and projects
- Error handling (missing project, storage failure)
- Hover 'A' shortcut with toast
- Drag-to-reorder URLs
- Drag-to-reorder projects
- Settings panel
- Keyboard-only completion

---

## Atomic commit sequence

1. `feat: add capture text parser and autocomplete`
2. `feat: add quick-capture popup with background handler`
3. `feat: add hover shortcut 'A' with silent filing`
4. `feat: add drag-to-rearrange saved URLs`
5. `feat: add drag-to-rearrange projects`
6. `feat: add minimal settings panel`
7. `docs: add Phase 4B loading and test instructions`

Commit 1 introduces the pure text parsing and autocomplete logic without UI. Commit 2 adds the popup and background handler. Commit 3 adds the hover shortcut. Commits 4 and 5 add drag-to-reorder. Commit 6 adds settings. Commit 7 adds documentation.

---

## Completion evidence

Before declaring Phase 4B complete, provide:

- commit list matching the sequence above or an explanation for any split/merge
- output of `npm test`, `npm run lint`, and `npm run build`
- production build location and unpacked-loading steps
- manual checklist results with Chrome version and OS
- evidence that quick-capture parses input correctly
- evidence that autocomplete works for tags and projects
- evidence that missing project shows error
- evidence that duplicate URL updates existing record
- evidence that hover 'A' files to selected project
- evidence that toast appears and auto-dismisses
- evidence that drag-to-reorder URLs works
- evidence that drag-to-reorder projects works
- evidence that click-to-select still works on projects
- evidence that settings persist across sessions
- evidence of keyboard-only completion
- console and Network review results
- exact manifest permissions
- deviations, unresolved risks, and interfaces Phase 5 must preserve
