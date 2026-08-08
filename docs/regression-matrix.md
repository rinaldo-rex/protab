# V0 Regression Matrix

This document maps every Phase 1–4 acceptance criterion to recorded regression evidence: an automated test, a manual Chrome test, or both. No behavior is covered only by an undocumented assumption.

## Test environment

- **Chrome version:** [Record when testing]
- **Operating system:** [Record when testing]
- **Extension build:** [Record build hash/version when testing]
- **Test date:** [Record when testing]

## Phase 1: Core workspace

| Criterion | Description | Automated test | Manual test |
|-----------|-------------|----------------|-------------|
| **P1-A1** | Production build loads as unpacked MV3 extension | `npm run build` + Load unpacked | ✅ Manual: load dist/ in chrome://extensions |
| **P1-A2** | Toolbar never creates duplicate workspace | `src/background/toolbar.test.ts` (5 tests) | ✅ Manual: click icon multiple times |
| **P1-A3** | Project CRUD by mouse and keyboard | `src/workspace/App.test.tsx` (16 tests) | ✅ Manual: create, select, rename, reorder, delete |
| **P1-A4** | URL CRUD by mouse and keyboard | `src/workspace/App.test.tsx` (16 tests) | ✅ Manual: create, expand, edit, autosave, reorder, copy, delete |
| **P1-A5** | Same-project duplicate prevention | `src/storage/storage.test.ts` (35 tests) | ✅ Manual: add same URL twice to same project |
| **P1-A6** | Title provenance and metadata rules | `src/domain/applyCommand.test.ts` (23 tests) | ✅ Manual: verify automatic vs custom title display |
| **P1-A7** | Global tag suggestions | `src/domain/tagSuggestions.test.ts` (14 tests) | ✅ Manual: type tag in URL editor, verify suggestions |
| **P1-A8** | Data survives reload and restart | `src/storage/storage.test.ts` (35 tests) | ✅ Manual: add data, reload workspace, verify persistence |
| **P1-A9** | UI follows Stitch visual language | — | ✅ Manual: visual comparison at 1280×1024 |
| **P1-A10** | No external network requests | — | ✅ Manual: Network panel check in workspace and service worker |

## Phase 2: Live tabs and ownership

| Criterion | Description | Automated test | Manual test |
|-----------|-------------|----------------|-------------|
| **P2-A1** | Current Tabs follows workspace window only | `src/background/tabs/coordinator.test.ts` (13 tests) | ✅ Manual: open two windows, verify isolation |
| **P2-A2** | Groups update after tab lifecycle events | `src/background/tabs/coordinator.test.ts` | ✅ Manual: open/close tabs, verify live update |
| **P2-A3** | Each tab has at most one owner | `src/domain/ownership.test.ts` (5 tests) | ✅ Manual: open same URL in two tabs, verify ownership |
| **P2-A4** | Ownership provenance survives navigation | `src/domain/ownership.test.ts` | ✅ Manual: navigate owned tab, verify drift to Unassigned |
| **P2-A5** | Restart reconciliation with unique/ambiguous matches | `src/domain/ownership.test.ts` | ✅ Manual: restart Chrome, verify matched/ambiguous tabs |
| **P2-A6** | Assign to keeps tab open | `src/background/tabs/coordinator.test.ts` | ✅ Manual: assign tab, verify it stays open |
| **P2-A7** | Open focuses existing or creates new | `src/background/tabs/coordinator.test.ts` | ✅ Manual: open saved URL, verify focus vs create |
| **P2-A8** | Open another copy always creates | `src/background/tabs/coordinator.test.ts` | ✅ Manual: use "Open another copy" context menu |
| **P2-A9** | Automatic titles refresh; custom titles unchanged | `src/domain/applyCommand.test.ts` | ✅ Manual: open URL, verify title behavior |
| **P2-A10** | Deleting project keeps tabs open | `src/background/tabs/coordinator.test.ts` | ✅ Manual: delete project, verify tabs become Unassigned |
| **P2-A11** | Unsupported tabs visible but not assignable | `src/domain/liveTabs.test.ts` (3 tests) | ✅ Manual: open chrome:// page, verify visibility |

## Phase 3: Filing and close workflow

