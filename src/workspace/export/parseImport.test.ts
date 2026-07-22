import { describe, expect, it } from 'vitest'
import { parseImportFile } from './parseImport'

function createHtmlFile(html: string, name = 'test.html'): File {
  return new File([html], name, { type: 'text/html' })
}


describe('parseImportFile', () => {
  it('rejects unsupported file types', async () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' })
    const result = await parseImportFile(file)
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.message).toContain('Unsupported file type')
    }
  })

  it('rejects HTML files that are not Protab exports', async () => {
    const html = '<html><head><title>Not a Protab export</title></head><body></body></html>'
    const file = createHtmlFile(html)
    const result = await parseImportFile(file)
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.message).toContain('does not appear to be a Protab export')
    }
  })

  it('parses a valid Protab export HTML', async () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>My Project — Protab Export</title>
</head>
<body>
  <header class="export-header">
    <h1>My Project</h1>
    <p class="meta">Exported 01-Jan-2025 · 1 active · 0 archived</p>
  </header>
  <section class="export-section">
    <h2>Active URLs (1)</h2>
    <article class="url-card">
      <h3><a href="https://example.com/" target="_blank" rel="noopener">Example</a></h3>
      <p class="url">https://example.com/</p>
      <div class="tags"><span class="tag">research</span></div>
      <p class="notes">Some notes</p>
    </article>
  </section>
</body>
</html>`
    const file = createHtmlFile(html)
    const result = await parseImportFile(file)
    expect(result.kind).toBe('html')
    if (result.kind === 'html') {
      expect(result.project.name).toBe('My Project')
      expect(result.project.savedUrls).toHaveLength(1)
      expect(result.project.savedUrls[0]).toMatchObject({
        url: 'https://example.com/',
        title: 'Example',
        tags: ['research'],
        notes: 'Some notes',
      })
    }
  })

  it('handles archived URLs in the import', async () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Project — Protab Export</title>
</head>
<body>
  <section class="export-section">
    <h2>Active URLs (0)</h2>
  </section>
  <section class="export-section">
    <h2>Archived (1)</h2>
    <article class="url-card">
      <h3><a href="https://archived.com/" target="_blank" rel="noopener">Archived</a></h3>
      <p class="url">https://archived.com/</p>
      <p class="archived-date">Archived Jan 1, 2025</p>
    </article>
  </section>
</body>
</html>`
    const file = createHtmlFile(html)
    const result = await parseImportFile(file)
    expect(result.kind).toBe('html')
    if (result.kind === 'html') {
      expect(result.project.savedUrls[0].archivedAt).toBeTypeOf('number')
    }
  })
})
