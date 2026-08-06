import { describe, expect, it } from 'vitest'
import { generateExportHtml } from './generateHtml'
import type { Project } from '../../domain/types'

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Research',
    parentId: null,
    savedUrls: [],
    archivedAt: null,
    ...overrides,
  }
}

describe('generateExportHtml', () => {
  it('generates valid HTML with project name in title', () => {
    const project = createProject()
    const html = generateExportHtml(project, [project])
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Research — Protab Export</title>')
  })

  it('includes project name in header', () => {
    const project = createProject({ name: 'My Project' })
    const html = generateExportHtml(project, [project])
    expect(html).toContain('My Project')
  })

  it('renders active URLs', () => {
    const project = createProject({
      savedUrls: [
        { id: 'u1', url: 'https://example.com/', title: 'Example', titleSource: 'automatic', tags: ['test'], notes: 'A note', archivedAt: null },
      ],
    })
    const html = generateExportHtml(project, [project])
    expect(html).toContain('href="https://example.com/"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('Example')
    expect(html).toContain('test')
    expect(html).toContain('A note')
  })

  it('renders archived URLs in separate section', () => {
    const project = createProject({
      savedUrls: [
        { id: 'u1', url: 'https://active.com/', title: 'Active', titleSource: 'automatic', tags: [], notes: '', archivedAt: null },
        { id: 'u2', url: 'https://archived.com/', title: 'Archived', titleSource: 'automatic', tags: [], notes: '', archivedAt: Date.now() },
      ],
    })
    const html = generateExportHtml(project, [project])
    expect(html).toContain('Active URLs (1)')
    expect(html).toContain('Archived (1)')
    expect(html).toContain('Active')
    expect(html).toContain('Archived')
  })

  it('escapes HTML in URLs, titles, tags, and notes', () => {
    const project = createProject({
      savedUrls: [
        { id: 'u1', url: 'https://example.com/?a=1&b=2', title: 'Title <with> "special"', titleSource: 'custom', tags: ['<tag>'], notes: 'Notes & more', archivedAt: null },
      ],
    })
    const html = generateExportHtml(project, [project])
    expect(html).toContain('&amp;')
    expect(html).toContain('&lt;')
    expect(html).toContain('&gt;')
    expect(html).toContain('&quot;')
  })

  it('includes export timestamp', () => {
    const project = createProject()
    const html = generateExportHtml(project, [project])
    expect(html).toMatch(/Exported \d{2}-[A-Z][a-z]{2}-\d{4}/)
  })

  it('renders tags as pills', () => {
    const project = createProject({
      savedUrls: [
        { id: 'u1', url: 'https://example.com/', title: 'Example', titleSource: 'automatic', tags: ['research', 'important'], notes: '', archivedAt: null },
      ],
    })
    const html = generateExportHtml(project, [project])
    expect(html).toContain('class="tag"')
    expect(html).toContain('research')
    expect(html).toContain('important')
  })

  it('renders notes when present', () => {
    const project = createProject({
      savedUrls: [
        { id: 'u1', url: 'https://example.com/', title: 'Example', titleSource: 'automatic', tags: [], notes: 'These are notes', archivedAt: null },
      ],
    })
    const html = generateExportHtml(project, [project])
    expect(html).toContain('class="notes"')
    expect(html).toContain('These are notes')
  })

  it('does not render notes section when notes are empty', () => {
    const project = createProject({
      savedUrls: [
        { id: 'u1', url: 'https://example.com/', title: 'Example', titleSource: 'automatic', tags: [], notes: '', archivedAt: null },
      ],
    })
    const html = generateExportHtml(project, [project])
    expect(html).not.toContain('class="notes"')
  })
})
