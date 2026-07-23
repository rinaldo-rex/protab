# Protab

Protab is a local-first Chrome extension for turning temporary browser tabs into durable, project-based URL collections.

> **Status:** Phase 4D is the current phase. Phase 4C was skipped — the work originally scoped for it was handled through ad-hoc changes during Phase 4B. The extension provides persistent projects, live current-window inventory, runtime ownership, assignment, saved-URL opening, project activation with programmatic close, open all, close all, project export/import, URL archiving, quick-capture popup, hover shortcuts, drag-to-rearrange, and minimal settings.

## Core workflow

1. Create or select a project in the full-page workspace.
2. Drag an unassigned, open tab into that project. Protab saves the URL and closes the tab.
3. Activate a project to close tabs owned by other projects in the current window. Unassigned tabs stay open.
4. Open one saved URL, open another copy, or open all saved URLs when needed.

Projects, URLs, titles, tags, and notes persist locally across browser restarts. Protab does not sync or upload this data.

## V0 scope

- Projects containing saved URL accordions
- Editable titles, multiple tags, and notes
- Current-window tabs grouped by project or **Unassigned**
- Separate project selection and activation
- Individual and bulk open/close actions
- Safe warnings for tabs that could not be closed or whose URL changed
- Local persistence and non-destructive startup recovery
- Project export as self-contained HTML files
- Project import from HTML and ZIP files via drag-and-drop
- URL archiving with context menu and keyboard shortcuts
- Quick-capture popup for zero-friction tab capture
- Hover shortcut 'Add (A)' for keyboard filing
- Drag-to-rearrange saved URLs and projects
- Minimal settings (shortcut, close behavior, toast duration, configurable popup workspace shortcut)

Pinning, cloud sync, and Chrome Web Store publishing are deferred.

## Develop and test

Requirements: Node.js 22 or newer and npm.

```sh
npm install
npm test
npm run lint
npm run build
```

`npm run dev` starts the Vite workspace development server. Chrome extension behavior must be verified from the production build.

## Load the extension locally

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository's `dist/` directory.
5. Pin Protab if desired, then click its toolbar action to open the full-page workspace.

The production build is entirely local: fonts, icons, scripts, and styles are bundled into `dist/`. The extension requests `storage`, `tabs`, `activeTab`, and `contextMenus` permissions. It inventories and focuses ordinary tabs, opens saved URLs, tracks runtime ownership, closes tabs with explicit confirmation, exports projects as self-contained HTML, archives URLs, and provides a quick-capture popup.

### Extension icon behavior

- **Click**: Opens a quick-capture popup anchored to the icon (tooltip style)
- **Right-click**: Shows context menu with "Open workspace in new tab" option
- **Ctrl+Shift+X**: Opens the same quick-capture popup from any tab
- **Popup footer**: Contains an "Open workspace" link with a keyboard shortcut hint (default: `Ctrl+↵`) to access the full workspace

## Testing

- [Phase 4B testing](docs/phase-4b-testing.md) — quick-capture, hover shortcuts, drag-to-rearrange, settings
- [Phase 4A testing](docs/phase-4a-testing.md) — export, import, archive, keyboard shortcuts
- [Phase 4 testing](docs/phase-4-testing.md) — activation, open all, close all
- [Phase 3 testing](docs/phase-3-testing.md) — programmatic close with confirmation
- [Phase 2 testing](docs/phase-2-testing.md) — filing, ownership, two-window isolation
- [Phase 1 testing](docs/phase-1-testing.md) — basic project and URL management

## Documentation

- [Design philosophy](design_philosophy.md) — why Protab exists and the principles behind it
- [Design decisions](design_decisions.md) — agreed behavior and constraints for implementation
- [Delivery phases](development_phases.md) — testable increments for building V0
- [Implementation specifications](spec/README.md) — phase readiness and handoff documents
