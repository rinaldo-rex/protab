// ════════════════════════════════════════════════════════════════════════════
// activate-target-for-popup.js  —  test a toolbar popup that reads "current tab"
// ════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS (layman):
//   Toolbar popups often grab "the current tab" to do something with it. But
//   to test a popup with CDP you usually open popup.html as a tab — which
//   makes the popup ITSELF the "current tab", so it reads its own
//   chrome-extension:// URL and may self-reject ("only http(s) URLs supported").
//   This script works around that: it activates a REAL webpage tab in the
//   background (without shifting the harness's focus away from whatever you're
//   inspecting), then runs a snippet inside the popup's own context — so the
//   popup's "current tab" logic sees the real webpage you want it to capture.
//
// WHEN TO USE:
//   - Testing a toolbar popup, address-bar action, or any "capture this page"
//     feature exposed via popup.html.
//   - Any code that calls chrome.tabs.query({active:true, currentWindow:true})
//     and you need that active tab to be a specific real page.
//
// HOW (from the agent):
//   1. Open the popup as a tab (so you have a popupTargetId to eval in):
//        browser_new_tab({ url: 'chrome-extension://<id>/popup.html' })
//      Note the returned targetId -> popupTargetId.
//   2. Pick the real page to make "active" -> targetId (e.g. a wikipedia tab).
//   3. browser_run_script({ path: '<skill>/scripts/activate-target-for-popup.js',
//                           params: { targetId, popupTargetId,
//                                     evalExpr: "document.querySelector('button').click()" } })
//
// NOTE: CDP Runtime.evaluate does NOT change the browser's active tab, so the
// popup stays non-active while you eval inside it — exactly what you want.
// ════════════════════════════════════════════════════════════════════════════

const unwrap = (r) => (r && typeof r === 'object' && 'success' in r ? (r.success ? r.data : null) : r);

return (async () => {
  const targetId = String(params.targetId || '').trim();
  const popupTargetId = String(params.popupTargetId || '').trim();
  const evalExpr = String(params.evalExpr || 'undefined');
  if (!targetId || !popupTargetId) {
    throw new Error('params.targetId (real page to activate) and params.popupTargetId (popup to eval in) are required');
  }
  const s = daemon.session();

  // 1) Make the real page the browser's active tab (Target.activateTarget is
  //    browser-level and does NOT move the harness's attached page).
  await s.callBrowser('Target.activateTarget', { targetId });
  await new Promise((r) => setTimeout(r, 400));

  // 2) Attach to the popup target and run the snippet in its context.
  const att = unwrap(await s.callBrowser('Target.attachToTarget', { targetId: popupTargetId, flatten: true }));
  const sid = att && att.sessionId;
  if (!sid) throw new Error('attachToTarget(popup) returned no sessionId');
  await s.callOnTarget('Runtime.enable', {}, sid);

  const wrapped = `(function(){ ${evalExpr} })()`;
  const ev = unwrap(await s.callOnTarget('Runtime.evaluate', { expression: wrapped, returnByValue: true, awaitPromise: true }, sid));
  const value = ev && ev.result ? (ev.result.value !== undefined ? JSON.stringify(ev.result.value) : JSON.stringify(ev.result)) : 'undefined';
  return { content: [{ type: 'text', text: String(value) }] };
})().catch((e) => ({ content: [{ type: 'text', text: 'FAIL: ' + e.message }] }));
