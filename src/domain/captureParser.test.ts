import { describe, it, expect } from 'vitest'
import { parseCaptureInput, getTagAutocomplete, getProjectAutocomplete, getProjectPathAutocomplete } from './captureParser'

describe('parseCaptureInput', () => {
  it('parses single tag and single project', () => {
    const result = parseCaptureInput('Need to read this #blog @Work')
    expect(result).toEqual({
      note: 'Need to read this',
      tags: ['blog'],
      projectName: 'Work',
    })
  })

  it('parses multiple tags and single project', () => {
    const result = parseCaptureInput('Check later #code #review @Research')
    expect(result).toEqual({
      note: 'Check later',
      tags: ['code', 'review'],
      projectName: 'Research',
    })
  })

  it('parses no tag with project', () => {
    const result = parseCaptureInput('Interesting article @Articles')
    expect(result).toEqual({
      note: 'Interesting article',
      tags: [],
      projectName: 'Articles',
    })
  })

  it('parses tag without note', () => {
    const result = parseCaptureInput('#video @Learning')
    expect(result).toEqual({
      note: '',
      tags: ['video'],
      projectName: 'Learning',
    })
  })

  it('parses only project (no note, no tags)', () => {
    const result = parseCaptureInput('@Work')
    expect(result).toEqual({
      note: '',
      tags: [],
      projectName: 'Work',
    })
  })

  it('returns empty projectName when no @ found', () => {
    const result = parseCaptureInput('Need to read this #blog')
    expect(result).toEqual({
      note: 'Need to read this',
      tags: ['blog'],
      projectName: '',
    })
  })

  it('returns empty input for empty string', () => {
    const result = parseCaptureInput('')
    expect(result).toEqual({
      note: '',
      tags: [],
      projectName: '',
    })
  })

  it('handles @ in the middle of text (not a project)', () => {
    const result = parseCaptureInput('Email user@example.com #tag @Project')
    expect(result).toEqual({
      note: 'Email user@example.com',
      tags: ['tag'],
      projectName: 'Project',
    })
  })

  it('handles # in the middle of text (not a tag)', () => {
    const result = parseCaptureInput('Check issue #123 @Project')
    expect(result).toEqual({
      note: 'Check issue',
      tags: ['123'],
      projectName: 'Project',
    })
  })

  it('uses last @ as project delimiter', () => {
    const result = parseCaptureInput('Email @user about @Project')
    expect(result).toEqual({
      note: 'Email',
      tags: [],
      projectName: 'Project',
    })
  })

  it('deduplicates tags', () => {
    const result = parseCaptureInput('Note #code #code @Work')
    expect(result).toEqual({
      note: 'Note',
      tags: ['code'],
      projectName: 'Work',
    })
  })

  it('handles project name with spaces', () => {
    const result = parseCaptureInput('Note @My Project')
    expect(result).toEqual({
      note: 'Note',
      tags: [],
      projectName: 'My Project',
    })
  })

  it('handles special characters in tags', () => {
    const result = parseCaptureInput('Note #c++ #node.js @Work')
    expect(result).toEqual({
      note: 'Note',
      tags: ['c++', 'node.js'],
      projectName: 'Work',
    })
  })

  it('trims whitespace', () => {
    const result = parseCaptureInput('  Note  #tag  @Project  ')
    expect(result).toEqual({
      note: 'Note',
      tags: ['tag'],
      projectName: 'Project',
    })
  })

  it('handles multiple tags with no spaces between', () => {
    const result = parseCaptureInput('Note #tag1#tag2 @Project')
    expect(result).toEqual({
      note: 'Note',
      tags: ['tag1', 'tag2'],
      projectName: 'Project',
    })
  })
})

describe('getTagAutocomplete', () => {
  const existingTags = ['blog', 'code', 'review', 'video', 'research']

  it('returns matching tags', () => {
    const result = getTagAutocomplete('bl', existingTags)
    expect(result).toEqual([
      { type: 'tag', label: 'blog', value: 'blog' },
      { type: 'create-tag', label: "+ Create 'bl'", value: 'bl' },
    ])
  })

  it('returns exact match without create option', () => {
    const result = getTagAutocomplete('blog', existingTags)
    expect(result).toEqual([
      { type: 'tag', label: 'blog', value: 'blog' },
    ])
  })

  it('returns empty for no matches', () => {
    const result = getTagAutocomplete('xyz', existingTags)
    expect(result).toEqual([
      { type: 'create-tag', label: "+ Create 'xyz'", value: 'xyz' },
    ])
  })

  it('returns all tags for empty partial', () => {
    const result = getTagAutocomplete('', existingTags)
    expect(result).toEqual(
      existingTags.map((tag) => ({ type: 'tag', label: tag, value: tag }))
    )
  })

  it('limits results to 8', () => {
    const manyTags = Array.from({ length: 20 }, (_, i) => `tag${i}`)
    const result = getTagAutocomplete('tag', manyTags)
    expect(result.length).toBeLessThanOrEqual(9) // 8 matches + create option
  })

  it('is case-insensitive', () => {
    const result = getTagAutocomplete('BL', existingTags)
    expect(result).toEqual([
      { type: 'tag', label: 'blog', value: 'blog' },
      { type: 'create-tag', label: "+ Create 'BL'", value: 'BL' },
    ])
  })
})

