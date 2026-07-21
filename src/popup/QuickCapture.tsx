import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { parseCaptureInput, getTagAutocomplete, getProjectAutocomplete, type AutocompleteOption } from '../domain/captureParser'
import type { PersistedState } from '../domain/types'
import { MESSAGE_CHANNEL, type ClientMessage, type BackgroundResponse } from '../background/messages'
import { ExternalLink } from 'lucide-react'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function QuickCapture() {
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string>()
  const [successProject, setSuccessProject] = useState<string>()
  const [state, setState] = useState<PersistedState>()
  const [autocomplete, setAutocomplete] = useState<AutocompleteOption[]>([])
  const [autocompleteVisible, setAutocompleteVisible] = useState(false)
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1)
  const [cursorPosition, setCursorPosition] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autocompleteRef = useRef<HTMLDivElement>(null)

  // Fetch state on mount
  useEffect(() => {
    const message: ClientMessage = { channel: MESSAGE_CHANNEL, kind: 'READ_STATE' }
    chrome.runtime.sendMessage(message).then((response: BackgroundResponse) => {
      if (response.ok) {
        setState(response.state)
      }
    })
  }, [])

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
        const projectNames = state.projects.map((p) => p.name)
        const suggestions = getProjectAutocomplete(partial, projectNames)
        setAutocomplete(suggestions)
        setAutocompleteVisible(suggestions.length > 0)
        setAutocompleteIndex(-1)
        return
      }
    }

    setAutocompleteVisible(false)
  }, [input, cursorPosition, state])

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
      setErrorMessage('Please specify a project with @ProjectName.')
      setStatus('error')
      return
    }

    if (!state) {
      setErrorMessage('Extension is loading. Please try again.')
      setStatus('error')
      return
    }

    const project = state.projects.find((p) => p.name === parsed.projectName)
    if (!project) {
      setErrorMessage(`Project '${parsed.projectName}' not found.`)
      setStatus('error')
      return
    }

    setStatus('loading')
    setErrorMessage(undefined)

    // Get the active tab from the current browser window
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
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
      },
    }

    try {
      const response: BackgroundResponse = await chrome.runtime.sendMessage(message)
      if (response.ok) {
        // If URL already exists, update tags and notes
        const existingSavedUrlId = response.meta?.existingSavedUrlId
        if (existingSavedUrlId && parsed.note) {
          const existingRecord = project.savedUrls.find((u) => u.id === existingSavedUrlId)
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
                projectId: project.id,
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
  }, [parsed, state])

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

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      window.close()
    }
  }, [autocompleteVisible, autocompleteIndex, autocomplete, selectAutocomplete, handleSubmit])

  const handleInput = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value)
    setCursorPosition(event.target.selectionStart ?? 0)
  }, [])

  const handleSelect = useCallback((event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPosition(event.currentTarget.selectionStart ?? 0)
  }, [])

  const openWorkspace = useCallback(() => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html') })
    window.close()
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
            </button>
          </div>
        </>
      )}
    </div>
  )
}
