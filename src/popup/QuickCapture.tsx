import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { parseCaptureInput, getTagAutocomplete, getProjectPathAutocomplete, type AutocompleteOption } from '../domain/captureParser'
import type { PersistedState } from '../domain/types'
import type { Command } from '../domain/commands'
import { ownerProjectId, pathOf, resolvePath } from '../domain/tree'
import { MESSAGE_CHANNEL, type ClientMessage, type BackgroundResponse } from '../background/messages'
import { ExternalLink } from 'lucide-react'
import { readSettings, DEFAULT_SETTINGS, type ProtabSettings, type WorkspaceShortcut } from '../domain/settings'

function matchesWorkspaceShortcut(event: React.KeyboardEvent, shortcut: WorkspaceShortcut): boolean {
  switch (shortcut) {
    case 'ctrl+enter':
      return event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey
    case 'ctrl+shift+enter':
      return event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey
    case 'alt+enter':
      return event.key === 'Enter' && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
  }
}

function shortcutLabel(shortcut: WorkspaceShortcut): string {
  const isMac = navigator.platform.includes('Mac')
  switch (shortcut) {
    case 'ctrl+enter':
      return isMac ? '⌘↵' : 'Ctrl+↵'
    case 'ctrl+shift+enter':
      return isMac ? '⌘⇧↵' : 'Ctrl+Shift+↵'
    case 'alt+enter':
      return isMac ? '⌥↵' : 'Alt+↵'
  }
}

type Status = 'idle' | 'loading' | 'success' | 'error'

interface ExistingProject {
  name: string
  savedUrlId: string
}

