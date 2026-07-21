# Protab

Protab is a local-first Chrome extension for turning temporary browser tabs into durable, project-based URL collections.

> **Status:** Phase 4 is implemented. The extension provides persistent projects, live current-window inventory, runtime ownership, assignment, saved-URL opening, project activation with programmatic close, open all, and close all. Phase 4A (export and archive) is ready for testing.

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

The production build is entirely local: fonts, icons, scripts, and styles are bundled into `dist/`. Phase 2 requests only the `storage` and `tabs` permissions. It inventories and focuses ordinary tabs, opens saved URLs, and tracks runtime ownership; no Phase 2 path closes an ordinary tab. Phase 3 will use the existing `tabs` permission for explicitly confirmed programmatic close after durable persistence and a final URL recheck.

## Phase 2 manual checks

See [`docs/phase-2-testing.md`](docs/phase-2-testing.md) for the recorded two-window, ownership, keyboard, console, and Network checks, including the still-pending restart/failure evidence. See [`docs/phase-2-completion.md`](docs/phase-2-completion.md) for implementation evidence and the Phase 3 handoff.

## Phase 1 records

Phase 1 implementation and reported manual acceptance results are recorded in [`docs/phase-1-completion.md`](docs/phase-1-completion.md). The production extension is built into `dist/`.

The remaining V0 workflow is filing with programmatic close, followed by deliberate activation and project-wide actions. Settings remain post-V0. A future automatic-close preference may default to enabled and offer a manual user-close handoff, but its scope across filing and project-wide close actions is deliberately undecided.

## Documentation

- [Design philosophy](design_philosophy.md) — why Protab exists and the principles behind it
- [Design decisions](design_decisions.md) — agreed behavior and constraints for implementation
- [Delivery phases](development_phases.md) — testable increments for building V0
- [Implementation specifications](spec/README.md) — phase readiness and handoff documents
