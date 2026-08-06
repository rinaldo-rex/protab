import { zipSync, strToU8 } from 'fflate'
import type { Project } from '../../domain/types'
import { generateExportHtml } from './generateHtml'
import { sanitizeFilename } from './downloadFile'

/**
 * Exports one self-contained HTML per ROOT project (each including its whole
 * subtree). `projects` is the flat project list; nodes with a parent are
 * included inside their root's file.
 */
export function createExportZip(projects: Project[]): Blob {
  const files: Record<string, Uint8Array> = {}
  for (const project of projects.filter((p) => p.parentId === null)) {
    const html = generateExportHtml(project, projects)
    const filename = `protab-${sanitizeFilename(project.name)}.html`
    files[filename] = strToU8(html)
  }
  const zipped = zipSync(files)
  return new Blob([zipped], { type: 'application/zip' })
}

export function getExportZipFilename(): string {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[now.getMonth()]
  const year = now.getFullYear()
  return `protab-export-${day}-${month}-${year}.zip`
}
