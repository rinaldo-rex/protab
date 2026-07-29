# Hard-to-drive interactions & workarounds

Some browser flows can't be driven cleanly via CDP. Recognize them fast, switch to an equivalent affordance, and flag the unverifiable bits for a human spot-check.

## Hover-revealed UI (tooltips, hover buttons, hover-gated shortcuts)
No hover tool. CSS `:hover` / React `onMouseEnter` need a real `Input.dispatchMouseEvent` of type `mouseMoved`.

```
# 1. get FRESH coords (rows shift when the list above changes)
browser_execute_js:
  const el = document.querySelector('SELECTOR'); const r = el.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)})

# 2. move the real mouse
browser_run_script({ path: '<skill>/scripts/hover.js', params: { x, y } })

# 3. then the shortcut / hover-revealed button is live
browser_press_key('a')
```

- **Re-read `getBoundingClientRect()` before every hover.** A stale `y` lands on empty space → the component's hovered-id stays null → the shortcut silently no-ops. This is the #1 cause of false "shortcut is broken" reports.
- Synthetic `dispatchEvent('mouseenter')` does **not** reliably trigger React's `onMouseEnter`. Use the real CDP mouse move.
- Hover *reveals* a button? After the move, `browser_snapshot` to get its ref, then `browser_click({ref})`.

## Drag-and-drop
`browser_drag_and_drop` uses `Input.dispatchDragEvent`, which React DnD / HTML5 drop handlers routinely ignore. Treat drag-drop as **not verifiable via CDP** unless you confirm a drop registered. Mitigation: test the same feature through an alternate path (keyboard shortcut, context menu, bulk button) and have a human spot-check the drag itself.

## Right-click context menus
`browser_click({ button: 'right', ref })` works. After it opens, either re-snapshot and click the `[role=menuitem]` ref, or find+click it via `browser_execute_js`:
```
const m = document.querySelector('[role=menu]');
const item = Array.from(m.querySelectorAll('[role=menuitem]')).find(i => i.textContent.trim()==='Archive');
item.click();
```
This is the reliable fallback when an app only exposes actions via context menu.

## Native file pickers / `Load unpacked`
`<input type=file>` with `webkitdirectory`, or pickers opened by internal extension APIs — can't drive cleanly. Use `browser_upload_file({ ref })` for ordinary visible file inputs; for native pickers, ask the user. See [extension-loading.md](extension-loading.md).

## Chrome keyboard *commands* (manifest `commands`, e.g. Ctrl+Shift+X)
**Cannot be triggered via CDP** — they're user-facing Chrome shortcuts, not page keypresses. Test the bound popup's UI by opening it directly; test the command's wiring separately or by hand. For popups that capture the active tab, see `scripts/activate-target-for-popup.js`.
