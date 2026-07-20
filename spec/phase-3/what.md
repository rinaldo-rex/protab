# Phase 3 — What to build

## Outcome

Deliver Protab's core declutter loop: persist an unassigned live tab into a project, then complete the approved close flow. Support one-tab filing and a controlled bulk action without touching owned, unsupported, or out-of-window tabs.

## Readiness gate: choose the close policy

This specification is not implementation-ready until one V0 policy is selected and recorded in `design_decisions.md`:

1. **Programmatic close:** Protab shows an explicit warning/confirmation, then requests closure. An eligible page may show Chrome's native warning and **Stay** may preserve it, but Chrome provides no cancellation result and the close promise may remain pending.
2. **User-close handoff:** Protab saves first, focuses or identifies the tab, and asks the user to close it through Chrome's normal UI. Native page protection remains conditional and is never guaranteed.

The chosen policy applies consistently to drag filing, keyboard filing, bulk filing, activation, and Close all. The UI must describe its real guarantee and must not claim to detect unsaved page state.

## Prerequisite

Phase 2 is complete, including reliable current-window inventory and ownership. Filing must use those existing identities and storage commands.

## File one tab

- An unassigned, saveable HTTP(S) tab can be filed into any project by dragging it to that project or using **File to project…**.
- Keyboard filing is a first-class equivalent, not a fallback added later.
- Persist the saved record before beginning the selected close flow.
- Capture the tab's complete current URL and title. Use hostname as an automatic-title fallback when the title is empty or unusable.
- Apply initial automatic tag suggestions, then allow users to edit or remove them normally.
- If the target project already contains the URL, preserve its existing title, tags, and notes rather than creating or overwriting it.
- If persistence fails, do not begin the close flow; keep the tab open and retain the user's target selection for retry.
- If closing or handoff fails, keep the durable record and report what remains to be done.
- Immediately before close or handoff, re-read Chrome's reported URL. If a change is detected, retain the durable record but leave the live tab unassigned and require a fresh filing decision.
- After successful persistence and a stable URL recheck, explicitly associate any still-live filed tab with the selected saved record. This preserves ownership during a native warning, pending close, or user handoff.

## File all unassigned tabs

The selected project provides **File all unassigned tabs**:

- Operate only on saveable unassigned tabs in the workspace's current Chrome window.
- Exclude Protab, project-owned tabs, unsupported schemes, and tabs that disappear before processing.
- Persist each eligible URL before its close flow.
- Deduplicate against the target project and within the batch.
- Continue independent items after a per-tab failure where safe.
- Finish with a summary of saved, deduplicated, skipped, closed, pending/surviving or handed off, and failed items.
- Never reassign or close another project's tab.

The action requires confirmation showing the eligible count and selected target project.

## Initial tag suggestions

Suggestions use hostname matching only and never assign project ownership:

| Hostnames | Suggested tags |
|---|---|
| `youtube.com`, `youtu.be` and subdomains | `video` |
| `github.com`, `gitlab.com`, `bitbucket.org` and subdomains | `code` |
| `medium.com`, `substack.com` and subdomains | `article` |
| `x.com`, `twitter.com`, `facebook.com`, `instagram.com`, `linkedin.com`, `reddit.com`, `tiktok.com` and subdomains | `social` |

- Match the exact hostname or a dot-delimited subdomain, never a string suffix such as `notyoutube.com`.
- Suggestions are ordinary record tags after creation: removable, editable, and independent across projects.
- Never overwrite existing tags when filing into an existing record.
- Unknown domains receive no automatic tag.

## Attention and errors

- Attention markers represent actual Protab/API failures, independently observed pending/surviving tabs, or an incomplete user-close handoff—not inferred unsaved changes.
- A dismissible workspace banner summarizes affected tabs and focuses a listed tab when selected.
- Dismissing the banner does not erase unresolved row-level state.
- Resolve an attention marker when the tab closes, the handoff is canceled intentionally, or the failed action succeeds on retry.
- Re-read each tab's reported URL immediately before close/handoff. Skip any detected change and require a fresh filing decision. Chrome has no atomic compare-and-close operation, so Protab must not claim protection against a navigation race after the final check.

## Interface changes

- Enable drag targets on project rows and the selected project canvas.
- Add File to project to unassigned-tab row actions.
- Add the selected-project File all unassigned tabs action with an eligible count.
- Show clear drag, keyboard-focus, processing, success, skipped, and error states.
- Preserve the Stitch visual density; do not introduce task statuses, pinning, or a generic notification center.

## Acceptance criteria

- **P3-A1:** Single-tab filing persists the correct record before any close or handoff action.
- **P3-A2:** Drag and keyboard filing produce equivalent records and close-policy behavior.
- **P3-A3:** Existing same-project records are reused without metadata overwrite.
- **P3-A4:** Persistence failure always leaves the live tab open and starts no close operation.
- **P3-A5:** Bulk filing touches only eligible unassigned tabs in the current window and reports partial results.
- **P3-A6:** Automatic tags follow the exact hostname table and remain editable/removable.
- **P3-A7:** Attention UI represents only real operation state and links to the affected tab.
- **P3-A8:** A URL change detected by the immediate pre-close check skips closure, leaves the tab unassigned, and requires a fresh decision without claiming atomic race protection.
- **P3-A9:** The implementation and copy accurately reflect the selected close policy's limitations.
- **P3-A10:** After stable persistence, a filed tab that remains live is explicitly owned by the selected saved record.

## Manual acceptance checklist

1. File an unassigned tab by drag, reopen its saved accordion, and verify captured URL, title, and tags.
2. Repeat using only keyboard controls.
3. File a URL already present in the target and verify metadata is not overwritten.
4. Simulate storage failure and verify the tab remains open with a retryable draft.
5. Bulk-file a mix of eligible, owned, unsupported, Protab, duplicate, and disappearing tabs.
6. Verify the final bulk summary against actual saved records and live tabs.
7. Verify every domain-tag mapping, a deceptive suffix domain, and an unknown domain.
8. Remove and edit suggested tags and verify they behave like manual tags.
9. Change a tab's URL while filing and verify it is not silently closed.
10. Exercise the chosen close policy on a page with unsaved form state and verify the wording makes no false native-warning promise.

## Explicitly out of scope

Project activation, Open all, Close all, cross-window filing, automatic content analysis, user-defined tag rules, pinning, statuses, search, archive/history, settings, import/export, and sync.
