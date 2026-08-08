# Protab

Protab is a local-first Chrome extension for turning temporary browser tabs into durable, project-based URL collections.

## Core mental model

- **Saved URLs are durable.** They live in projects, survive browser restarts, and hold your tags and notes.
- **Live tabs are temporary.** They're working instances of saved URLs (or unassigned pages you haven't filed yet).
- **Protab never syncs or uploads.** Everything stays in your browser's local storage.

## Quick start

### Prerequisites

- Node.js 22 or newer
- npm

### Install and build

```sh
npm install
npm test
npm run lint
npm run build
```

### Load the extension

1. Run `npm run build`.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select this repository's `dist/` directory.
4. Click the Protab toolbar icon to open the quick-capture popup, or right-click and choose **Open workspace in new tab** for the full interface.

## First-use walkthrough

1. **Open the workspace.** Click the Protab toolbar icon, then click **Open workspace** at the bottom of the popup (or press `Ctrl+↵`). The full-page workspace opens with a sidebar on the left and your current tabs on the right.

2. **Create a project.** Click **New project** in the sidebar and give it a name — something like "Client work" or "Side project". This is a container for related URLs.

3. **File your tabs.** Look at the **Current Tabs** pane on the right. Each open tab appears here, grouped by project ownership or **Unassigned**. To file a tab:
   - **Drag and drop**: Drag an unassigned tab row into your project in the sidebar.
   - **Hover shortcut**: Hover over a tab row and press `A`. It files to the currently selected project.
   - **File button**: Hover over a tab row and click the file button that appears.

4. **Quick capture from anywhere.** Press `Ctrl+Shift+X` (`Cmd+Shift+X` on Mac) from any tab to save it without opening the workspace.

## Nested projects (folders)

Projects can form a tree, so you can organize ("Client work" → "API docs") as well as collect.

- **Folders vs leaves.** A project that contains sub-projects is a *folder*; a project that holds URLs is a *leaf*. Every saved URL lives in a leaf.
- **Address a project by path.** Quick capture and other references use `:`-separated names, e.g. `@Client work:API docs`. Sibling projects must have unique names; `:` is reserved and can't appear in a project name.
- **The `Misc` leaf is a documented contract, not a hidden transformation.** Adding a sub-project under a project that already has URLs moves those URLs into a `Misc` leaf inside it. Saving or filing *into* a folder stores the URL in that folder's `Misc` leaf (created on demand).
- **Subtree operations.** Activating, opening all, closing all, archiving, deleting, and exporting treat a folder and all its descendants as one unit. Deleting a folder deletes the whole subtree after an explicit confirmation that includes its saved-URL count.
- **Arrange by dragging.** Drag a project onto another project to nest it under that project; drag to a gap between rows to reorder within the same group.

## Quick capture format

```
optional note #tag1 #tag2 @ProjectName
```

Examples:
- `Check this later #blog @Research`
- `API docs #code #reference @Client work`
- `@Side project` (no note or tags — just save it)

The `@Project` part is required. Tags are optional. If the URL already exists in the project, Protab adds new tags and appends the note instead of creating a duplicate.

## Activation: deliberate focus

**Selecting** a project (clicking it in the sidebar) just shows its saved URLs. **Activating** it does something stronger: it closes other projects' tabs in the current window and marks this project as your active focus.

To activate a project, use the project's action menu and choose **Activate**. Unassigned tabs stay open. Tabs that are pinned in Chrome or playing audio are also kept open (they're "protected").

Activation never opens tabs automatically — it only closes others. You open what you need from the saved URLs.

## Protected tabs

Some tabs shouldn't be closed by Protab. A tab is protected if:

- **You pinned it in Protab** — click the **Pin** button on any tab row in Current Tabs
- **It's pinned in Chrome** — Chrome's native tab pinning
- **It's playing audio** — Chrome reports the tab as audible

Protected tabs show badges (Pinned, Chrome pinned, Playing audio) and are skipped by all Protab close actions: filing, activation, close all, and quick-capture close.

Protab pins are session-only — they disappear when the tab closes. They don't permanently protect a URL.

## Ownership and filing

When you file a tab, Protab:
1. Saves the URL and title to the project (or reuses an existing record).
2. Establishes "ownership" — linking the live browser tab to the saved URL.
3. Requests Chrome to close the tab.

