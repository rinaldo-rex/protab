# Protab

Protab is a local-first Chrome extension for turning temporary browser tabs into durable, project-based URL collections.

> **Status:** Phase 1 is implemented. The extension provides persistent projects and saved URL records; live-tab integration begins in Phase 2.

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

Pinning, settings UI, archive/history, statuses, search, import/export, and cloud sync are deferred.

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

The production build is entirely local: fonts, icons, scripts, and styles are bundled into `dist/`. Phase 1 requests only the `storage` and `tabs` permissions and does not inspect or manipulate ordinary browser tabs.

## Phase 1 manual checks

See [`docs/phase-1-testing.md`](docs/phase-1-testing.md) for the two-window, persistence, keyboard, network, and visual acceptance checks.

## Phase 1 completion

Phase 1 implementation and reported manual acceptance results are recorded in [`docs/phase-1-completion.md`](docs/phase-1-completion.md). The production extension is built into `dist/`.

The remaining V0 workflow—including live-tab ownership, filing, activation, and tab opening or closing—belongs to later phases.

## Documentation

- [Design philosophy](design_philosophy.md) — why Protab exists and the principles behind it
- [Design decisions](design_decisions.md) — agreed behavior and constraints for implementation
- [Delivery phases](development_phases.md) — testable increments for building V0
- [Implementation specifications](spec/README.md) — phase readiness and handoff documents
