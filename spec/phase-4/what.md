# Phase 4 — What to build

## Outcome

Add deliberate, per-window project focus. Users can activate a project, open all of its saved URLs, or close all of its live instances while unassigned tabs and other Chrome windows remain untouched.

## Prerequisite

Phase 3 is complete and its shared programmatic-close workflow is the single V0 behavior for every extension-initiated close in this phase.

## Selected versus active project

- **Selected** controls which project is displayed and edited in the center pane.
- **Active** identifies the project currently in focus for this Chrome window.
- Selecting is always harmless: it opens and closes no browser tabs.
- A selected project can differ from the active project.
- Each window has independent selected and active state.
- Clearly distinguish selected and active states in the sidebar and project header without relying on color alone.

## Activate

Activating the selected project:

1. Identifies live tabs owned by other projects in the same Chrome window.
2. Applies navigation-drift review and the shared programmatic-close workflow to those tabs.
3. Leaves tabs owned by the selected project open.
4. Leaves every unassigned tab open.
5. Never opens the selected project's saved URLs.
6. If the user cancels before the operation begins, leaves active state unchanged. Once the user confirms, marks the selected project active after close requests are issued, even when some targets are kept, pending, skipped, or failed; those exceptions remain visible as needs-attention items.

If unassigned tabs remain, pulse their group once and show a dismissible notice with the count. The pulse must respect reduced-motion preferences and must not repeat continuously.

Activation in one window never targets tabs or active state in another window.

## Navigation drift

A project-owned tab has drifted when its current URL differs from the URL that established ownership.

- For activation and Close all, drifted provenance still identifies the former owning project for review/targeting even though the row is displayed under Unassigned.
- Before activation or Close all acts on drifted tabs, show a review listing each saved/original URL and current URL.
- The user can keep individual drifted tabs open while continuing with the others.
- Kept tabs remain owned unless explicitly reassigned; they receive a clear needs-review marker for this operation.
- Never update a saved URL automatically from navigation drift.
- Re-read every target's reported URL immediately before requesting close, including targets not previously classified as drifted. Skip and report any detected change. Chrome has no atomic compare-and-close operation, so do not claim protection against a race after the final check.

## Open all

- Operate on every saved URL in the selected project.
- Reuse Phase 2 Open semantics: focus/reuse eligible owned instances and create only missing instances.
- Never create accidental duplicate instances for records already open in the window.
- Do not change which project is active.
- Continue after independent create/focus failures and report a result summary.
- Running Open all again without intervening tab changes creates no additional tabs.

## Close all

- Target every live tab owned by the selected project in the current window.
- Apply drift review and the shared programmatic-close workflow.
- Never delete or edit saved records.
- Never close unassigned tabs or tabs owned by another project.
- Do not affect another Chrome window.
- Report closed/requested, kept, pending/surviving, skipped, and failed tabs.

## Active-state recovery

- Service-worker suspension must not lose active state during the current browser session.
- Browser restart recovery is best effort because Chrome window identity may change.
- Restore active state only when the window association is unambiguous.
- Otherwise show **No active project** and require explicit activation.
- Startup and recovery never run activation or close operations.

## Error behavior

- Partial activation does not hide tabs that were kept, skipped, or failed.
- If project data changes during an operation, stop targeting deleted or reassigned records and reconcile before continuing.
- Open all and Close all have separate summaries and retry only failed eligible items.
- Chrome API failure in one window cannot change active state or tab ownership in another.
- All confirmations and summaries identify the affected project and window-local counts.

## Interface changes

- Add a prominent **Activate** action that is visually distinct from Open all.
- Add project-level **Open all** and **Close all** actions.
- Show active-project status in the sidebar and project header.
- Add drift-review and operation-summary dialogs.
- Add the unassigned pulse/notice after activation.
- Provide keyboard access and appropriate focus restoration for every action and review step.
- Do not add task statuses, pinning, archive/history, settings, or export.

## Acceptance criteria

- **P4-A1:** Selecting a project never opens or closes tabs and does not change the active project.
- **P4-A2:** Activate targets only other-project tabs in the current window and never opens saved URLs.
- **P4-A3:** Activation preserves all unassigned tabs and produces one accessible warning when any remain.
- **P4-A4:** Drifted tabs receive per-tab review; any URL change detected by the immediate pre-close check skips closure without claiming atomic race protection.
- **P4-A5:** Open all is idempotent and follows individual Open ownership rules.
- **P4-A6:** Close all targets only the selected project's live instances and never changes saved records.
- **P4-A7:** Selected and active state, operations, and recovery remain isolated per Chrome window.
- **P4-A8:** Ambiguous restart recovery chooses No active project and performs no tab action.
- **P4-A9:** Partial failures remain visible, accurately summarized, and retryable.
- **P4-A10:** Pre-operation cancellation preserves active state; after confirmation, the selected project becomes active while kept, pending, skipped, and failed targets remain explicitly visible.

## Manual acceptance checklist

1. In one window, create owned tabs for two projects plus unassigned tabs; select projects and verify selection alone is harmless.
2. Activate one project and verify only the other project's eligible tabs enter the approved close flow.
3. Verify unassigned tabs remain open and their accessible warning appears once.
4. Confirm activation opens none of the selected project's missing URLs.
5. Run Open all twice and verify the second run creates no tabs.
6. Run Close all and verify saved records and unrelated tabs remain unchanged.
7. Navigate owned tabs away, review them individually, and verify kept and changed-after-confirmation cases.
8. Activate different projects in two windows and verify complete isolation.
9. Restart Chrome with clearly recoverable and ambiguous windows; verify no startup close operation.
10. Force partial Chrome API failures and verify summaries and retries.
11. Complete all project actions using keyboard only and verify reduced-motion pulse behavior.

## Explicitly out of scope

Cross-window focus actions, opening URLs during activation, automatically updating drifted saved URLs, pinning, statuses, search, archive/history, settings, import/export, sync, and split-view management.
