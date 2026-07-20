# Protab

Protab is a local-first Chrome extension for turning temporary browser tabs into durable, project-based URL collections.

> **Status:** Product design only. There is not yet a runnable extension or development setup.

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

## Documentation

- [Design philosophy](design_philosophy.md) — why Protab exists and the principles behind it
- [Design decisions](design_decisions.md) — agreed behavior and constraints for implementation
- [Delivery phases](development_phases.md) — testable increments for building V0
