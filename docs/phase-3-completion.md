# Phase 3 Completion Evidence

## Commit list

| # | Commit | Description |
|---|--------|-------------|
| 1 | `feat: add create-or-reuse filing command and tag suggestions` | Pure domain: `FILE_LIVE_TAB` command, `suggestTags()`, create-or-reuse logic |
| 2 | `feat: add confirmed persist-first tab close workflow` | Background: `filing.ts`, `closeTracker.ts`, `chromeTabs.remove()`, prepare/confirm protocol |
| 3 | `feat: add keyboard tab filing to projects` | Workspace: `FileToProject` action, `FileTabsDialog`, `FilingResult` |
| 4 | `feat: add drag-to-project tab filing` | Workspace: drag sources on unassigned rows, drop targets on project sidebar/canvas |
| 5 | `feat: add bulk filing for unassigned tabs` | Workspace + background: "File all unassigned tabs" action, batch orchestration, `FilingSummary` |
| 6 | `feat: add filing attention states and close retries` | Workspace: `AttentionBanner`, row markers, stage-aware retry |
| 7 | `docs: add Phase 3 loading and test instructions` | Documentation: testing checklist and completion evidence template |

## Automated checks

```
npm test: [PASTE OUTPUT]
npm run lint: [PASTE OUTPUT]
npm run build: [PASTE OUTPUT]
```

## Production build

- Location: `dist/`
- Load steps:
  1. Run `npm run build`
  2. Open `chrome://extensions`
  3. Enable Developer mode
  4. Choose Load unpacked, select `dist/` directory

## Manual checklist results

See [`phase-3-testing.md`](phase-3-testing.md) for the full checklist.

**Chrome version:** [VERSION]
**OS:** [OS]

| Check | Result | Notes |
|-------|--------|-------|
| Single-tab keyboard filing | ✅/❌ | |
| Single-tab drag filing | ✅/❌ | |
| Duplicate URL handling | ✅/❌ | |
| URL change during filing | ✅/❌ | |
| Storage failure | ✅/❌ | |
| Bulk filing | ✅/❌ | |
| Tag suggestions | ✅/❌ | |
| Attention UI | ✅/❌ | |
| Programmatic close honesty | ✅/❌ | |
| Service worker suspension | ✅/❌ | |
| Two-window isolation | ✅/❌ | |
| Console review | ✅/❌ | |
| Network review | ✅/❌ | |
| Manifest permissions | ✅/❌ | |

## Persist-before-close ordering

**Evidence:** [Describe how you verified that persistence occurs before any close request]

Example: In the background service worker console, observe that `FILE_LIVE_TAB` command completes (logs `didWrite: true`) before `chrome.tabs.remove()` is called. The `FilingOrchestrator.executeFiling()` method returns `closeState: 'requested'` only after the durable command succeeds.

## Storage and ownership failures

**Evidence:** [Describe how you verified that failures prevent close]

Example: When persistence fails (simulated via storage mock), the orchestrator returns `closeState: 'failed'` without calling `ownership.update()` or `api.remove()`. When ownership fails after persistence, the orchestrator returns `closeState: 'failed'` without calling `api.remove()`.

## URL-change recheck

**Evidence:** [Describe how you verified the URL recheck]

Example: Navigate a tab during the filing flow. The orchestrator compares the tab's current URL with the persisted URL immediately before close. If they differ, it returns `closeState: 'skipped'` with error "URL changed — not closed."

## Duplicate metadata preservation

**Evidence:** [Describe how you verified duplicate handling]

Example: File a tab with a URL already saved in the target project. The `FILE_LIVE_TAB` command returns `filing: 'reused'` with `didWrite: false`. The existing record's title, tags, notes, and ordering are unchanged.

## Mixed bulk summary

**Evidence:** [Describe the bulk filing test scenario]

Example: Filed 5 tabs: 2 new, 1 duplicate, 1 with changed URL, 1 with close failure. Summary showed: created=2, reused=1, closeRequested=3, skipped=[{reason: 'url-changed'}], failed=[{stage: 'close', message: '...'}].

## Native unsaved-form behavior

**Evidence:** [Describe the native warning test]

Example: Filed a tab on a page with unsaved form state. Chrome showed the native "Leave page?" dialog. Clicking "Stay" left the tab open; Protab showed attention with "Still open" state. Clicking "Leave" closed the tab. The confirmation dialog accurately described "Protab will save and request Chrome to close this tab" without claiming to detect unsaved changes.

## Service worker suspension

**Evidence:** [Describe the suspension test]

Example: Filed a tab that triggered a native warning (dialog left open). Forced service worker suspension via `chrome://serviceworker-internals`. After wake, attention state was preserved (from `chrome.storage.session`). No automatic close was attempted. Manual retry worked.

## Two-window isolation

**Evidence:** [Describe the two-window test]

Example: Opened Protab in window 1 and window 2. Filed a tab in window 1; window 2's inventory updated but was not affected. Attempted to file a tab from window 2 using window 1's project; the operation succeeded (filing is per-window, not cross-window). Cross-window tab movement is rejected with "Tab moved to another window."

## Console and network review

**Evidence:** [Paste console and network review results]

Example:
- Console: No unhandled errors. Operation logs show: `{type: 'FILE_LIVE_TAB', operationId: '...', windowId: 1, tabId: 42, projectId: '...', savedUrlId: '...', stage: 'persist'}`.
- Network: No Protab fetches observed.

## Manifest permissions

**Evidence:** [Paste manifest.json permissions]

```json
["storage", "tabs"]
```

## Deviations from spec

[List any deviations from the Phase 3 spec, or "None"]

## Unresolved risks

[List any unresolved risks, or "None"]

## Interfaces Phase 4 must preserve

- `FILE_LIVE_TAB` command type and `CommandResultMeta.filing`
- `FilingOrchestrator` public API (`prepare`, `executeFiling`, `prepareBulk`, `executeBulkFiling`, `retryClose`, `resolveTabRemoval`)
- `CloseTrackerStore` session key (`protab.closeAttempts.v1`) and schema
- `LiveTabRequest` filing variants (`PREPARE_FILE_LIVE_TAB`, `CONFIRM_FILE_LIVE_TAB`, etc.)
- `LiveTabMessage` filing result types (`FILING_PREPARED`, `FILING_RESULT`, `FILING_SUMMARY`, `BULK_FILING_PREPARED`)
- `PreparedFilingOperation`, `FilingResult`, `FilingSummary` types
- Attention banner and row marker patterns
- Drag-and-drop targets on project sidebar/canvas
- `FileTabsDialog` two-step confirmation pattern