export function QuickCapture() {
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string>()
  const [successProject, setSuccessProject] = useState<string>()
  const [state, setState] = useState<PersistedState>()
  const [settings, setSettings] = useState<ProtabSettings>(DEFAULT_SETTINGS)
  const [autocomplete, setAutocomplete] = useState<AutocompleteOption[]>([])
  const [autocompleteVisible, setAutocompleteVisible] = useState(false)
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [currentTabUrl, setCurrentTabUrl] = useState<string>()
  const [existingProjects, setExistingProjects] = useState<ExistingProject[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autocompleteRef = useRef<HTMLDivElement>(null)

  // Fetch current tab URL
  useEffect(() => {
    const fetchTab = async () => {
      let tab: chrome.tabs.Tab | undefined
      const params = new URLSearchParams(window.location.search)
      const tabIdParam = params.get('tabId')
      if (tabIdParam) {
        try {
          tab = await chrome.tabs.get(Number(tabIdParam))
        } catch {
          // Tab may have been closed
        }
      }
      if (!tab) {
        ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      }
      if (tab?.url) {
        setCurrentTabUrl(tab.url)
      }
    }
    void fetchTab()
  }, [])

  // Fetch state and settings on mount
  useEffect(() => {
    const message: ClientMessage = { channel: MESSAGE_CHANNEL, kind: 'READ_STATE' }
    chrome.runtime.sendMessage(message).then((response: BackgroundResponse) => {
      if (response.ok) {
        setState(response.state)
      }
    })
    void readSettings().then(setSettings)
  }, [])

  // Find existing projects that have this URL
  useEffect(() => {
    if (!state || !currentTabUrl) {
      setExistingProjects([])
      return
    }

    const normalizedUrl = currentTabUrl.replace(/\/$/, '')
    const found: ExistingProject[] = []

    for (const project of state.projects) {
      for (const savedUrl of project.savedUrls) {
        if (savedUrl.url.replace(/\/$/, '') === normalizedUrl && !savedUrl.archivedAt) {
          found.push({ name: pathOf(state, project.id), savedUrlId: savedUrl.id })
          break
        }
      }
    }

    setExistingProjects(found)
  }, [state, currentTabUrl])

  // Auto-close on success after 1.5 seconds
  useEffect(() => {
    if (status === 'success') {
      const timer = setTimeout(() => window.close(), 1500)
      return () => clearTimeout(timer)
    }
  }, [status])

  // Parse input
  const parsed = useMemo(() => parseCaptureInput(input), [input])

  // Get autocomplete suggestions
  useEffect(() => {
    if (!state) return

    const text = input.slice(0, cursorPosition)
    const lastHash = text.lastIndexOf('#')
    const lastAt = text.lastIndexOf('@')

    if (lastHash > lastAt) {
      // We're in a tag context
      const partial = text.slice(lastHash + 1)
      if (!partial.includes(' ')) {
        const allTags = state.projects.flatMap((p) => p.savedUrls.flatMap((u) => u.tags))
        const uniqueTags = [...new Set(allTags)]
        const suggestions = getTagAutocomplete(partial, uniqueTags)
        setAutocomplete(suggestions)
        setAutocompleteVisible(suggestions.length > 0)
        setAutocompleteIndex(-1)
        return
      }
    } else if (lastAt > lastHash) {
      // We're in a project context
      const partial = text.slice(lastAt + 1)
      if (!partial.includes(' ')) {
        const suggestions = getProjectPathAutocomplete(partial, state, settings.allowQuickCaptureCreateProject)
        setAutocomplete(suggestions)
        setAutocompleteVisible(suggestions.length > 0)
        setAutocompleteIndex(-1)
        return
      }
    }

    setAutocompleteVisible(false)
  }, [input, cursorPosition, state, settings.allowQuickCaptureCreateProject])

  const selectAutocomplete = useCallback((option: AutocompleteOption) => {
    const text = input.slice(0, cursorPosition)
    const lastHash = text.lastIndexOf('#')
    const lastAt = text.lastIndexOf('@')

    let newInput: string
    let newCursorPos: number

    if (lastHash > lastAt) {
      // Replace tag
      const before = input.slice(0, lastHash + 1)
      const after = input.slice(cursorPosition)
      newInput = `${before}${option.value} ${after}`
      newCursorPos = lastHash + 1 + option.value.length + 1
    } else {
      // Replace project
      const before = input.slice(0, lastAt + 1)
      const after = input.slice(cursorPosition)
      newInput = `${before}${option.value}${after}`
      newCursorPos = lastAt + 1 + option.value.length
    }

    setInput(newInput)
    setAutocompleteVisible(false)
    setAutocompleteIndex(-1)

    // Focus and set cursor
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }, [input, cursorPosition])

  const handleSubmit = useCallback(async () => {
    if (!parsed.projectName) {
      setErrorMessage(settings.allowQuickCaptureCreateProject
        ? 'Type a project name after @ to save or create one.'
        : 'Please specify a project with @ProjectName.')
      setStatus('error')
      return
    }

    if (!state) {
      setErrorMessage('Extension is loading. Please try again.')
      setStatus('error')
      return
    }

    let project = resolvePath(state, parsed.projectName)
    if (!project) {
      if (!settings.allowQuickCaptureCreateProject) {
        setErrorMessage(`Project '${parsed.projectName}' not found.`)
        setStatus('error')
        return
      }

      // Auto-create the missing path (mkdir -p style). Each created project
      // returns its id, which feeds the next CREATE_SUBPROJECT.
      try {
        const segments = parsed.projectName.split(':').map((segment) => segment.trim()).filter(Boolean)
        let parentId: string | null = null
        for (let index = 0; index < segments.length; index++) {
          const isRoot = index === 0
          const command: Command = isRoot
            ? { type: 'CREATE_PROJECT', name: segments[0] }
            : { type: 'CREATE_SUBPROJECT', parentId: parentId ?? '', name: segments[index] }
          const createMessage: ClientMessage = { channel: MESSAGE_CHANNEL, kind: 'COMMAND', command }
          const createResponse: BackgroundResponse = await chrome.runtime.sendMessage(createMessage)
          if (!createResponse.ok) {
            setErrorMessage(createResponse.error?.message || 'Failed to create that project path.')
            setStatus('error')
            return
          }
          parentId = createResponse.meta?.affectedProjectId ?? parentId
        }
        // Re-read state to get the new project
        const stateMessage: ClientMessage = { channel: MESSAGE_CHANNEL, kind: 'READ_STATE' }
        const stateResponse: BackgroundResponse = await chrome.runtime.sendMessage(stateMessage)
        if (stateResponse.ok) {
          setState(stateResponse.state)
          project = resolvePath(stateResponse.state, parsed.projectName)
        }
        if (!project) {
          setErrorMessage('That project path was created but could not be found.')
          setStatus('error')
          return
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to create that project path.')
        setStatus('error')
        return
      }
    }

    setStatus('loading')
    setErrorMessage(undefined)

    // Get the tab to capture. When the popup opens as a standalone window
    // (Vivaldi, Edge, etc.), the background passes the triggering tab's ID
    // as a URL parameter. In the Chrome popup case, there is no parameter
    // and we fall back to querying the active tab in the current window.
    let tab: chrome.tabs.Tab | undefined
    const params = new URLSearchParams(window.location.search)
    const tabIdParam = params.get('tabId')
    if (tabIdParam) {
      try {
        tab = await chrome.tabs.get(Number(tabIdParam))
      } catch {
        // Tab may have been closed; fall through to query
      }
    }
    if (!tab) {
      ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    }
    if (!tab || !tab.url) {
      setErrorMessage('Could not access current tab.')
      setStatus('error')
      return
    }

    // Send quick capture message
    const message: ClientMessage = {
      channel: MESSAGE_CHANNEL,
      kind: 'COMMAND',
      command: {
        type: 'FILE_LIVE_TAB',
        projectId: project.id,
        url: tab.url,
        capturedTitle: tab.title,
        suggestedTags: parsed.tags,
        notes: parsed.note,
      },
    }

    try {
      const response: BackgroundResponse = await chrome.runtime.sendMessage(message)
      if (response.ok) {
        // If URL already exists, update tags and notes
        const existingSavedUrlId = response.meta?.existingSavedUrlId
        if (existingSavedUrlId && parsed.note) {
          // The record may live in a folder's Misc leaf; use the committed
          // response state to find its actual owner project.
          const committedState = response.state
          const existingRecord = committedState.projects.flatMap((p) => p.savedUrls).find((u) => u.id === existingSavedUrlId)
          const ownerId = ownerProjectId(committedState, existingSavedUrlId) ?? project.id
          if (existingRecord) {
            const newTags = [...new Set([...existingRecord.tags, ...parsed.tags])]
            const newNotes = parsed.note
              ? existingRecord.notes
                ? `${existingRecord.notes}\n---\n${parsed.note}`
                : parsed.note
              : existingRecord.notes

            const updateMessage: ClientMessage = {
              channel: MESSAGE_CHANNEL,
              kind: 'COMMAND',
              command: {
                type: 'UPDATE_SAVED_URL',
                projectId: ownerId,
                savedUrlId: existingSavedUrlId,
                changes: { tags: newTags, notes: newNotes },
              },
            }
            await chrome.runtime.sendMessage(updateMessage)
          }
        }

        setStatus('success')
        setSuccessProject(project.name)
      } else {
        setErrorMessage(response.error?.message || 'Failed to save.')
        setStatus('error')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred.')
      setStatus('error')
    }
  }, [parsed, state, settings.allowQuickCaptureCreateProject])

  const openWorkspace = useCallback(() => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html') })
    window.close()
  }, [])

  const fillProject = useCallback((projectName: string) => {
    // Replace any existing @project or append @project
    const lastAt = input.lastIndexOf('@')
    if (lastAt >= 0) {
      // Replace existing @project
      const before = input.slice(0, lastAt)
      setInput(`${before}@${projectName} `)
    } else {
      // Append @project
      setInput(`${input.trimEnd()} @${projectName} `)
    }
    inputRef.current?.focus()
  }, [input])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (autocompleteVisible) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setAutocompleteIndex((prev) => Math.min(prev + 1, autocomplete.length - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setAutocompleteIndex((prev) => Math.max(prev - 1, -1))
        return
      }
      if (event.key === 'Enter' && autocompleteIndex >= 0) {
        event.preventDefault()
        selectAutocomplete(autocomplete[autocompleteIndex])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setAutocompleteVisible(false)
        setAutocompleteIndex(-1)
        return
      }
    }

    // Workspace shortcut (configurable)
    if (matchesWorkspaceShortcut(event, settings.popupWorkspaceShortcut)) {
      event.preventDefault()
      openWorkspace()
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      window.close()
    }
  }, [autocompleteVisible, autocompleteIndex, autocomplete, selectAutocomplete, handleSubmit, settings.popupWorkspaceShortcut, openWorkspace])

  const handleInput = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value)
    setCursorPosition(event.target.selectionStart ?? 0)
  }, [])

  const handleSelect = useCallback((event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPosition(event.currentTarget.selectionStart ?? 0)
  }, [])

  return (
    <div className="popup-container">
      {status === 'success' ? (
        <div className="popup-success">
          <div className="success-icon">✓</div>
          <p>Saved to {successProject}</p>
        </div>
      ) : (
        <>
          <div className="popup-header">
            <h1>Quick Capture</h1>
          </div>
          <div className="popup-input-container">
            <textarea
              ref={inputRef}
              className="popup-input"
              placeholder="Note #tag @Project"
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onSelect={handleSelect}
              autoFocus
              rows={1}
            />
            {autocompleteVisible && (
              <div className="popup-autocomplete" ref={autocompleteRef}>
                {autocomplete.map((option, index) => (
                  <button
                    key={`${option.type}-${option.value}`}
                    className={`autocomplete-option ${index === autocompleteIndex ? 'selected' : ''}`}
                    onClick={() => selectAutocomplete(option)}
                  >
                    <span className="autocomplete-type">{option.type === 'tag' ? '#' : '@'}</span>
                    <span className="autocomplete-label">{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {status === 'error' && errorMessage && (
            <div className="popup-error" role="alert">
              {errorMessage}
            </div>
          )}
          {existingProjects.length > 0 && (
            <div className="popup-existing-projects">
              <span className="popup-existing-label">Already saved in:</span>
              <div className="popup-existing-list">
                {existingProjects.map((p) => (
                  <button
                    key={p.name}
                    className="popup-existing-chip"
                    onClick={() => fillProject(p.name)}
                    title={`Click to fill @${p.name}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="popup-actions">
            <button
              className="popup-submit"
              onClick={() => void handleSubmit()}
              disabled={status === 'loading' || !input.trim()}
            >
              {status === 'loading' ? 'Saving...' : 'Save'}
            </button>
          </div>
          <div className="popup-footer">
            <small className="popup-hint">Format: <code>note #tag @Project</code></small>
            <button className="popup-workspace-link" onClick={openWorkspace}>
              <ExternalLink size={12} />
              <span>Open workspace</span>
              <kbd className="popup-shortcut-hint">{shortcutLabel(settings.popupWorkspaceShortcut)}</kbd>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
