// ════════════════════════════════════════════════════════════════════════════
// verify-extension.js  —  confirm an unpacked Chrome extension is loaded
// ════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS (layman):
//   After someone clicks "Load unpacked" to install the extension under test,
//   you need to (a) confirm it actually loaded and is enabled, and (b) get its
//   ID — because opening its pages requires chrome-extension://<id>/... URLs.
//   This script does that via Chrome's internal developerPrivate API, which
//   only the chrome://extensions page exposes.
//
// WHEN TO USE:
//   - The very first step of any extension test: "is the thing even loaded,
//     and what's its ID?"
//   - After a reload/update to confirm the new build is active.
//
// HOW (from the agent):
//   browser_run_script({ path: '<skill>/scripts/verify-extension.js',
//                        params: { name: 'Protab' } })
//   -> returns { id, version, enabled, location } or NOT FOUND.
//
// NOTE: This finds the chrome://extensions tab that's already open and runs
// the query there (it does NOT open one). If none is open, open it first with
//   browser_new_tab({ url: 'chrome://extensions/' }) -> browser_wait_for_load()
// ════════════════════════════════════════════════════════════════════════════

const unwrap = (r) => (r && typeof r === 'object' && 'success' in r ? (r.success ? r.data : null) : r);

return (async () => {
  const name = String(params.name || '').trim();
  if (!name) throw new Error('params.name is required (the extension display name)');

  const s = daemon.session();
  // Find the chrome://extensions page target (browser-level query).
  const tg = unwrap(await s.callBrowser('Target.getTargets', {}));
  const targets = (tg && tg.targetInfos) || [];
  const extPage = targets.find((t) => t.type === 'page' && (t.url || '').startsWith('chrome://extensions'));
  if (!extPage) {
    return { content: [{ type: 'text', text: 'No chrome://extensions tab open. Open one first (browser_new_tab).' }] };
  }

  // Attach to it and run the developerPrivate query in its context.
  const att = unwrap(await s.callBrowser('Target.attachToTarget', { targetId: extPage.targetId, flatten: true }));
  const sid = att && att.sessionId;
  if (!sid) throw new Error('attachToTarget returned no sessionId');
  await s.callOnTarget('Runtime.enable', {}, sid);

  const expr = `new Promise((resolve) => {
    try {
      chrome.developerPrivate.getExtensionsInfo((items) => {
        const ext = (items || []).find(i => i.name === ${JSON.stringify(name)});
        resolve(JSON.stringify(ext ? { id: ext.id, name: ext.name, version: ext.version, enabled: ext.enabled, location: ext.location, type: ext.type } : 'NOT FOUND'));
      });
    } catch (e) { resolve('err: ' + e.message); }
  })`;

  const ev = unwrap(await s.callOnTarget('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid));
  const value = ev && ev.result && ev.result.value;
  return { content: [{ type: 'text', text: String(value) }] };
})().catch((e) => ({ content: [{ type: 'text', text: 'FAIL: ' + e.message }] }));
