// ════════════════════════════════════════════════════════════════════════════
// raw-ws.js  —  canonical raw-CDP client + targets-listing diagnostic
// ════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS (layman):
//   The harness already talks to Chrome through one back-channel, but that
//   channel is "owned" by the harness — tapping into its event stream risks
//   stealing events it needs (e.g. dialog detection). This script opens a
//   SEPARATE back-channel (its own WebSocket) so you can run advanced commands
//   — especially event listening, like capturing a service worker's console —
//   without interfering with the harness.
//
//   Run directly, it lists every Chrome target (tabs, service workers, etc.)
//   and prints the WebSocket URL it discovered — a useful first diagnostic and
//   the canonical client code to copy when writing your own raw-CDP scripts.
//
// WHEN TO USE:
//   - As a sanity check: "is the DevTools endpoint reachable, and what
//     targets exist?"
//   - As the copy-source for the tiny client factory (createRawCdpClient) used
//     by sw-inspect.js and any custom raw-CDP script you write.
//
// HOW (from the agent):
//   browser_run_script({ path: '<skill>/scripts/raw-ws.js', params: { wsUrl? } })
//   -> returns the discovered WS URL + every target's type/url.
//
// WS URL DISCOVERY ORDER: params.wsUrl -> BU_CDP_WS env -> read
//   ~/.config/<browser>/DevToolsActivePort (port on line 1, path on line 2).
//   Note: HTTP /json/version may be DISABLED even when the WS endpoint is live
//   — so don't rely on curl; read the DevToolsActivePort file or the WS itself.
//
// GOTCHA: every CDP response is the WHOLE message { id, result, error }. Read
// res.result.targetInfos, NOT res.targetInfos — forgetting the .result wrapper
// silently returns an empty array and makes you think nothing exists.
// ════════════════════════════════════════════════════════════════════════════

const WebSocket = require('ws');
const { readFile } = require('fs/promises');
const { homedir } = require('os');
const { join } = require('path');

// --- discover the browser WebSocket URL -------------------------------
async function discoverWsUrl() {
  if (process.env.BU_CDP_WS) return process.env.BU_CDP_WS;
  const home = homedir();
  const dirs = [
    join(home, '.config/google-chrome'),
    join(home, '.config/chromium'),
    join(home, '.config/BraveSoftware/Brave-Browser'),
    join(home, '.config/microsoft-edge'),
  ];
  for (const base of dirs) {
    let raw;
    try { raw = await readFile(join(base, 'DevToolsActivePort'), 'utf8'); } catch { continue; }
    const [port, path] = raw.trim().split('\n');
    if (port && path) return `ws://127.0.0.1:${port.trim()}${path.trim()}`;
  }
  throw new Error('DevTools WS URL not found. Pass params.wsUrl or set BU_CDP_WS.');
}

// --- the tiny raw-CDP client factory (copy this into custom scripts) --
function createRawCdpClient(wsUrl) {
  const sock = new WebSocket(wsUrl);
  const buf = [];
  let nextId = 0;
  const pending = new Map();
  sock.on('message', (m) => {
    const j = JSON.parse(m.toString());
    buf.push(j);
    if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); }
  });
  const send = (method, params, sessionId) => new Promise((res) => {
    const i = ++nextId;
    pending.set(i, res);
    sock.send(JSON.stringify({ id: i, method, params, sessionId: sessionId || undefined }));
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ err: 'timeout ' + method }); } }, 10000);
  });
  const ready = new Promise((res, rej) => { sock.on('open', res); sock.on('error', rej); });
  return {
    ready, send,
    events: () => buf,                       // raw CDP events buffered here
    close: () => sock.close(),
  };
}

// --- run directly: list targets ---------------------------------------
return (async () => {
  const wsUrl = params.wsUrl || (await discoverWsUrl());
  const c = createRawCdpClient(wsUrl);
  await c.ready;
  const tg = await c.send('Target.getTargets', {}, null);
  const infos = ((tg.result && tg.result.targetInfos) || []).map((t) => ({
    type: t.type, url: (t.url || '').slice(0, 80), title: (t.title || '').slice(0, 30),
  }));
  c.close();
  return { content: [{ type: 'text', text: JSON.stringify({ wsUrl, count: infos.length, targets: infos }, null, 2) }] };
})().catch((e) => ({ content: [{ type: 'text', text: 'FAIL: ' + e.message }] }));
