import type { SavedUrl } from '../../domain/types'
import { unzipSync, strFromU8 } from 'fflate'

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

interface ImportedProject {
  name: string
  savedUrls: Array<Omit<SavedUrl, 'id'>>
}

function parseExportedHtml(html: string): ImportedProject | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Extract project name from title
    const titleEl = doc.querySelector('title')
    if (!titleEl?.textContent?.includes('Protab Export')) return null
    const projectName = titleEl.textContent.replace(' — Protab Export', '').trim()
    if (!projectName) return null

    const savedUrls: Array<Omit<SavedUrl, 'id'>> = []

    // Parse all URL cards
    const cards = doc.querySelectorAll('.url-card')
    for (const card of cards) {
      const link = card.querySelector('a[href]')
      if (!link) continue
      const url = link.getAttribute('href') || ''
      const title = link.textContent?.trim() || ''

      // Parse tags
      const tags: string[] = []
      const tagEls = card.querySelectorAll('.tag')
      for (const tagEl of tagEls) {
        // Remove SVG content, get just text
        const text = tagEl.textContent?.trim() || ''
        if (text) tags.push(text)
      }

      // Parse notes
      const notesEl = card.querySelector('.notes')
      const notes = notesEl?.textContent?.trim() || ''

      // Parse archived date
      const archivedEl = card.querySelector('.archived-date')
      let archivedAt: number | null = null
      if (archivedEl) {
        const dateText = archivedEl.textContent || ''
        const match = dateText.match(/Archived\s+(.+)/)
        if (match) {
          const parsed = new Date(match[1])
          if (!isNaN(parsed.getTime())) {
            archivedAt = parsed.getTime()
          }
        }
      }

      savedUrls.push({
        url,
        title,
        titleSource: 'automatic',
        tags,
        notes,
        archivedAt,
      })
    }

    return { name: projectName, savedUrls }
  } catch {
    return null
  }
}

export type ImportResult =
  | { kind: 'html'; project: ImportedProject }
  | { kind: 'zip'; projects: ImportedProject[] }
  | { kind: 'error'; message: string }

export async function parseImportFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.html') || name.endsWith('.htm')) {
    const text = await file.text?.() ?? await readFileAsText(file)
    const project = parseExportedHtml(text)
    if (!project) return { kind: 'error', message: 'This HTML file does not appear to be a Protab export.' }
    return { kind: 'html', project }
  }

  if (name.endsWith('.zip')) {
    const buffer = await file.arrayBuffer()
    const unzipped = unzipSync(new Uint8Array(buffer))
    const projects: ImportedProject[] = []

    for (const [filename, data] of Object.entries(unzipped)) {
      if (!filename.endsWith('.html')) continue
      const html = strFromU8(data)
      const project = parseExportedHtml(html)
      if (project) projects.push(project)
    }

    if (projects.length === 0) {
      return { kind: 'error', message: 'No valid Protab export files found in the ZIP.' }
    }
    return { kind: 'zip', projects }
  }

  return { kind: 'error', message: 'Unsupported file type. Please drop an HTML or ZIP file.' }
}
