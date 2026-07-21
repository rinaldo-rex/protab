import { useState } from 'react'
import { FolderInput } from 'lucide-react'
import type { LiveTabView } from '../domain/liveTabs'
import type { PersistedState } from '../domain/types'

interface LiveTabFileActionsProps {
  tab: LiveTabView
  state: PersistedState
  pending: boolean
  onFile: (tabId: number, projectId: string) => void
}

export function LiveTabFileActions({ tab, state, pending, onFile }: LiveTabFileActionsProps) {
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  if (state.projects.length === 0) return null

  const handleFileToProject = (projectId: string) => {
    setShowProjectPicker(false)
    onFile(tab.tabId, projectId)
  }

  return (
    <div className="live-tab-file-actions">
      <button
        className="small-button file-tab-button"
        aria-haspopup="dialog"
        aria-expanded={showProjectPicker}
        onClick={() => setShowProjectPicker(!showProjectPicker)}
        disabled={pending}
      >
        <FolderInput size={14} aria-hidden="true" />
        <span>File to project…</span>
      </button>

      {showProjectPicker && (
        <div className="file-project-picker" role="dialog" aria-label="Select project">
          <ul className="file-project-list" role="listbox" aria-label="Projects">
            {state.projects.map((project) => (
              <li key={project.id} role="option">
                <button
                  className="file-project-option"
                  onClick={() => handleFileToProject(project.id)}
                  disabled={pending}
                >
                  {project.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            className="button secondary small-button"
            onClick={() => setShowProjectPicker(false)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
