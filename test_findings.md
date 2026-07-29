# Protab quickstart emulation — test findings

**Date:** 2026-07-25
**Build:** `dist/` (manifest version `0.1.0`), loaded unpacked (extension id `flfbbegfjfomffhgjacfpenphhahhjhk`)
**Method:** Drove the workspace via CDP against a real Chrome. Created projects (`Client work`, `Side project`, `Research`), filed tabs, opened/archived saved URLs, tested activation, export, and quick-capture.

## Summary

Emulated the full `docs/quickstart.md` flow end-to-end. Filing, saved-URL editing, opening, archiving, export (per-project HTML + all-projects ZIP), and quick-capture all work. **Activation is broken** (the headline "deliberate focus" feature) due to a service-worker state-loss + UI recovery bug. Several docs-vs-behavior gaps and a CSP favicon bug were also found.

## Bugs

### High severity

#### 1. Activation is broken end-to-end (stuck dialog, no tab closure)

- **Repro:** Right-click a sidebar project → **Activate** → the `DriftReviewDialog` opens. Click **"Close N tabs and activate"**. The dialog stays on **"Activating…"** forever. The other-project tab is **never closed** (e.g. an `example.com` tab owned by `Side project` stayed open after activating `Client work`), and no active-project state is set.
- **Root cause** (all in `src`):
  - `background/tabs/coordinator.ts` keeps `preparedActivateOperations` as an **in-memory `Map`**. The MV3 service worker recycles between `PREPARE_ACTIVATE_PROJECT` and `CONFIRM_ACTIVATE_PROJECT` (any user pause ≳30s is enough), so the prepared operation is lost. `confirmActivateProject` then posts `LIVE_TAB_ACTION_ERROR` *"This operation is no longer valid. Please try again."* (the `actionError` toast appeared during testing, confirming this path fired).
  - `workspace/useLiveTabs.ts`'s handler for `LIVE_TAB_ACTION_ERROR` only does `setActionError(message.message)` — it **does not clear `activationPending` or `activationPrepared`**, so the dialog stays modal + pending forever. The only escape is the **X** button (which cancels).
  - `confirmActivateProject` has **no top-level try/catch**, so any throw also strands the UI.
- **Effect:** the "deliberate focus" feature is unusable after SW recycling.

#### 2. Activation opens tabs, contradicting the docs

- `confirmActivateProject` (`background/tabs/coordinator.ts`, ~line 657) opens every non-archived saved URL of the activated project that isn't already open. The quickstart explicitly states: *"Activation never opens tabs automatically — it only closes others."* **Activate** and **Open all active** are separate menu items, but Activate silently also performs Open-all. Either the code or the quickstart is wrong.

#### 3. The drift-review "Keep/Close" toggle is non-functional

- `DriftReviewDialog` calls `onConfirm(operationId, keptTabIds)`, but `App.tsx`'s handler is `liveTabs.confirmActivateProject(operationId)` — it **drops `keptTabIds`**, and the background `confirmActivateProject(operationId)` doesn't accept them. The user's per-tab keep/close choices are silently discarded, and drifted tabs are never closed by activation regardless of the toggle.

#### 4. Activation button label under-reports closures

- "Close {closingCount} tab(s) and activate" counts only drifted tabs selected for closure, not the non-drifted other-project tabs that will also close. With 0 drifted + 1 other-project tab to close, it reads **"Close 0 tabs and activate"** — misleading.

### Medium severity

#### 5. CSP blocks all favicons (9 console errors)

- `manifest.json` CSP: `img-src 'self' https://www.google.com/s2/favicons`.
- The code loads favicons from `t{0,2,3}.gstatic.com/faviconV2`, each site's own origin (`developer.mozilla.org`, `news.ycombinator.com`, `go.dev`, `www.wikipedia.org`), and `github.githubassets.com` — **all blocked**. Every saved-URL and live-tab favicon is broken. The allowlist doesn't match the favicon strategy the code uses.

