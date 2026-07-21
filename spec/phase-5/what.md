# Phase 5 — What to build

## Outcome

Turn the completed V0 workflow into a release-ready extension by hardening recovery, accessibility, failure handling, documentation, and the end-to-end test matrix. This phase adds no new organizational features.

## Prerequisite

Phases 1–4B are complete and their specifications reflect the implemented contracts. Any known deviations are documented before hardening begins.

## Recovery and data integrity

- Browser startup, extension reload, service-worker restart, and workspace reopening never trigger tab closing.
- Durable projects and saved records survive normal Chrome restart and extension update.
- Runtime ownership and active state recover only when evidence is unambiguous; uncertainty becomes Unassigned or No active project.
- Partial operations retain every successfully persisted record and explain unfinished items.
- Invalid or unsupported stored data remains untouched in the blocking read-only state defined in Phase 1.
- If implementation introduced a schema after V1, test migration from the actual preceding schema. Do not invent a migration solely to satisfy this phase.

## Accessibility completion

- Complete every V0 workflow with keyboard only.
- Provide visible focus, logical focus order, and focus restoration or successor focus after removed controls.
- Expose names, roles, values, expanded state, selected state, active-project state, ownership, attention, and errors to assistive technology.
- Announce asynchronous saves, operation summaries, and blocking failures without excessive repetition.
- Respect reduced-motion preferences for pulses and transitions.
- Text and controls meet WCAG 2.2 AA contrast at the provided visual tokens or use an accessible adjusted token.
- At a 1920 × 1080 desktop window zoomed to 200%, keep every action reachable with at most one-dimensional page scrolling.

## Failure hardening

Exercise and make recoverable:

- Storage read/write failure
- Invalid and future schema data
- Missing or revoked permissions
- Tabs disappearing or navigating during operations
- Tab query, create, focus, update, and close-policy failures
- Partial bulk filing, activation, Open all, and Close all
- Project or saved-record deletion during an in-flight operation
- Multiple workspace windows issuing concurrent mutations

Errors identify what succeeded, what failed, and the safest next action. Retrying must be idempotent where the original action is idempotent.

## Release documentation

Update the root README with:

- Prerequisites and exact install/build commands
- Loading the production build as an unpacked extension
- First-use walkthrough
- Project, filing, ownership, activation, and bulk-action behavior
- Local-only data and permission explanation
- Chrome unsaved-change limitation, explicitly confirmed programmatic close, and surviving-tab attention behavior
- Backup/uninstall limitation
- Troubleshooting and data-error behavior

Include a concise privacy statement: what is stored, where it is stored, and which Chrome permissions are used. Extension contexts fetch no remote assets and transmit no project/tab data, analytics, or telemetry; user-requested page navigation behaves normally and may contact its destination.

## End-to-end regression

Create one named V0 regression matrix mapping every acceptance criterion in Phase 1–4 to an automated test, a manual Chrome test, or both. No behavior may be covered only by an undocumented assumption.

The production-build journey includes:

1. Fresh-profile installation
2. Project and URL creation
3. Persistence and restart
4. Live ownership and duplicates
5. Single and bulk filing
6. Activation and unassigned preservation
7. Open all and Close all
8. Navigation drift
9. Multi-window isolation
10. Partial failures and recovery
11. Upgrade/reload behavior
12. Keyboard and basic screen-reader use

Record Chrome version, operating system, extension build identifier, results, and accepted limitations.

## Visual completion

- Compare the production workspace against the committed Stitch reference at 1280 × 1024.
- Preserve warm-minimal hierarchy, compact density, and three-pane clarity across real empty, loading, populated, ambiguous, and error states.
- Remove development placeholders and fake data.
- Ensure long project names, titles, URLs, tags, counts, and translated browser-generated text do not break layout.
- Confirm workspace and service-worker contexts fetch no remote assets or transmit product data using their Network panels. Ordinary tabs opened at the user's request may contact their destinations.

## Acceptance criteria

- **P5-A1:** All automated checks and the production build pass from a clean checkout using documented commands.
- **P5-A2:** Every Phase 1–4 acceptance criterion maps to recorded regression evidence.
- **P5-A3:** Startup, reload, restart, and ambiguous recovery never initiate a close operation.
- **P5-A4:** Real prior-schema migration passes when such a schema exists; otherwise future-version rejection remains non-destructive.
- **P5-A5:** Every V0 action is keyboard accessible and important state is conveyed to assistive technology.
- **P5-A6:** Forced failure cases preserve durable successes and produce accurate recovery guidance.
- **P5-A7:** A fresh user can build, load, and complete the first-use workflow using only the README.
- **P5-A8:** Extension contexts make no remote asset, product-data, analytics, or telemetry requests; user-requested page navigation is excluded.
- **P5-A9:** The final UI contains no controls for deferred features.

## Manual release checklist

1. Run all documented commands from a clean checkout and load only the production output.
2. Complete the full regression journey in a fresh Chrome profile.
3. Repeat critical ownership, activation, and restart cases with two windows.
4. Force each documented failure class and verify durable state afterward.
5. Exercise all workflows keyboard-only and perform a basic screen-reader pass.
6. Check a 1920 × 1080 window at 200% zoom, reduced motion, long content, and the 1280 × 1024 visual reference at normal zoom.
7. Inspect workspace and service-worker Network panels for remote assets or product-data transmission, excluding ordinary user-opened page navigation.
8. Follow README troubleshooting from a simulated invalid-storage state without changing the raw data.
9. Verify permission and privacy documentation against the production manifest and network behavior.
10. Record accepted limitations and confirm none contradict `design_decisions.md`.

## Explicitly out of scope

A future automatic-close preference may default to enabled and offer a user-close handoff, but its scope across close workflows requires a later product decision. Pinning, task statuses, archive/history/timeline, advanced search/filtering, nested projects, cloud sync, telemetry, mobile UI, publishing to the Chrome Web Store, and other post-V0 feature design are also out of scope.
