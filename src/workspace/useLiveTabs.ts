import { useEffect, useMemo, useState } from 'react'
import type { LiveTabInventory } from '../domain/liveTabs'
import { LIVE_TAB_PORT, type LiveTabMessage, type LiveTabRequest } from '../background/messages'
import type { PreparedFilingOperation, FilingResult, FilingSummary } from '../background/tabs/filing'
import type { CloseAttempt } from '../background/tabs/closeTracker'

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
  deleteProject: (projectId: string) => void
  deletedProject?: { projectId: string; state: import('../domain/types').PersistedStateV1 }
  dismissActionError: () => void
  // Filing operations
  prepareFileTab: (tabId: number, projectId: string) => void
  confirmFileTab: (operationId: string) => void
  cancelFileOperation: (operationId: string) => void
  retryFileOperation: (operationId: string) => void
  preparedFiling?: PreparedFilingOperation
  filingResult?: FilingResult
  filingPending: boolean
  dismissFilingResult: () => void
  // Bulk filing
  prepareBulkFile: (projectId: string) => void
  confirmBulkFile: (operationId: string, projectId: string) => void
  bulkPrepared?: { operationId: string; eligible: number; projectName: string }
  bulkSummary?: FilingSummary
  bulkPending: boolean
  dismissBulkSummary: () => void
  // Attention
  attentionItems: CloseAttempt[]
  dismissAttention: (operationId: string) => void
  dismissAttentionBanner: () => void
}

export function useLiveTabs(providedClient?: LiveTabsClient): LiveTabsModel {
  const client = useMemo(() => providedClient ?? new ChromeLiveTabsClient(), [providedClient])
  const [inventory, setInventory] = useState<LiveTabInventory>()
  const [actionError, setActionError] = useState<string>()
  const [deletedProject, setDeletedProject] = useState<LiveTabsModel['deletedProject']>()
  const [preparedFiling, setPreparedFiling] = useState<PreparedFilingOperation>()
  const [filingResult, setFilingResult] = useState<FilingResult>()
  const [filingPending, setFilingPending] = useState(false)
  const [bulkPrepared, setBulkPrepared] = useState<LiveTabsModel['bulkPrepared']>()
  const [bulkSummary, setBulkSummary] = useState<FilingSummary>()
  const [bulkPending, setBulkPending] = useState(false)
  const [attentionItems, setAttentionItems] = useState<CloseAttempt[]>([])
  const [attentionDismissed, setAttentionDismissed] = useState(false)

  useEffect(() => client.subscribe((message) => {
    switch (message.kind) {
      case 'LIVE_TAB_INVENTORY':
        setInventory(message.inventory)
        break
      case 'PROJECT_DELETED':
        setDeletedProject({ projectId: message.projectId, state: message.state })
        break
      case 'LIVE_TAB_ACTION_ERROR':
        setActionError(message.message)
        break
      case 'FILING_PREPARED':
        setPreparedFiling(message.operation)
        setFilingPending(false)
        break
      case 'FILING_RESULT':
        setFilingResult(message.result)
        setFilingPending(false)
        setPreparedFiling(undefined)
        break
      case 'BULK_FILING_PREPARED':
        setBulkPrepared({ operationId: message.operationId, eligible: message.eligible, projectName: message.projectName })
        setBulkPending(false)
        break
      case 'FILING_SUMMARY':
        setBulkSummary(message.summary)
        setBulkPending(false)
        setBulkPrepared(undefined)
        break
    }
  }), [client])

  // Track attention items from filing results
  useEffect(() => {
    if (filingResult?.closeState === 'failed' || filingResult?.closeState === 'skipped') {
      const item: CloseAttempt = {
        operationId: filingResult.operationId,
        tabId: filingResult.tabId,
        windowId: 0, // Will be resolved by background
        projectId: filingResult.projectId,
        savedUrlId: filingResult.savedUrlId,
        persistedUrl: '',
        requestedAt: Date.now(),
        state: filingResult.closeState === 'failed' ? 'failed' : 'surviving',
        error: filingResult.error,
      }
      setAttentionItems((prev) => [...prev.filter((i) => i.operationId !== item.operationId), item])
      setAttentionDismissed(false)
    }
  }, [filingResult])

  return {
    status: inventory ? 'ready' : 'loading',
    inventory,
    actionError,
    retry: () => client.send({ kind: 'RETRY_TAB_INVENTORY' }),
    focus: (tabId) => client.send({ kind: 'FOCUS_LIVE_TAB', tabId }),
    assign: (tabId, projectId, savedUrlId) => client.send({ kind: 'ASSIGN_LIVE_TAB', tabId, projectId, savedUrlId }),
    open: (projectId, savedUrlId) => client.send({ kind: 'OPEN_SAVED_URL', projectId, savedUrlId }),
    openCopy: (projectId, savedUrlId) => client.send({ kind: 'OPEN_SAVED_URL_COPY', projectId, savedUrlId }),
    deleteProject: (projectId) => client.send({ kind: 'DELETE_PROJECT_WITH_LIVE_TABS', projectId }),
    deletedProject,
    dismissActionError: () => setActionError(undefined),
    // Filing operations
    prepareFileTab: (tabId, projectId) => {
      setFilingPending(true)
      setFilingResult(undefined)
      client.send({ kind: 'PREPARE_FILE_LIVE_TAB', tabId, projectId })
    },
    confirmFileTab: (operationId) => {
      setFilingPending(true)
      client.send({ kind: 'CONFIRM_FILE_LIVE_TAB', operationId })
    },
    cancelFileOperation: (operationId) => {
      setPreparedFiling(undefined)
      client.send({ kind: 'CANCEL_FILE_OPERATION', operationId })
    },
    retryFileOperation: (operationId) => {
      setFilingPending(true)
      setAttentionItems((prev) => prev.filter((i) => i.operationId !== operationId))
      client.send({ kind: 'RETRY_FILE_OPERATION', operationId })
    },
    preparedFiling,
    filingResult,
    filingPending,
    dismissFilingResult: () => setFilingResult(undefined),
    // Bulk filing
    prepareBulkFile: (projectId) => {
      setBulkPending(true)
      setBulkSummary(undefined)
      client.send({ kind: 'PREPARE_FILE_ALL_UNASSIGNED', projectId })
    },
    confirmBulkFile: (operationId, projectId) => {
      setBulkPending(true)
      client.send({ kind: 'CONFIRM_FILE_ALL_UNASSIGNED', operationId, projectId })
    },
    bulkPrepared,
    bulkSummary,
    bulkPending,
    dismissBulkSummary: () => setBulkSummary(undefined),
    // Attention
    attentionItems: attentionDismissed ? [] : attentionItems,
    dismissAttention: (operationId) => {
      setAttentionItems((prev) => prev.filter((i) => i.operationId !== operationId))
    },
    dismissAttentionBanner: () => setAttentionDismissed(true),
  }
}
