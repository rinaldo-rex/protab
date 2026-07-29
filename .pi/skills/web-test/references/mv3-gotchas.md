# MV3 service-worker gotchas

Manifest V3 extensions run background logic in a service worker — a separate, invisible process whose errors **don't surface on any page's console**. These are the failure modes that cost real time.

## 1. The worker recycles, and in-memory state is lost
MV3 SWs go idle and are terminated; when restarted, **all in-memory state is gone**. A `Map` of prepared operations kept only in a coordinator field is wiped on recycle. A multi-step flow (prepare → user reviews → confirm) that crosses a pause of ~30s+ can hit *"this operation is no longer valid"* on confirm because the prepared entry vanished.

- Reproduce: wait between prepare and confirm; confirm by attaching to the SW (`scripts/sw-inspect.js`) and reading its console.
- The extension page's long-lived port *should* keep the SW alive — don't assume it; verify across the operation.

## 2. Page-side error handlers that strand the UI
If the SW posts an error message (e.g. `LIVE_TAB_ACTION_ERROR`) and the page's handler only sets an error-toast state — **without clearing `pending`/`prepared` flags** — the modal stays open and stuck on "…" forever. Check both sides:
- SW: did it post a result or error? (attach + read its console)
- Page: does the error handler clear the pending/prepared UI state?

## 3. No top-level try/catch on the worker
A worker message handler that throws without a wrapping try/catch posts **nothing** back — no result, no error. The page's pending flag never clears and the dialog hangs. Wrap handlers; on throw, post an error so the page can recover.

## 4. Reading the worker console
Page console shows only page errors. For worker errors, use `scripts/sw-inspect.js`:
- Attach to the `service_worker` target.
- `Runtime.enable` + `Log.enable` **before** reproducing.
- Trigger the action (via `daemon.evaluateJs` on the harness page, or by clicking in the UI).
- Drain `Runtime.consoleAPICalled` / `Log.entryAdded` / `Runtime.exceptionThrown`.

Also read **all rendered toasts/overlays** on the page — the page often surfaces a user-facing message for an error whose root cause is in the worker.

## 5. CDP doesn't replay past exceptions
If you attach `Runtime.enable` *after* the failure, you catch nothing. Reproduce live with the listener already attached.