describe('getProjectAutocomplete', () => {
  const projectNames = ['Work', 'Research', 'Learning', 'Personal', 'Work Projects']

  it('returns matching projects', () => {
    const result = getProjectAutocomplete('work', projectNames)
    expect(result).toEqual([
      { type: 'project', label: 'Work', value: 'Work' },
      { type: 'project', label: 'Work Projects', value: 'Work Projects' },
    ])
  })

  it('returns empty for no matches', () => {
    const result = getProjectAutocomplete('xyz', projectNames)
    expect(result).toEqual([])
  })

  it('returns all projects for empty partial', () => {
    const result = getProjectAutocomplete('', projectNames)
    expect(result).toEqual(
      projectNames.map((name) => ({ type: 'project', label: name, value: name }))
    )
  })

  it('is case-insensitive', () => {
    const result = getProjectAutocomplete('RESEARCH', projectNames)
    expect(result).toEqual([
      { type: 'project', label: 'Research', value: 'Research' },
    ])
  })

  it('matches partial strings', () => {
    const result = getProjectAutocomplete('learn', projectNames)
    expect(result).toEqual([
      { type: 'project', label: 'Learning', value: 'Learning' },
    ])
  })

  it('limits results to 8', () => {
    const manyProjects = Array.from({ length: 20 }, (_, i) => `Project ${i}`)
    const result = getProjectAutocomplete('Project', manyProjects)
    expect(result.length).toBeLessThanOrEqual(8)
  })

  describe('with allowCreate', () => {
    it('adds create option when no exact match', () => {
      const result = getProjectAutocomplete('NewProject', projectNames, true)
      expect(result).toEqual([
        { type: 'create-project', label: "+ Create 'NewProject'", value: 'NewProject' },
      ])
    })

    it('does not add create option when exact match exists', () => {
      const result = getProjectAutocomplete('Work', projectNames, true)
      expect(result).toEqual([
        { type: 'project', label: 'Work', value: 'Work' },
        { type: 'project', label: 'Work Projects', value: 'Work Projects' },
      ])
    })

    it('does not add create option for empty partial when allowCreate is false', () => {
      const result = getProjectAutocomplete('', projectNames, false)
      expect(result).toEqual(
        projectNames.map((name) => ({ type: 'project', label: name, value: name }))
      )
    })

    it('adds New project option for empty partial when allowCreate is true', () => {
      const result = getProjectAutocomplete('', projectNames, true)
      expect(result).toEqual([
        ...projectNames.map((name) => ({ type: 'project', label: name, value: name })),
        { type: 'create-project', label: '+ New project', value: '' },
      ])
    })

    it('shows matching projects and create option together', () => {
      const result = getProjectAutocomplete('wor', projectNames, true)
      expect(result).toEqual([
        { type: 'project', label: 'Work', value: 'Work' },
        { type: 'project', label: 'Work Projects', value: 'Work Projects' },
        { type: 'create-project', label: "+ Create 'wor'", value: 'wor' },
      ])
    })

    it('does not add create option when allowCreate is false', () => {
      const result = getProjectAutocomplete('NewProject', projectNames, false)
      expect(result).toEqual([])
    })
  })
})

describe('getProjectPathAutocomplete', () => {
  const state = {
    projects: [
      { id: 'r1', name: 'Client work', parentId: null },
      { id: 'r2', name: 'Personal', parentId: null },
      { id: 'a', name: 'API docs', parentId: 'r1' },
      { id: 'b', name: 'Design', parentId: 'r1' },
      { id: 'c', name: 'Books', parentId: 'r2' },
      { id: 'd', name: 'Auth', parentId: 'a' },
    ],
  }

  it('surfaces a folder\u2019s sub-projects with the colon split when typing the folder', () => {
    const result = getProjectPathAutocomplete('Client work', state, false)
    expect(result.map((option) => option.value)).toContain('Client work:API docs')
    expect(result.map((option) => option.value)).toContain('Client work:Design')
  })

  it('matches canonical paths that contain the fragment (case-insensitive)', () => {
    const result = getProjectPathAutocomplete('auth', state, false)
    expect(result.map((option) => option.value)).toEqual(['Client work:API docs:Auth'])
  })

  it('expands deeper as the fragment grows', () => {
    const result = getProjectPathAutocomplete('Client work:API docs', state, false)
    expect(result.map((option) => option.value)).toEqual(['Client work:API docs', 'Client work:API docs:Auth'])
  })

  it('adds a create option for a missing path when allowed', () => {
    const result = getProjectPathAutocomplete('Client work:New Sub', state, true)
    expect(result.some((option) => option.type === 'create-project')).toBe(true)
    expect(result[result.length - 1]).toMatchObject({ type: 'create-project', value: 'Client work:New Sub' })
    const off = getProjectPathAutocomplete('Client work:New Sub', state, false)
    expect(off.every((option) => option.type === 'project')).toBe(true)
  })

  it('deduplicates repeated paths and caps suggestions', () => {
    const wide = {
      projects: Array.from({ length: 30 }, (_, index) => ({
        id: `p${index}`,
        name: `Item ${index}`,
        parentId: null as string | null,
      })),
    }
    const result = getProjectPathAutocomplete('Item 1', wide, false)
    expect(result.length).toBeLessThanOrEqual(8)
  })
})
