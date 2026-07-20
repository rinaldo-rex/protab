# Phase 1 testing

## Automated checks

From a clean checkout:

```sh
npm install
npm test
npm run lint
npm run build
```

Load `dist/` as an unpacked extension. Do not load the repository root or use the Vite development server for Chrome API acceptance testing.

## Manual Chrome checklist

Record the Chrome version and results when opening the pull request.

1. In a clean Chrome profile, load `dist/` and confirm the extension and service worker report no errors.
2. Open two Chrome windows. Click Protab twice in each window. Confirm each window has one workspace, repeated clicks focus that window's workspace, and neither window reuses the other's workspace.
3. Create at least three projects. Select, rename, move up/down, and delete them using both mouse and keyboard. Confirm deletion reports the number of saved URLs and selects the expected successor.
4. Add valid and invalid URLs. Confirm only HTTP(S) is accepted, credentials are rejected, automatic hostname titles appear, and complete serialized URLs determine duplicates.
5. Add and edit titles, tags, and notes. Collapse/reopen records and confirm valid edits persist while invalid edits remain visible and expanded.
6. Reorder URL records with keyboard-accessible menu commands.
7. Copy one URL between two projects. Edit each copy separately and confirm metadata does not synchronize.
8. Reload the workspace and restart Chrome. Confirm projects, records, metadata, and ordering persist.
9. Complete project and URL management without a mouse. Confirm visible focus and sensible focus after canceling or completing deletion.
10. Clear the Network panels for both the workspace and service worker, exercise the workspace, and confirm there are no HTTP(S) requests.
11. At 1280 × 1024, compare layout, palette, spacing, density, typography, and three-pane hierarchy to `stitch_core_artifacts/screen.png`. Confirm there are no deferred controls or fake current tabs.

## Expected Phase 1 boundary

The **Current Tabs** pane is explanatory only. Phase 1 must not inspect, assign, open, close, or move ordinary tabs. Toolbar discovery queries only Protab's exact workspace URL in the clicked Chrome window.
