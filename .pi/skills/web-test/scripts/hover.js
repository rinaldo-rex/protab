// ════════════════════════════════════════════════════════════════════════════
// hover.js  —  move the real Chrome mouse pointer onto an element
// ════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS (layman):
//   There is no "hover" tool in the harness. But many web apps only reveal
//   buttons, tooltips, or enable keyboard shortcuts when the mouse is
//   *actually* sitting over an element (CSS :hover / React onMouseEnter).
//   This script moves the real Chrome mouse pointer to coordinates you give
//   it, so hover state kicks in — the same way a human hovering does.
//
// WHEN TO USE:
//   - Hover menus / tooltips that appear on mouseenter.
//   - Keyboard shortcuts gated on "the hovered element" (e.g. press A to file
//     the tab you're currently hovering). Move the mouse onto the row, THEN
//     call browser_press_key('a').
//
// HOW (from the agent):
//   1. Get FRESH coordinates (a row's position shifts the moment the list
//      above it changes — a stale y is the #1 cause of a silently no-opping
//      hover shortcut):
//        browser_execute_js:
//          const el = document.querySelector('SELECTOR');
//          const r = el.getBoundingClientRect();
//          return JSON.stringify({x: Math.round(r.x+r.width/2),
//                                 y: Math.round(r.y+r.height/2)});
//   2. browser_run_script({ path: '<skill>/scripts/hover.js',
//                           params: { x, y } })
//   3. browser_press_key('a')  // or whatever the hover shortcut is
//
// GOTCHA: never hardcode coordinates. Re-read getBoundingClientRect() every
// time. Synthetic dispatchEvent('mouseenter') does NOT reliably trigger
// React's onMouseEnter — use this real CDP mouse move instead.
// ════════════════════════════════════════════════════════════════════════════

return (async () => {
  const x = Number(params.x);
  const y = Number(params.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('params.x and params.y (viewport CSS pixels) are required');
  }
  const repeats = Number(params.repeats) || 3;
  const s = daemon.session();
  for (let i = 0; i < repeats; i++) {
    await s.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x, y, button: 'none', buttons: 0, clickCount: 0,
    });
    await new Promise((r) => setTimeout(r, 80));
  }
  return { content: [{ type: 'text', text: `hovered at (${x}, ${y}) ×${repeats}` }] };
})().catch((e) => ({ content: [{ type: 'text', text: 'FAIL: ' + e.message }] }));
