import { describe, expect, it } from 'vitest'
import { createExportZip, getExportZipFilename } from './createZip'
import type { Project } from '../../domain/types'
import { unzipSync, strFromU8 } from 'fflate'

function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

describe('createExportZip', () => {
  it('creates a ZIP with one HTML file per project', async () => {
    const projects: Project[] = [
      { id: 'p1', name: 'First', parentId: null, savedUrls: [], archivedAt: null },
      { id: 'p2', name: 'Second', parentId: null, savedUrls: [], archivedAt: null },
    ]
    const blob = createExportZip(projects)
    expect(blob.type).toBe('application/zip')

    const buffer = await blobToUint8Array(blob)
    const unzipped = unzipSync(buffer)
    const filenames = Object.keys(unzipped)
    expect(filenames).toHaveLength(2)
    expect(filenames).toContain('protab-first.html')
    expect(filenames).toContain('protab-second.html')
  })

  it('each HTML file contains valid export content', async () => {
    const projects: Project[] = [
      { id: 'p1', name: 'Research', parentId: null, savedUrls: [{ id: 'u1', url: 'https://example.com/', title: 'Example', titleSource: 'automatic', tags: [], notes: '', archivedAt: null }], archivedAt: null },
    ]
    const blob = createExportZip(projects)
    const buffer = await blobToUint8Array(blob)
    const unzipped = unzipSync(buffer)
    const html = strFromU8(unzipped['protab-research.html'])
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Research')
    expect(html).toContain('https://example.com/')
  })

  it('sanitizes filenames', async () => {
    const projects: Project[] = [
      { id: 'p1', name: 'My Project! @#$', parentId: null, savedUrls: [], archivedAt: null },
    ]
    const blob = createExportZip(projects)
    const buffer = await blobToUint8Array(blob)
    const unzipped = unzipSync(buffer)
    const filenames = Object.keys(unzipped)
    expect(filenames[0]).toBe('protab-my-project-.html')
  })
})

describe('getExportZipFilename', () => {
  it('returns filename with DD-MMM-YYYY format', () => {
    const filename = getExportZipFilename()
    expect(filename).toMatch(/^protab-export-\d{2}-[A-Z][a-z]{2}-\d{4}\.zip$/)
  })
})

describe('createExportZip nested', () => {
  it('exports one HTML per root, embedding the subtree', async () => {
    const projects: Project[] = [
      { id: 'r1', name: 'Root', parentId: null, savedUrls: [], archivedAt: null },
      { id: 'c1', name: 'Child', parentId: 'r1', savedUrls: [{ id: 'u1', url: 'https://child.test/', title: 'Child', titleSource: 'automatic', tags: [], notes: '', archivedAt: null }], archivedAt: null },
      { id: 'r2', name: 'Solo', parentId: null, savedUrls: [], archivedAt: null },
    ]
    const blob = createExportZip(projects)
    const buffer = await blobToUint8Array(blob)
    const unzipped = unzipSync(buffer)
    const filenames = Object.keys(unzipped).sort()
    expect(filenames).toEqual(['protab-root.html', 'protab-solo.html'])
    const rootHtml = strFromU8(unzipped['protab-root.html'])
    expect(rootHtml).toContain('Child')
    expect(rootHtml).toContain('class="subproject"')
  })
})
