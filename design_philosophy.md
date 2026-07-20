# Design philosophy

## Why Protab exists

Tabs are temporary browser state, but people often use them as reminders, research collections, and project context. That creates clutter and makes closing a window feel risky. Protab separates durable context from live browser state: projects retain useful URLs and notes, while users open only what they need now.

## Principles

### Durable context, temporary tabs

A project stores URLs, titles, tags, and notes. Live tabs are disposable working instances of those records, not the source of truth.

### Focus must be deliberate

Viewing a project is harmless. Activating it is an explicit action that closes other projects' tabs in the current window without opening anything automatically.

### Never hide uncertainty

Unassigned or ambiguously owned tabs remain visible and open. Tabs that changed URL or resisted closing require attention rather than being silently discarded.

### Ownership must be understandable

Every live tab has at most one project owner. The workspace groups tabs by that owner and keeps unassigned tabs in a separate group.

### Local first

Core data stays in Chrome's local extension storage and survives normal browser restarts. No account, server, or network service is required.

### Keep the core opinionated

V0 optimizes the save–close–reopen loop. Settings and secondary organization features should be added only after the core behavior is usable and testable.

## Non-goals for V0

Protab is not a task manager, bookmark sync service, browser session backup, or split-view manager. It supports multiple live copies of a URL, but leaves page layout and split view to Chrome.
