// ════════════════════════════════════════════════════════════════════════════
// sw-inspect.js  —  read an MV3 service worker's console + exceptions
// ════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS (layman):
//   Chrome extensions run their background logic in a "service worker" — a
//   separate, invisible process whose errors NEVER show up on the page you're
//   looking at. When an action silently fails and the page console is clean,
//   the cause is almost always in that worker. This script attaches a
//   debugger to the worker, optionally triggers an action on the page, and
//   then reads whatever the worker logged or threw while you reproduced it.
//
// WHEN TO USE:
//   - Any extension bug where the page console is silent (stuck dialogs,
//     "nothing happened" after a click, a message that never came back).
//   - Confirming whether the worker recycled and lost in-memory state.
//
// HOW (from the agent):
//   browser_run_script({
//     path: '<skill>/scripts/sw-inspect.js',
//     params: {
//       wsUrl?,                              // optional; auto-discovered otherwise
//       swUrlContains: 'flfbbegfjfomffhgj',  // substring of the SW target URL (the ext id works)
//       triggerExpr: "...JS to reproduce...", // optional; run on the CURRENT harness page
//       waitMs: 3500                          // how long to listen after triggering
//     }
//   })
//   -> returns the worker's console calls, log entries, and exceptions.
//
// GOTCHA: CDP does NOT replay past exceptions. You MUST enable Runtime/Log on
// the worker BEFORE reproducing the action. That's why this script enables
// first, runs triggerExpr (via the harness page) second, then drains. If you
// don't pass triggerExpr, it just listens for waitMs — useful for catching
// worker errors while you click around in the UI with the normal browser_* tools.
//
// This script opens its OWN WebSocket (copied from raw-ws.js) so it can listen
// to the worker's events without stealing from the harness's event stream.
// ════════════════════════════════════════════════════════════════════════════

const WebSocket = require('ws');
const { readFile } = require('fs/promises');
const { homedir } = require('os');
const { join } = require('path');

async function discoverWsUrl() {
  if (process.env.BU_CDP_WS) return process.env.BU_CDP_WS;
  const home = homedir();
  for (const base of [join(home, '.config/google-chrome'), join(home, '.config/chromium'), join(home, '.config/BraveSoftware/Brave-Browser'), join(home, '.config/microsoft-edge')]) {
    let raw;
    try { raw = await readFile(join(base, 'DevToolsActivePort'), 'utf8'); } catch { continue; }
    const [port, path] = raw.trim().split('\n');
    if (port && path) return `ws://127.0.0.1:${port.trim()}${path.trim()}`;
  }
  throw new Error('DevTools WS URL not found. Pass params.wsUrl or set BU_CDP_WS.');
}

return (async () => {
  const wsUrl = params.wsUrl || (await discoverWsUrl());
  const swContains = String(params.swUrlContains || '').trim();
  const triggerExpr = params.triggerExpr ? String(params.triggerExpr) : null;
  const waitMs = Number(params.waitMs) || (triggerExpr ? 3500 : 2500);

  const sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => { sock.on('open', res); sock.on('error', rej); });
  const buf = []; let nextId = 0; const pending = new Map();
  sock.on('message', (m) => { const j = JSON.parse(m.toString()); buf.push(j); if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); } });
  const send = (method, p, sessionId) => new Promise((res) => { const i = ++nextId; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params: p, sessionId: sessionId || undefined })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ err: 'timeout ' + method }); } }, 10000); });

  // 1) find the service worker target
  const tg = await send('Target.getTargets', {}, null);
  const targets = (tg.result && tg.result.targetInfos) || [];
  const sw = targets.find((t) => t.type === 'service_worker' && (!swContains || (t.url || '').includes(swContains)));
  if (!sw) {
    sock.close();
    return { content: [{ type: 'text', text: 'No service_worker target found' + (swContains ? ` matching "${swContains}"` : '') + '. Targets: ' + JSON.stringify(targets.map((t) => ({ type: t.type, url: t.url }))) }] };
  }

  // 2) attach + enable Runtime/Log (capture starts HERE — before the repro)
  const att = await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true }, null);
  const sid = (att.result && att.result.sessionId) || att.sessionId;
  await send('Runtime.enable', {}, sid);
  await send('Log.enable', {}, sid);

  // 3) optionally reproduce the action on the current harness page
  let triggered = 'none';
  if (triggerExpr) {
    try { triggered = await daemon.evaluateJs(`(function(){ ${triggerExpr} })()`); }
    catch (e) { triggered = 'trigger-error: ' + e.message; }
  }

  // 4) wait, then drain worker events
  await new Promise((r) => setTimeout(r, waitMs));
  const entries = buf
    .filter((x) => (x.method === 'Runtime.consoleAPICalled' || x.method === 'Log.entryAdded' || x.method === 'Runtime.exceptionThrown') && x.sessionId === sid)
    .map((x) => ({ m: x.method, p: x.params }));

  sock.close();
  return { content: [{ type: 'text', text: JSON.stringify({ sw: sw.targetId, swUrl: sw.url, triggered, count: entries.length, entries: entries.slice(0, 40) }, null, 2) }] };
})().catch((e) => ({ content: [{ type: 'text', text: 'FAIL: ' + e.message }] }));
