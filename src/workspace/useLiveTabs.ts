import { useEffect, useMemo, useState } from 'react'
import type { LiveTabInventory } from '../domain/liveTabs'
import { LIVE_TAB_PORT, type LiveTabMessage, type LiveTabRequest } from '../background/messages'

export interface LiveTabsClient {
  subscribe(listener: (message: LiveTabMessage) => void): () => void
  send(message: LiveTabRequest): void
}

export class ChromeLiveTabsClient implements LiveTabsClient {
  private port?: chrome.runtime.Port

  subscribe(listener: (message: LiveTabMessage) => void): () => void {
    const port = chrome.runtime.connect({ name: LIVE_TAB_PORT })
    this.port = port
    const onMessage = (message: unknown) => listener(message as LiveTabMessage)
    port.onMessage.addListener(onMessage)
    return () => {
      port.onMessage.removeListener(onMessage)
      if (this.port === port) this.port = undefined
      port.disconnect()
    }
  }

  send(message: LiveTabRequest): void {
    this.port?.postMessage(message)
  }
}

export interface LiveTabsModel {
  status: 'loading' | 'ready'
  inventory?: LiveTabInventory
  actionError?: string
  retry: () => void
  focus: (tabId: number) => void
  assign: (tabId: number, projectId: string, savedUrlId: string) => void
  open: (projectId: string, savedUrlId: string) => void
  openCopy: (projectId: string, savedUrlId: string) => void
  dismissActionError: () => void
}

export function useLiveTabs(providedClient?: LiveTabsClient): LiveTabsModel {
  const client = useMemo(() => providedClient ?? new ChromeLiveTabsClient(), [providedClient])
  const [inventory, setInventory] = useState<LiveTabInventory>()
  const [actionError, setActionError] = useState<string>()

  useEffect(() => client.subscribe((message) => {
    if (message.kind === 'LIVE_TAB_INVENTORY') setInventory(message.inventory)
    else setActionError(message.message)
  }), [client])

  return {
    status: inventory ? 'ready' : 'loading',
    inventory,
    actionError,
    retry: () => client.send({ kind: 'RETRY_TAB_INVENTORY' }),
    focus: (tabId) => client.send({ kind: 'FOCUS_LIVE_TAB', tabId }),
    assign: (tabId, projectId, savedUrlId) => client.send({ kind: 'ASSIGN_LIVE_TAB', tabId, projectId, savedUrlId }),
    open: (projectId, savedUrlId) => client.send({ kind: 'OPEN_SAVED_URL', projectId, savedUrlId }),
    openCopy: (projectId, savedUrlId) => client.send({ kind: 'OPEN_SAVED_URL_COPY', projectId, savedUrlId }),
    dismissActionError: () => setActionError(undefined),
  }
}
