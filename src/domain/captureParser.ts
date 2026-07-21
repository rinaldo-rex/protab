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
 */
export function getProjectAutocomplete(partial: string, projectNames: string[]): AutocompleteOption[] {
  const lowerPartial = partial.toLowerCase()
  return projectNames
    .filter((name) => name.toLowerCase().includes(lowerPartial))
    .slice(0, 8)
    .map((name) => ({
      type: 'project' as const,
      label: name,
      value: name,
    }))
}
