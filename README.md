# Protab

Protab is a local-first Chrome extension for turning temporary browser tabs into durable, project-based URL collections.

## Core mental model

- **Saved URLs are durable.** They live in projects, survive browser restarts, and hold your tags and notes.
- **Live tabs are temporary.** They're working instances of saved URLs (or unassigned pages you haven't filed yet).
- **Protab never syncs or uploads.** Everything stays in your browser's local storage.

## Nested projects (folders)

Projects can form a tree, so you can organize ("Client work" → "API docs") as well as collect.

- **Folders vs leaves.** A project that contains sub-projects is a *folder*; a project that holds URLs is a *leaf*. Every saved URL lives in a leaf.
- **Address a project by path.** Quick capture and other references use `:`-separated names, e.g. `@Client work:API docs`. Sibling projects must have unique names; `:` is reserved and can't appear in a project name.
- **The `Misc` leaf is a documented contract, not a hidden transformation.** Adding a sub-project under a project that already has URLs moves those URLs into a `Misc` leaf inside it. Saving or filing *into* a folder stores the URL in that folder's `Misc` leaf (created on demand). This is spelled out in `design_decisions.md` so the behavior is predictable.
- **Subtree operations.** Activating, opening all, closing all, archiving, deleting, and exporting treat a folder and all its descendants as one unit. Deleting a folder deletes the whole subtree after an explicit confirmation that includes its saved-URL count.
- **Quick-capture autocomplete** expands a folder into its sub-projects with the `:` split: typing `@TestProj` suggests `@TestProj:SubA`, `@TestProj:SubB`.
- **Arrange by dragging.** Drag a project onto another project to nest it under that project; drag to a gap between rows to reorder within the same group.

## Quick capture from anywhere

Press `Ctrl+Shift+X` (`Cmd+Shift+X` on Mac) from any tab to open the quick-capture popup. Type your capture using this format:

```
optional note #tag1 #tag2 @ProjectName
```

Examples:

- `Check this later #blog @Research`
- `API docs #code #reference @Client work`
- `@Side project` (no note or tags — just save it)

The `@Project` part is required. Tags are optional. If the URL already exists in the project, Protab adds new tags and appends the note instead of creating a duplicate.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+X` | Quick capture popup |
| `A` | File hovered tab to selected project |
| `R` | Archive / unarchive hovered URL |
| `O` | Open hovered URL |
| `Shift+N` | Create new project |
| `N` | Focus notes on hovered URL |
| Right-click project | Activate, rename, export, delete |

## Develop and test

Requirements: Node.js 22 or newer and npm.

```sh
npm install
npm test
npm run lint
npm run build
```

`npm run dev` starts the Vite workspace development server. Chrome extension behavior must be verified from the production build.

## Load the extension locally

1. Run `npm run build`.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select this repository's `dist/` directory.
4. Click the Protab toolbar action to open the full-page workspace.

The production build is entirely local: fonts, icons, scripts, and styles are bundled into `dist/`. The extension requests `storage`, `tabs`, `activeTab`, and `contextMenus` permissions.

### Extension icon behavior

- **Click**: Opens a quick-capture popup anchored to the icon.
- **Right-click**: Context menu with "Open workspace in new tab".
- **Ctrl+Shift+X**: Opens the quick-capture popup from any tab.
- **Popup footer**: "Open workspace" link with a keyboard shortcut hint (default: `Ctrl+↵`).
