export interface ParsedCapture {
  note: string
  tags: string[]
  projectName: string
}

/**
 * Parses quick-capture input in the format: <note> #<tag1> #<tag2> @<project>
 *
 * Rules:
 * - Only the last @ (preceded by whitespace or at start) is used as project delimiter
 * - Multiple #tag are allowed; each # starts a new tag
 * - Tags end at whitespace or another # or @
 * - Everything before the first # or @ (that's a delimiter) is the note
 * - If no @ is found, projectName is empty (error)
 */
export function parseCaptureInput(input: string): ParsedCapture {
  const trimmed = input.trim()
  if (!trimmed) {
    return { note: '', tags: [], projectName: '' }
  }

  // Find the last @ that's a project delimiter (preceded by whitespace or at start)
  const projectDelimiterRegex = /(?:^|\s)@(?!.*(?:^|\s)@)/
  const projectMatch = trimmed.match(projectDelimiterRegex)
  let projectName = ''
  let workingInput = trimmed

  if (projectMatch && projectMatch.index !== undefined) {
    // Extract project name (everything after the @)
    const atIndex = projectMatch.index + (projectMatch[0].startsWith(' ') ? 1 : 0)
    projectName = trimmed.slice(atIndex + 1).trim()
    workingInput = trimmed.slice(0, atIndex).trim()
  }

  // Find all #tags
  const tags: string[] = []
  const tagRegex = /#([^\s#@]+)/g
  let match
  while ((match = tagRegex.exec(workingInput)) !== null) {
    const tag = match[1].trim()
    if (tag) {
      tags.push(tag)
    }
  }

  // Note is everything before the first # or @ that's a delimiter
  const noteMatch = workingInput.match(/(?:^|\s)[#@]/)
  const note = noteMatch && noteMatch.index !== undefined
    ? workingInput.slice(0, noteMatch.index + (noteMatch[0].startsWith(' ') ? 1 : 0)).trim()
    : workingInput.trim()

  return {
    note,
    tags: [...new Set(tags)], // Deduplicate tags
    projectName,
  }
}

export interface AutocompleteOption {
  type: string
  label: string
  value: string
}

const MAX_SUGGESTIONS = 8

/**
 * Returns tag suggestions matching the partial tag after #
 */
export function getTagAutocomplete(partial: string, existingTags: string[]): AutocompleteOption[] {
  const lowerPartial = partial.toLowerCase()
  const matches: AutocompleteOption[] = existingTags
    .filter((tag) => tag.toLowerCase().startsWith(lowerPartial))
    .slice(0, 8)
    .map((tag) => ({
      type: 'tag',
      label: tag,
      value: tag,
    }))

  // Add "create new" option if partial doesn't match exactly
  const exactMatch = existingTags.some((tag) => tag.toLowerCase() === lowerPartial)
  if (partial && !exactMatch) {
    matches.push({
      type: 'create-tag',
      label: `+ Create '${partial}'`,
      value: partial,
    })
  }

  return matches
}

/**
 * Returns project suggestions matching the partial project name after @
 * @param allowCreate - If true, adds a "create new" option when no exact match exists
 */
export function getProjectAutocomplete(partial: string, projectNames: string[], allowCreate: boolean = false): AutocompleteOption[] {
  const lowerPartial = partial.toLowerCase()
  const matches: AutocompleteOption[] = projectNames
    .filter((name) => name.toLowerCase().includes(lowerPartial))
    .slice(0, MAX_SUGGESTIONS)
    .map((name) => ({
      type: 'project' as const,
      label: name,
      value: name,
    }))

  // Add "create new" option if create is allowed
  if (allowCreate) {
    const exactMatch = partial && projectNames.some((name) => name.toLowerCase() === lowerPartial)
    if (!exactMatch) {
      matches.push({
        type: 'create-project',
        label: partial ? `+ Create '${partial}'` : '+ New project',
        value: partial,
      })
    }
  }

  return matches
}

/**
 * Path-aware project suggestions for nested projects. Suggests any project whose
 * canonical path (`Parent:Child:Leaf`) contains the typed fragment, plus the
 * descendant split requested for quick capture: when the fragment names a
 * folder, its sub-projects appear as `Folder:SubA`, `Folder:SubB`, …
 */
export function getProjectPathAutocomplete(
  partial: string,
  state: { projects: Array<{ id: string; name: string; parentId: string | null }> },
  allowCreate: boolean = false,
): AutocompleteOption[] {
  const lower = partial.trim().toLocaleLowerCase()
  const result: AutocompleteOption[] = []
  const seen = new Set<string>()

  const add = (label: string) => {
    const key = label.toLocaleLowerCase()
    if (!seen.has(key) && result.length < MAX_SUGGESTIONS) {
      seen.add(key)
      result.push({ type: 'project' as const, label, value: label })
    }
  }

  if (lower) {
    // Direct matches: canonical paths containing the typed fragment.
    for (const project of state.projects) {
      const path = pathOfProject(project, state.projects)
      if (path.toLocaleLowerCase().includes(lower)) add(path)
    }
  }

  // Descendant split (the requested behavior): a fragment naming a folder
  // surfaces that folder's sub-projects: @Client work → @Client work:API docs.
  if (lower) {
    for (const project of state.projects) {
      const path = pathOfProject(project, state.projects)
      // Match the project itself OR a partial leading up to it (e.g. "Client w").
      if (path.toLocaleLowerCase().startsWith(lower)) {
        for (const child of state.projects.filter((candidate) => candidate.parentId === project.id)) {
          add(`${path}:${child.name}`)
        }
      }
    }
  }

  if (allowCreate && partial && !result.some((option) => option.label.toLocaleLowerCase() === lower)) {
    result.push({ type: 'create-project', label: `+ Create '${partial}'`, value: partial })
  }

  return result
}

/** Computes the canonical path for a project within a flat projects array. */
type ProjectLike = { id: string; name: string; parentId: string | null }

function pathOfProject(project: ProjectLike, projects: ProjectLike[]): string {
  const parts: string[] = []
  let current = project
  for (;;) {
    parts.unshift(current.name)
    if (!current.parentId) break
    const parent = projects.find((candidate) => candidate.id === current.parentId)
    if (!parent) break
    current = parent
  }
  return parts.join(':')
}
