# Loading a Chrome extension under test

The unpacked-extension load is a **manual** step — the native folder picker can't be driven reliably via CDP. Don't tunnel on automating it; ask the user, then verify programmatically.

## Manual step (user)
1. `npm run build` → `dist/`.
2. `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the `dist/` directory.

## Verify it loaded (agent)
Run `scripts/verify-extension.js` with `params.name` = the extension's display name. It finds the `chrome://extensions` tab, runs `chrome.developerPrivate.getExtensionsInfo`, and returns `{ id, version, enabled, location }`.

If no `chrome://extensions` tab is open, open one first:
```
browser_new_tab({ url: 'chrome://extensions/' }) → browser_wait_for_load()
```

## Dead-ends (don't repeat these)
- `chrome.developerPrivate.loadUnpacked({ path })` — rejected; `path` isn't a parameter. `loadUnpacked` always opens the native picker.
- `chrome.developerPrivate.loadDirectory(<DirectoryEntry>)` — takes a `DirectoryEntry` (from a picker/drag), not a path. Useless without a picker.
- Raw-CDP `Page.setInterceptFileChooserDialog` + `DOM.setFileInputFiles` — the `Load unpacked` picker is native (no DOM `<input>` to set files on). Fragile; not worth it.

## Once you have the id
Open extension pages directly:
- Workspace: `browser_new_tab({ url: 'chrome-extension://<id>/workspace.html' })`
- Popup: `browser_new_tab({ url: 'chrome-extension://<id>/popup.html' })` — but see [hard-interactions.md](hard-interactions.md) for the popup-as-tab active-tab pitfall.
