# Protab quickstart guide

## Why Protab exists

You have 30 tabs open. Some are for your current project, some are for a side research task, two are playing music, and the rest are "I'll read this later" reminders you haven't touched in weeks. Closing the window feels risky — what if you lose something important?

Protab separates **durable context** from **temporary tabs**. Your projects store URLs, tags, and notes. Live tabs are disposable working copies you open only when needed. The result: a clean browser window without losing anything.

## Core mental model

- **Saved URLs are durable.** They live in projects, survive browser restarts, and hold your tags and notes.
- **Live tabs are temporary.** They're working instances of saved URLs (or unassigned pages you haven't filed yet).
- **Protab never syncs or uploads.** Everything stays in your browser's local storage.

## Your first cleanup

### 1. Open the workspace

Click the Protab toolbar icon, then click **Open workspace** at the bottom of the popup (or press the keyboard shortcut shown there). The full-page workspace opens with a sidebar on the left and your current tabs on the right.

### 2. Create a project

Click **New project** in the sidebar and give it a name — something like "Client work" or "Side project". This is a container for related URLs.

### 3. File your tabs

Look at the **Current Tabs** pane on the right. Each open tab in your browser window appears here, grouped by project ownership or **Unassigned**.

To file a tab into your new project:

- **Drag and drop**: Drag an unassigned tab row from the right pane into your project in the sidebar.
- **Hover shortcut**: Hover over a tab row and press `A`. It files to the currently selected project.
- **File button**: Hover over a tab row and click the file button that appears.

When you file a tab, Protab saves the URL and closes the browser tab. The URL is now safe in your project.

### 4. File all at once

If you have many unassigned tabs, use **File all unassigned** from the project's action menu. Protab saves every eligible tab and closes them in one go.

## Quick capture from anywhere

You don't need to open the workspace to save a tab. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) from any tab to open the quick-capture popup.

Type your capture using this format:

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

## Reopening saved URLs

In the project canvas, each saved URL shows an **Open** button. Click it to open that URL in the current window. If it's already open, Protab focuses the existing tab instead of opening a duplicate.

Use **Open another copy** from the URL's action menu if you need a second instance.

**Open all active** (from the project menu) opens every non-archived URL that isn't already open.

## Protected tabs

Some tabs shouldn't be closed by Protab. A tab is protected if:

- **You pinned it in Protab** — click the **Pin** button on any tab row in Current Tabs
- **It's pinned in Chrome** — Chrome's native tab pinning
- **It's playing audio** — Chrome reports the tab as audible

Protected tabs show badges (Pinned, Chrome pinned, Playing audio) and are skipped by all Protab close actions: filing, activation, close all, and quick-capture close. They're never silently closed.

Protab pins are session-only — they disappear when the tab closes. They don't permanently protect a URL.

## Archiving

When you're done with a URL but want to keep it for reference, archive it. Right-click the URL accordion or hover over it and press `R`. Archived URLs move to a separate collapsible section and are excluded from activation and Open all.

Press `R` again to unarchive.

## Export and backup

Use the project action menu to **Export** a project as a self-contained HTML file (works offline, all links clickable). Use **Export all** in the sidebar to get a ZIP of every project.

You can import these files later by dragging them onto the sidebar's import zone.

## Local, no subscription

Protab doesn't create accounts, sync data, or phone home. Your projects live in your browser's local storage. If you uninstall the extension or clear extension data, the data is gone — so export projects periodically if you want a backup.

## What Protab is not

- **Not a bookmark manager.** Bookmarks are browser-wide and flat. Protab is project-scoped and includes tags, notes, and an explicit close workflow.
- **Not a read-it-later tool.** Protab is about active work context, not article queuing.
- **Not a session manager.** Protab doesn't restore entire browser sessions. It saves individual URLs you choose to keep.
- **Not a tab suspender.** Protab doesn't hibernate tabs. It closes them after saving.

## Important safety notes

- **Unassigned tabs are never closed by activation.** Only other projects' tabs are targeted.
- **Protected tabs are never closed by any Protab action.** Chrome-pinned, audible, and manually pinned tabs are always skipped.
- **Protab can't detect unsaved form state.** Chrome may show its own warning for pages with form data, but Protab doesn't promise this.
- **Close is always explicit.** Every close action shows a confirmation or summary. Protab never silently closes tabs in the background.