#### 6. Stale/contradictory empty-state copy

- Every empty project (the default `Trash` *and* a freshly-created project) shows: *"Add URLs manually to build durable project context. Live-tab filing arrives in a later phase."* — while the same view has an **"Add all current tabs (N)"** button and a full Current Tabs pane with drag/hover filing. The copy contradicts the implemented functionality.

### Low severity / discoverability & doc gaps

#### 7. Hover-revealed file/pin buttons described in the quickstart don't exist

- Quickstart: *"click the file button that appears"* and *"click the Pin button on any tab row."* The `live-tab-row` DOM is only a favicon + text span — no hover-revealed action buttons. The hover+`A` shortcut works (a real mouse-enter sets `hoveredTabId`), but there's no visible file/pin button, so **pinning via the row UI is not available as documented.**

#### 8. The project "action menu" is an undiscoverable right-click menu

- `docs/quickstart.md` repeatedly says "use the project's action menu" for Activate / Open all active / Export / File-all. There is no kebab button — the menu only appears on **right-click** of the sidebar project button. The quickstart never says right-click. (The in-app Quickstart panel *does* say "Right-click project" — so the in-app guide is right; the `.md` prose isn't clear.)

#### 9. No clickable "Open" button on saved URLs

- Quickstart: *"each saved URL shows an Open button."* There is none; opening is only via the `O` shortcut (requires hover) or right-click context menu.

#### 10. Hostname auto-tagging is undocumented

- Filing `github.com` auto-applies a `code` tag (`domain/tagSuggestions.ts`: github/gitlab/bitbucket → `code`). The quickstart never mentions auto-tagging, so the surprise `code` tag is confusing.

## What worked

- Workspace open; project create/rename.
- `A`-shortcut filing (saves URL + closes the browser tab); bulk "Add all current tabs" present.
- Saved-URL editing (URL/title/tags/notes with autosave on blur).
- Open via right-click context menu (with "1 open instance" badge); "Open another copy" present.
- Archive via context menu → moves to a collapsible **"Archived (1)"** section (excluded from Open all).
- Per-project HTML export — self-contained (inlined fonts), clickable links.
- Export-all ZIP — one HTML per project.
- Quick-capture parsing + on-the-fly project creation (`note #tags @NewProject` → creates `NewProject`, saves active tab with note + tags).
- Two-window-independent ownership grouping ("CLIENT WORK 1" / "SIDE PROJECT 1").

## Not bugs (test-environment artifacts)

- Tab titles carry a `🟢` prefix because the test harness marks owned tabs via `document.title = '🟢 '+…`; Protab captures `tab.title` verbatim, inflating saved-URL titles only in this run.
- Drag-and-drop filing could not be verified via CDP (React DnD ignores synthesized CDP drag events). The `A`-shortcut and context-menu paths confirm filing works.
- Quick-capture initially showed *"Only HTTP and HTTPS URLs are supported"* because opening `popup.html` as a tab makes the popup itself the active tab. Once a real http tab was activated via raw CDP, quick-capture worked correctly (created `Research` on the fly, saved wikipedia with note `Check this later` + tags `blog`, `ref`).

## Suggested fix order

1. #1 (activation SW state-loss + UI recovery) — make `preparedActivateOperations` durable (or persist the prepared op to `storage`), wrap `confirmActivateProject` in try/catch, and clear `activationPending`/`activationPrepared` on `LIVE_TAB_ACTION_ERROR`.
2. #2 (activation opening tabs) — decide Activate vs. Open-all semantics; align code with the "never opens tabs" contract.
3. #3 (drift-review toggle wired to nothing) — pass `keptTabIds` through and honor it in `confirmActivateProject`.
4. #5 (CSP favicons) — allow `https://*.gstatic.com` (or switch favicon fetching to the allowed `https://www.google.com/s2/favicons` endpoint / proxy).
5. #4, #6, #7, #8, #9, #10 — copy/docs/discoverability.
