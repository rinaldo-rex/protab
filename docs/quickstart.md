# Protab Quickstart

Protab helps you turn messy browser tabs into durable project context.

Use it when a browser window has become a pile of reminders: docs you need later, social links you might read, admin pages you cannot forget, and project tabs you are afraid to close.

Protab is not trying to replace bookmarks, read-it-later apps, or session managers. It is for active work: the tabs you keep open because they still mean something. Protab lets you save them into projects, close them, and reopen only what you need later.

No account, subscription, or server is required for the core workflow. Your projects and saved URLs stay in local Chrome extension storage.

> Screenshot: Protab workspace with Projects, Saved URLs, and Current Tabs panes.

## The basic idea

Tabs are temporary. Projects are durable.

A saved URL in Protab can have:

- a title
- tags
- notes
- archive state
- project ownership when opened from Protab

The main loop is:

1. Save a tab into a project.
2. Close the live tab.
3. Reopen it later when you need it.

## Mental model

- **Saved URL**: durable project context.
- **Live tab**: a temporary working copy.
- **Selected project**: the project you are viewing.
- **Active project**: the project you are focusing the current window around.
- **Unassigned tab**: a tab Protab has not connected to a project.

Selecting a project is harmless. Activating a project is deliberate and may close other projects' tabs in the current Chrome window.

## Your first 5 minutes

1. Open a messy Chrome window.
2. Create 2–3 projects for the contexts in that window.
3. Select one project.
4. File a few unassigned tabs into projects.
5. Activate the project you want to work on now.
6. Reopen one saved URL to confirm the save–close–reopen loop.
7. Use quick-capture for new tabs before clutter builds up again.

## First cleanup: turn a messy window into projects

Imagine one window has a mix of tabs:

- coding docs
- GitHub issues
- Hacker News
- YouTube
- admin forms
- research links
- Twitter/X or Reddit threads

Instead of keeping all of them open, create projects for the contexts you care about.

Example projects:

- `Protab dev`
- `Research`
- `Life admin`
- `Reading / social`

## 1. Open the workspace

Click the Protab extension icon to open the quick-capture popup, then choose **Open workspace**.

If you are running the extension locally, build and load the unpacked `dist/` folder as described in the README.

> Screenshot: Protab popup with “Open workspace”.

## 2. Create a project

In the workspace sidebar, create a project for one context, such as:

```text
Protab dev
```

Then create another project for a different context:

```text
Research
```

Selecting a project only shows it. It does not open or close tabs.

## 3. File tabs into projects

Use the **Current Tabs** pane to file live tabs.

You can:

- drag an unassigned tab into a project
- hover a tab and press `A` to file it to the selected project
- use quick-capture for the current tab

When Protab files a tab, it saves the URL first. Then it attempts to close the tab, depending on the close behavior for that workflow.

> Screenshot: Current Tabs pane with unassigned tabs.

## 4. Use quick capture for low-friction saving

From any page, open the quick-capture popup with the configured shortcut.

Default:

```text
Ctrl+Shift+X
```

Then type a note, tags, and a project:

```text
useful API example #typescript #docs @Protab dev
```

Format:

```text
note #tag @Project
```

If the URL already exists in that project, Protab updates the existing record instead of creating a duplicate.

> Screenshot: Quick-capture popup with `#tag` and `@Project` autocomplete.

## 5. Activate a project when you want focus

After filing tabs into projects, choose the project you want to work on and click **Activate**.

Activation is deliberate:

- it does not open tabs
- it does not close unassigned tabs
- it only affects the current Chrome window
- it closes tabs owned by other projects, except tabs Protab must keep open

This lets you clean the window around one active context without losing the rest of your saved work.

> Screenshot: Active project indicator.

## 6. Reopen what you need

Inside a project, each saved URL can be reopened.

Use:

- **Open** to focus an existing owned copy or open one if needed
- **Open another copy** when you intentionally want a second instance
- **Open all** to restore the active saved URLs for that project

Saved URLs are the durable source of truth. Live tabs are just working copies.

## Everyday habit

Use Protab when you notice:

- too many tabs are slowing down your browser
- a window has mixed contexts
- you are afraid to close tabs because they still feel important
- you want to switch projects without keeping every project live

A simple daily flow:

1. Quick-capture or file tabs as soon as they become project context.
2. Close tabs after saving them.
3. Activate the project you are working on now.
4. Reopen saved URLs only when needed.

## Important notes

Protab does not guess silently.

- Unassigned tabs stay visible.
- Ambiguous tabs stay unassigned until you decide.
- Protab does not claim to detect unsaved page changes.
- Closing is requested through Chrome, and Protab reports what happened as honestly as possible.

Protab is best used as a lightweight project-context layer for active work — not as a replacement for the other tools you already use.