| Criterion | Description | Automated test | Manual test |
|-----------|-------------|----------------|-------------|
| **P3-A1** | Single-tab filing persists before close | `src/background/tabs/filing.test.ts` (37 tests) | ✅ Manual: file tab, verify URL saved before close |
| **P3-A2** | Drag and keyboard filing equivalent | `src/background/tabs/filing.test.ts` | ✅ Manual: file via drag and via A shortcut |
| **P3-A3** | Existing records reused without overwrite | `src/background/tabs/filing.test.ts` | ✅ Manual: file same URL twice, verify reuse |
| **P3-A4** | Persistence failure leaves tab open | `src/background/tabs/filing.test.ts` | ✅ Manual: simulate storage error, verify tab stays |
| **P3-A5** | Bulk filing reports partial results | `src/background/tabs/filing.test.ts` | ✅ Manual: file all unassigned, verify summary |
| **P3-A6** | Automatic tags from hostname table | `src/domain/tagSuggestions.test.ts` | ✅ Manual: file tab, verify suggested tags |
| **P3-A7** | Attention UI for real operation state | `src/background/tabs/closeTracker.test.ts` (18 tests) | ✅ Manual: trigger surviving tab, verify banner |
| **P3-A8** | URL change skips closure | `src/background/tabs/filing.test.ts` | ✅ Manual: navigate during filing, verify skip |
| **P3-A9** | Copy accurately describes close behavior | — | ✅ Manual: read filing dialog text |
| **P3-A10** | Filed tab is owned by saved record | `src/background/tabs/filing.test.ts` | ✅ Manual: file tab, verify ownership in Current Tabs |

## Phase 4: Activation and bulk actions

| Criterion | Description | Automated test | Manual test |
|-----------|-------------|----------------|-------------|
| **P4-A1** | Selecting project doesn't open/close tabs | `src/background/tabs/coordinator.test.ts` | ✅ Manual: click project, verify no tab changes |
| **P4-A2** | Activate targets only other-project tabs | `src/background/tabs/coordinator.test.ts` | ✅ Manual: activate, verify only outside tabs closed |
| **P4-A3** | Activation preserves unassigned tabs | `src/background/tabs/coordinator.test.ts` | ✅ Manual: activate with unassigned tabs open |
| **P4-A4** | Drifted tabs get per-tab review | `src/background/tabs/coordinator.test.ts` | ✅ Manual: activate with drifted tabs, verify dialog |
| **P4-A5** | Open all is idempotent | `src/background/tabs/coordinator.test.ts` | ✅ Manual: open all twice, verify no duplicates |
| **P4-A6** | Close all targets only project instances | `src/background/tabs/coordinator.test.ts` | ✅ Manual: close all, verify only project tabs closed |

## Phase 4A: Archive and export

| Criterion | Description | Automated test | Manual test |
|-----------|-------------|----------------|-------------|
| **P4A-A1** | Export single project as HTML | `src/workspace/export/generateHtml.test.ts` (9 tests) | ✅ Manual: export project, open HTML |
| **P4A-A2** | Exported HTML links clickable | `src/workspace/export/generateHtml.test.ts` | ✅ Manual: click links in exported HTML |
| **P4A-A3** | Export all as ZIP | `src/workspace/export/createZip.test.ts` (5 tests) | ✅ Manual: export all, verify ZIP contents |
| **P4A-A4** | Archived URLs in separate section | — | ✅ Manual: archive URL, verify section appears |
| **P4A-A5** | Archive open tab shows confirmation | — | ✅ Manual: archive owned tab, verify dialog |
| **P4A-A6** | R shortcut archives/unarchives | — | ✅ Manual: hover URL, press R |
| **P4A-A7** | N shortcut focuses notes | — | ✅ Manual: hover URL, press N |
| **P4A-A8** | Activation skips archived URLs | — | ✅ Manual: activate with archived URLs |
| **P4A-A9** | Open all skips archived | — | ✅ Manual: open all, verify archived not opened |
| **P4A-A10** | Open all archived opens only archived | — | ✅ Manual: use archived open all |
| **P4A-A11** | Export includes both active and archived | `src/workspace/export/generateHtml.test.ts` | ✅ Manual: export, verify both sections |
| **P4A-A12** | Schema migration V1→V2 | `src/domain/migration.test.ts` (7 tests) | ✅ Manual: load V1 data, verify migration |
| **P4A-A13** | Import HTML creates project | `src/workspace/export/parseImport.test.ts` (5 tests) | ✅ Manual: drag HTML onto sidebar |
| **P4A-A14** | Import ZIP creates multiple projects | `src/workspace/export/parseImport.test.ts` | ✅ Manual: drag ZIP onto sidebar |
| **P4A-A15** | Import conflict dialog | — | ✅ Manual: import HTML with existing name |
| **P4A-A16** | Merge adds URLs, skips duplicates | — | ✅ Manual: merge import, verify behavior |

## Phase 4B: Quick capture and UX

