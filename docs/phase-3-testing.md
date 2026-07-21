# Phase 3 Manual Testing Checklist

This checklist validates Phase 3 behavior against the production build in Chrome.

## Setup

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `dist/` directory.
5. Pin Protab if desired, then click its toolbar action to open the full-page workspace.
6. Create at least one project with a name.

---

## Single-tab filing (keyboard)

- [x] Open a non-workspace HTTP(S) tab.
- [x] In Protab's **Current Tabs** pane, find the tab under **Unassigned**.
- [x] Click **File to project…** on the tab row.
- [x] Select the target project from the picker.
- [x] Verify the confirmation dialog shows:
  - Tab title and URL
  - Target project name
  - Suggested tags (if hostname matches)
  - "This URL is already saved" note (if duplicate)
- [x] Click **Continue**, then **Save and close**.
- [x] Verify:
  - The saved URL appears in the project's accordion
  - The tab is closed (or shows native warning if eligible)
  - The result shows "URL saved. Tab close requested."

## Single-tab filing (drag)

- [x] Open a non-workspace HTTP(S) tab.
- [x] Drag the tab row from **Current Tabs** to a project in the sidebar.
- [x] Verify the project highlights on drag-over.
- [x] Drop the tab.
- [x] Verify the same confirmation dialog appears.
- [x] Confirm and verify the same behavior as keyboard filing.

## Duplicate URL handling

- [x] File a tab with a URL already saved in the target project.
- [x] Verify:
  - The existing record is preserved (title, tags, notes unchanged)
  - The result shows "URL already saved. Tab close requested."
  - No duplicate record is created

## URL change during filing

- [ ] Start filing a tab.
- [ ] Before confirming, navigate the tab to a different URL.
- [ ] Confirm the filing.
- [ ] Verify:
  - The result shows "URL changed — not closed. File again if needed."
  - The tab remains open and unassigned
  - The original URL is still saved (if it was persisted before the change)

## Storage failure

- [ ] Open DevTools background service worker console.
- [ ] Temporarily mock storage to reject (or fill quota).
- [ ] Attempt to file a tab.
- [ ] Verify:
  - The result shows a failure message
  - The tab remains open
  - No ownership is established
  - No close request is issued

## Bulk filing

- [x] Open multiple unassigned tabs (mix of eligible, owned, unsupported).
- [x] Select a project.
- [x] Click **File all unassigned (N)**.
- [x] Verify the confirmation shows the eligible count and target project.
- [x] Click **File all**.
- [x] Verify the summary shows:
  - Created count
  - Reused count (for duplicates)
  - Close requested count
  - Skipped items with reasons
  - Failed items with retry option

## Tag suggestions

- [ ] File tabs with these hostnames and verify suggested tags:
  - `youtube.com` → `video`
  - `www.youtube.com` → `video`
  - `github.com` → `code`
  - `gitlab.com` → `code`
  - `medium.com` → `article`
  - `x.com` → `social`
  - `reddit.com` → `social`
- [ ] Verify deceptive suffix domains get no tags:
  - `notyoutube.com` → no tag
  - `fakegithub.com` → no tag
- [ ] Verify unknown domains get no tags.
- [ ] After filing, edit/remove suggested tags and verify they behave like manual tags.

## Attention UI

- [ ] Trigger a close failure (e.g., tab with unsaved form, choose "Stay").
- [ ] Verify:
  - The attention banner appears with the count
  - Expanding shows the affected tab with reason
  - **Focus** button activates the tab
  - **Retry** button re-requests close
  - **Dismiss** removes the item from the banner

## Programmatic close honesty

- [ ] File a tab on a page with unsaved form state.
- [ ] Verify the confirmation dialog says:
  - "Protab will save and request Chrome to close this tab"
  - "Some pages may show a native 'Leave page?' warning"
- [ ] If Chrome shows the native warning:
  - Click **Stay** and verify the tab remains open with attention
  - Click **Leave** and verify the tab closes
- [ ] Verify Protab never claims to:
  - Detect unsaved changes
  - Guarantee a native warning
  - Receive a direct result from the native dialog

## Service worker suspension

- [ ] File a tab that triggers a native warning (leave the dialog open).
- [ ] Wait for the service worker to suspend (or force it via `chrome://serviceworker-internals`).
- [ ] Verify:
  - The attention state survives suspension
  - No automatic close is attempted on wake
  - Manual retry works after wake

## Two-window isolation

- [ ] Open Protab in two Chrome windows.
- [ ] File a tab in window 1.
- [ ] Verify window 2's inventory updates but is not affected by the close.
- [ ] Verify cross-window filing is rejected (tab moved error).

## Console and network review

- [ ] Open the background service worker console.
- [ ] Perform filing operations.
- [ ] Verify:
  - No unhandled errors
  - Operation logs include: type, operationId, windowId, tabId, projectId, savedUrlId, stage
  - No notes or private metadata in logs
- [ ] Open the Network tab.
- [ ] Verify no Protab fetches (all operations are local).

## Manifest permissions

- [ ] Verify `manifest.json` contains only `["storage", "tabs"]`.
- [ ] Verify no host permissions, content scripts, or other permissions are declared.
