import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Command, CommandResultMeta } from '../domain/commands'
import type { PersistedState } from '../domain/types'
import type { WorkspaceClient } from './client'

export interface WorkspaceModel {
  status: 'loading' | 'ready' | 'storage-error'
  state?: PersistedState
  selectedProjectId?: string
  error?: string
  commandPending: boolean
  selectProject: (id: string) => void
  execute: (command: Command) => Promise<CommandResultMeta>
  dismissError: () => void
}

function chooseSelection(previousId: string | undefined, state: PersistedState): string | undefined {
  if (previousId && state.projects.some((project) => project.id === previousId)) return previousId
  // Skip Trash when auto-selecting on first load
  const firstNonTrash = state.projects.find((p) => p.name !== 'Trash')
  return firstNonTrash?.id
}

export function useWorkspace(client: WorkspaceClient): WorkspaceModel {
  const [status, setStatus] = useState<WorkspaceModel['status']>('loading')
  const [state, setState] = useState<PersistedState>()
  const [selectedProjectId, setSelectedProjectId] = useState<string>()
  const [error, setError] = useState<string>()
  const [commandPending, setCommandPending] = useState(false)

  useEffect(() => {
    let mounted = true
    void client.read().then(
      (loaded) => {
        if (!mounted) return
        setState(loaded)
        setSelectedProjectId((id) => chooseSelection(id, loaded))
        setStatus('ready')
      },
      (reason: unknown) => {
        if (!mounted) return
        setError(reason instanceof Error ? reason.message : 'Protab could not read local storage.')
        setStatus('storage-error')
      },
    )
    const unsubscribe = client.subscribe((committed) => {
      if (!mounted) return
      setState(committed)
      setSelectedProjectId((id) => chooseSelection(id, committed))
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [client])

  const execute = useMemo(
    () => async (command: Command) => {
      setCommandPending(true)
      try {
        const result = await client.execute(command)
        flushSync(() => {
          setState(result.state)
          setSelectedProjectId((id) => {
            if (command.type === 'CREATE_PROJECT') return result.meta.affectedProjectId
            return chooseSelection(id, result.state)
          })
          setError(undefined)
        })
        return result.meta
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Protab could not save your change.')
        throw reason
      } finally {
        setCommandPending(false)
      }
    },
    [client],
  )

  return {
    status,
    state,
    selectedProjectId,
    error,
    commandPending,
    selectProject: setSelectedProjectId,
    execute,
    dismissError: () => setError(undefined),
  }
}
