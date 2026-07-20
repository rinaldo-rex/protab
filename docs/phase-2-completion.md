# Phase 2 completion

Phase 2 connected Protab's durable project workspace to live Chrome tabs without adding any tab-closing path.

## Implemented scope

- Current-window inventory bound to each validated workspace `chrome.runtime.Port`
- Exclusion of every Protab workspace tab and isolation from other Chrome windows
- Live refresh after tab lifecycle events, with loading, empty, stale, error, and Retry states
- HTTP(S) eligibility plus visible, view-only unsupported tabs
- `chrome.storage.session` ownership that survives service-worker suspension
- Exact-match restart reconciliation, ambiguity candidates, and non-destructive recovery feedback
- Project and **Unassigned** groups in project/tab-strip order
- Keyboard-accessible focusing and exact-match assignment
- **Open** precedence and **Open another copy**
- Per-record live-instance counts
- Project deletion that preserves all live tabs
- Navigation drift provenance: a drifted instance retains its original ownership identity for count, Open exclusion, and later close review, while appearing under **Unassigned** with **Navigated from saved URL**

## Atomic commits

```text
fceee5f feat: add current-window tab inventory
6a13d1f feat: add persistent runtime tab ownership and grouping
65637c3 feat: assign matching unassigned tabs to projects
ece5f12 feat: open and focus saved URL instances
75e21e2 feat: open additional owned URL copies
2b9059b feat: reconcile ownership and detect navigation drift
821c239 feat: preserve live tabs when deleting projects
2ac4dad docs: add Phase 2 loading and test instructions
3959330 docs: record user-tested Phase 2 acceptance
de9c1b7 fix: group navigated saved tabs as unassigned
```

## Automated evidence

After the navigation-grouping correction:

```text
npm test      48 tests passed in 9 test files
npm run lint  passed
npm run build passed
```

The production extension is built into `dist/`. Its manifest permissions remain exactly `storage` and `tabs`. Source review confirmed that Phase 2 contains no `chrome.tabs.remove()` call or other tab-closing path.

## Manual evidence

The recorded checklist is in [`phase-2-testing.md`](phase-2-testing.md). The user confirmed current-window isolation, live updates, unsupported-page treatment, keyboard row focusing, Open/Open another copy, independent duplicate ownership, navigation-drift detection, project deletion, keyboard operation, and console/Network review.

The checklist still records the following items as pending rather than claiming completion without evidence:

- ambiguous restart reconciliation and assignment
- service-worker suspension/wake
- full Chrome restart behavior
- forced API failure/retry
- manifest permission review
- explicit manual no-close confirmation
- requested screenshots and environment metadata

## Phase 3 handoff

Phase 3 must preserve these interfaces and invariants:

- `CommandQueue` is the only durable mutation serializer.
- `PersistedStateV1` remains the durable project schema unless a genuinely durable new field requires a versioned migration; filing itself does not.
- The live `runtime.Port` sender defines the authoritative workspace window.
- `LiveTabsCoordinator` serializes window-scoped live operations.
- `OwnershipStore` remains the session repository for explicit tab-to-record identity.
- The UI sends entity IDs, while the background revalidates current tab, URL, window, project, and record.
- A drifted tab is displayed under **Unassigned**, retains provenance, and requires a fresh filing decision.
- Phase 2 startup/reconciliation remains non-destructive.
- Phase 3 may add tab closing only through the approved programmatic-close workflow documented in `design_decisions.md` and `spec/phase-3/how.md`.