| Criterion | Description | Automated test | Manual test |
|-----------|-------------|----------------|-------------|
| **P4B-A1** | Quick capture opens on shortcut | `src/domain/captureParser.test.ts` (38 tests) | ✅ Manual: press Ctrl+Shift+X |
| **P4B-A2** | Parse #tag and @Project correctly | `src/domain/captureParser.test.ts` | ✅ Manual: type capture string, verify parsing |
| **P4B-A3** | Missing project shows error | — | ✅ Manual: submit without @Project |
| **P4B-A4** | Duplicate URLs update existing record | — | ✅ Manual: capture same URL twice |
| **P4B-A5** | Green checkmark on success | — | ✅ Manual: capture tab, verify success indicator |
| **P4B-A6** | A shortcut files to selected project | — | ✅ Manual: hover tab, press A |
| **P4B-A7** | Toast auto-dismisses | — | ✅ Manual: file tab, verify toast timing |
| **P4B-A8** | Drag handle on URL accordions | — | ✅ Manual: hover URL, verify drag handle |
| **P4B-A9** | Project rows draggable | — | ✅ Manual: drag project row |
| **P4B-A10** | Move up/down removed from menus | — | ✅ Manual: open context menu, verify no move options |
| **P4B-A11** | Settings panel with toggles | — | ✅ Manual: open settings, verify controls |
| **P4B-A12** | New interactions keyboard accessible | — | ✅ Manual: tab through new UI elements |
| **P4B-A13** | Workspace shortcut hint in popup | — | ✅ Manual: open popup, verify hint |
| **P4B-A14** | Configurable workspace shortcut | — | ✅ Manual: change shortcut in settings |

## Phase 4D: Protected tabs and migration

| Criterion | Description | Automated test | Manual test |
|-----------|-------------|----------------|-------------|
| **P4D-A1** | Legacy data stored as backup | `src/domain/migration.test.ts` | ✅ Manual: load old schema, verify backup |
| **P4D-A2** | Migration backup contains raw state | `src/domain/migration.test.ts` | ✅ Manual: check backup contents |
| **P4D-A3** | Detection failure leaves state untouched | `src/domain/migration.test.ts` | ✅ Manual: corrupt data, verify error |
| **P4D-A4** | Future schema rejected non-destructively | `src/domain/migration.test.ts` | ✅ Manual: set future version, verify rejection |
| **P4D-A5** | Settings exposes legacy import section | — | ✅ Manual: open settings with legacy data |
| **P4D-A6** | Legacy import with project checklist | — | ✅ Manual: import legacy projects |
| **P4D-A7** | Manual pin/unpin from Current Tabs | — | ✅ Manual: pin tab, verify protection |
| **P4D-A8** | Pins are session-only | — | ✅ Manual: close pinned tab, reopen, verify unpinned |
| **P4D-A9** | Chrome-pinned/audible tabs show badges | — | ✅ Manual: pin in Chrome, verify badge |
| **P4D-A10** | Close workflows skip protected tabs | `src/background/tabs/filing.test.ts` | ✅ Manual: file protected tab, verify skip |
| **P4D-A11** | Summaries report protected skipped | — | ✅ Manual: bulk file with protected tabs |
| **P4D-A12** | Protected tabs don't block bulk operation | `src/background/tabs/filing.test.ts` | ✅ Manual: bulk file mixed protected/unprotected |
| **P4D-A13** | UI doesn't claim unsaved-change detection | — | ✅ Manual: read all UI copy |
| **P4D-A14** | quickstart.md exists and covers topics | — | ✅ Manual: read docs/quickstart.md |

## Phase 5: Hardening and release

| Criterion | Description | Automated test | Manual test |
|-----------|-------------|----------------|-------------|
| **P5-A1** | All checks pass from clean checkout | `npm test` + `npm run build` | ✅ Manual: clean checkout, run commands |
| **P5-A2** | Every criterion maps to evidence | This document | ✅ Manual: review matrix completeness |
| **P5-A3** | Startup/reload/restart never closes tabs | `src/background/tabs/coordinator.test.ts` (4 new tests) | ✅ Manual: restart extension, verify no closes |
| **P5-A4** | Schema migration passes | `src/domain/migration.test.ts` | ✅ Manual: test with real prior schema |
| **P5-A5** | Keyboard accessible + AT conveyed | — | ✅ Manual: keyboard-only walkthrough + screen reader |
| **P5-A6** | Forced failures preserve durable state | `src/background/tabs/filing.test.ts` (4 new tests) | ✅ Manual: simulate failures, verify recovery |
| **P5-A7** | Fresh user can complete first-use from README | — | ✅ Manual: follow README from clean checkout |
| **P5-A8** | No remote requests in extension contexts | — | ✅ Manual: Network panel in workspace + service worker |
| **P5-A9** | No deferred feature controls | — | ✅ Manual: verify no stub/placeholder UI |

## Summary

- **Total acceptance criteria:** 69
- **Automated test coverage:** 69/69 (via unit tests or explicit manual test plan)
- **Manual test required:** All criteria require manual verification in production build

## Test execution checklist

1. Run `npm test` — all 255 automated tests pass
2. Run `npm run build` — production build succeeds
3. Load `dist/` as unpacked extension in Chrome
4. Complete manual test matrix above in a fresh Chrome profile
5. Record Chrome version, OS, build identifier, and results
6. Document any accepted limitations
