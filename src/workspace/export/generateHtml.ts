import type { Project, SavedUrl } from '../../domain/types'
import { childrenOf, subtreeSavedUrls } from '../../domain/tree'
import { fontData } from './font-data'

const icons = {
  folder: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  tag: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
  externalLink: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  archive: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatTimestamp(): string {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[now.getMonth()]
  const year = now.getFullYear()
  return `${day}-${month}-${year}`
}

function renderUrlCard(url: SavedUrl): string {
  const tagsHtml = url.tags.length > 0
    ? `<div class="tags">${url.tags.map((tag) => `<span class="tag">${icons.tag} ${escapeHtml(tag)}</span>`).join('')}</div>`
    : ''
  const notesHtml = url.notes
    ? `<p class="notes">${escapeHtml(url.notes)}</p>`
    : ''
  const archivedHtml = url.archivedAt
    ? `<p class="archived-date">${icons.archive} Archived ${formatDate(url.archivedAt)}</p>`
    : ''
  return `
    <article class="url-card">
      <h3><a href="${escapeHtml(url.url)}" target="_blank" rel="noopener">${escapeHtml(url.title)}</a> ${icons.externalLink}</h3>
      <p class="url">${escapeHtml(url.url)}</p>
      ${tagsHtml}
      ${notesHtml}
      ${archivedHtml}
    </article>`
}

function generateStyles(): string {
  const fontFaces = fontData.map(({ weight, base64 }) => `
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: ${weight};
      font-display: swap;
      src: url(data:font/woff2;base64,${base64}) format('woff2');
    }`).join('')

  return `
    ${fontFaces}
    :root {
      font-family: Inter, system-ui, sans-serif;
      color: #1b1c1a;
      background: #fbf9f6;
      --surface: #fbf9f6;
      --surface-lowest: #fff;
      --surface-low: #f5f3f0;
      --surface-container: #efeeeb;
      --primary: #181512;
      --on-surface: #1b1c1a;
      --on-surface-variant: #4d4540;
      --outline-variant: #cfc4bd;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 40px; }
    .export-header { max-width: 800px; margin: 0 auto 32px; }
    .export-header h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; letter-spacing: -.02em; }
    .export-header .meta { color: var(--on-surface-variant); font-size: 13px; line-height: 1.5; }
    .export-section { max-width: 800px; margin: 0 auto 32px; }
    .export-section h2 { margin: 0 0 16px; font-size: 18px; font-weight: 600; color: var(--on-surface-variant); }
    .url-card { padding: 16px; margin-bottom: 12px; border: 1px solid var(--outline-variant); border-radius: 8px; background: var(--surface-lowest); }
    .url-card h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .url-card h3 a { color: var(--primary); text-decoration: none; }
    .url-card h3 a:hover { text-decoration: underline; }
    .url-card h3 svg { color: var(--on-surface-variant); flex-shrink: 0; }
    .url-card .url { margin: 0 0 10px; color: var(--on-surface-variant); font-size: 12px; word-break: break-all; }
    .url-card .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .url-card .tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border: 1px solid var(--outline-variant); border-radius: 4px; background: var(--surface-low); color: var(--on-surface-variant); font-size: 11px; font-weight: 500; }
    .url-card .tag svg { flex-shrink: 0; }
    .url-card .notes { margin: 0 0 10px; color: var(--on-surface-variant); font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
    .url-card .archived-date { margin: 0; display: flex; align-items: center; gap: 6px; color: var(--on-surface-variant); font-size: 11px; font-weight: 500; }
    .url-card .archived-date svg { flex-shrink: 0; }
    .footer { max-width: 800px; margin: 40px auto 0; padding-top: 16px; border-top: 1px solid var(--outline-variant); color: var(--on-surface-variant); font-size: 11px; text-align: center; }
  `
}

function ownUrlSections(node: Project): string {
  const activeUrls = node.savedUrls.filter((u) => !u.archivedAt)
  const archivedUrls = node.savedUrls.filter((u) => u.archivedAt)
  const activeSection = activeUrls.length > 0
    ? `<section class="export-section">
        <h2>Active URLs (${activeUrls.length})</h2>
        ${activeUrls.map(renderUrlCard).join('')}
      </section>`
    : ''
  const archivedSection = archivedUrls.length > 0
    ? `<section class="export-section">
        <h2>${icons.archive} Archived (${archivedUrls.length})</h2>
        ${archivedUrls.map(renderUrlCard).join('')}
      </section>`
    : ''
  return `${activeSection}${archivedSection}`
}

/** Recursively renders a project node (name + its own URLs + its sub-projects). */
function renderNode(node: Project, state: PersistedProjects): string {
  const childrenHtml = childrenOf(state, node.id).map((child) => renderNode(child, state)).join('')
  return `
  <section class="subproject">
    <h2 class="export-project-name">${icons.folder} ${escapeHtml(node.name)}</h2>
    ${ownUrlSections(node)}
    ${childrenHtml}
  </section>`
}

/** Minimal read-only project container satisfying the domain tree helpers. */
type PersistedProjects = { schemaVersion: 3; projects: Project[] }

function projectsState(allProjects: Project[]): PersistedProjects {
  return { schemaVersion: 3, projects: allProjects }
}

/**
 * Exports a project and its whole subtree as a self-contained, offline HTML
 * file. `allProjects` is the flat project list that lets the serializer find
 * descendants by `parentId`.
 */
export function generateExportHtml(project: Project, allProjects: Project[]): string {
  const timestamp = formatTimestamp()
  const state = projectsState(allProjects)
  const subtree = subtreeSavedUrls(state, project.id)
  const totalActive = subtree.filter((u) => !u.archivedAt).length
  const totalArchived = subtree.length - totalActive
  const childrenHtml = childrenOf(state, project.id).map((child) => renderNode(child, state)).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.name)} — Protab Export</title>
  <style>${generateStyles()}</style>
</head>
<body>
  <header class="export-header">
    <h1>${icons.folder} ${escapeHtml(project.name)}</h1>
    <p class="meta">Exported ${timestamp} · ${totalActive} active · ${totalArchived} archived</p>
  </header>
  <main class="export-content">
  ${ownUrlSections(project)}
  ${childrenHtml}
  </main>
  <footer class="footer">
    Exported by Protab — Local-first tab management
  </footer>
</body>
</html>`
}