If the URL already exists in the project, Protab reuses the existing record and adds new tags. Ownership lets Protab know which tabs are "working copies" of saved URLs, so it can focus existing tabs instead of opening duplicates.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+X` | Quick capture popup |
| `A` | File hovered tab to selected project |
| `R` | Archive / unarchive hovered URL or tab |
| `O` | Open hovered URL |
| `P` | Pin / unpin hovered tab |
| `D` | Delete hovered tab to Trash |
| `C` | Close hovered tab |
| `N` | Focus notes on hovered URL |
| `Shift+N` | Create new project |
| `Shift+A` | Archive / unarchive hovered project |
| Right-click project | Context menu: activate, rename, export, delete |

## Local-only data and permissions

Protab stores everything in your browser's `chrome.storage.local`. No data is sent to any server.

### Permissions used

| Permission | Why |
| --- | --- |
| `storage` | Save projects, URLs, tags, and notes locally |
| `tabs` | Read current tab URLs and titles for filing |
| `activeTab` | Access the current tab when you trigger quick capture |
| `contextMenus` | Add "Open workspace" to the extension icon's right-click menu |

The extension never fetches remote assets, analytics, or telemetry. User-requested page navigation (e.g., opening a saved URL) may contact its destination — that's normal browser behavior, not Protab.

## Chrome limitations

### Unsaved form data

Protab can't detect whether a page has unsaved form input. Chrome may show its own "Leave site?" warning for pages with form data, but Protab doesn't guarantee this. If you're filling out a form, consider pinning the tab to protect it.

### Programmatic close

Protab requests Chrome to close tabs using `chrome.tabs.remove()`. This is a *request*, not a forced kill. Pages with `beforeunload` handlers may show Chrome's native confirmation dialog. If you click "Cancel" in that dialog, the tab stays open and Protab marks it as "surviving" with a retry option.

### Surviving tabs

When a tab survives a close request (e.g., `beforeunload` dialog), Protab shows it in an attention banner at the top of the workspace. You can retry the close or dismiss the notice. The saved URL is already persisted — the tab just needs manual attention.

## Backup and uninstall

Protab stores data in `chrome.storage.local`, which is tied to your Chrome profile. If you:

- **Uninstall the extension**: Data is deleted when the extension is removed.
- **Clear extension data**: Data is deleted.
- **Switch Chrome profiles**: Data doesn't transfer.

**Export your projects periodically** using the project action menu (Export) or the sidebar's "Export all" button. Exports are self-contained HTML files (or ZIP for all projects) that work offline and can be imported later.

## Troubleshooting

### "Protab can't safely open this data"

This means Protab detected invalid or corrupted stored data. The extension enters read-only mode to prevent further damage. Your stored data is untouched.

**What to do:**
1. Don't clear extension data — that would delete your projects.
2. Export your data from the Settings panel if possible.
3. File an issue with the error message shown.

### Tabs not appearing in Current Tabs

- Make sure the tab's URL starts with `http://` or `https://`. Chrome internal pages (`chrome://`, `chrome-extension://`) are not shown.
- Try clicking the Protab workspace tab to refresh the inventory.

### Quick capture not working

- The keyboard shortcut `Ctrl+Shift+X` may conflict with another extension. Check `chrome://extensions/shortcuts` to reassign.
- Quick capture requires the active tab to have an `http://` or `https://` URL.

### Ownership mismatch after restart

When Protab restarts, it reconciles live tabs with saved URLs. If a tab's URL matches a saved URL, ownership is restored. If the match is ambiguous (multiple projects have the same URL), the tab appears as "Unassigned" until you assign it manually.

## Develop and test

```sh
npm install
npm test
npm run lint
npm run build
```

`npm run dev` starts the Vite workspace development server. Chrome extension behavior must be verified from the production build.

### Extension icon behavior

- **Click**: Opens a quick-capture popup anchored to the icon.
- **Right-click**: Context menu with "Open workspace in new tab".
- **Ctrl+Shift+X**: Opens the quick-capture popup from any tab.
- **Popup footer**: "Open workspace" link with a keyboard shortcut hint (default: `Ctrl+↵`).

## Privacy

**What is stored:** Project names, saved URLs, titles, tags, notes, and archived state.

**Where it is stored:** `chrome.storage.local` in your Chrome profile. Never leaves your browser.

**Which permissions are used:** `storage`, `tabs`, `activeTab`, `contextMenus`.

**Remote requests:** None. The production build bundles all fonts, icons, scripts, and styles. No analytics, telemetry, or remote assets. User-requested page navigation (opening a saved URL) may contact the destination server — that's normal browser behavior.
