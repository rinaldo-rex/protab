import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { applyCommand } from '../domain/applyCommand'
import { emptyState, type PersistedState } from '../domain/types'
import type { Command } from '../domain/commands'
import type { WorkspaceClient } from './client'
import type { LiveTabsClient } from './useLiveTabs'
import type { LiveTabMessage, LiveTabRequest } from '../background/messages'
import { App } from './App'

class TestClient implements WorkspaceClient {
  state: PersistedState
  listeners = new Set<(state: PersistedState) => void>()
  ids = 0
  readError?: Error

  constructor(state = emptyState()) { this.state = state }
  async read() { if (this.readError) throw this.readError; return structuredClone(this.state) }
  async execute(command: Command) {
    const result = applyCommand(this.state, command, () => `id-${++this.ids}`)
    this.state = result.state
    this.listeners.forEach((listener) => listener(this.state))
    return result
  }
  subscribe(listener: (state: PersistedState) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
}

class TestLiveTabsClient implements LiveTabsClient {
  listeners = new Set<(message: LiveTabMessage) => void>()
  sent: LiveTabRequest[] = []
  constructor(private durableClient?: TestClient) {}
  subscribe(listener: (message: LiveTabMessage) => void) {
    this.listeners.add(listener)
    queueMicrotask(() => listener({ kind: 'LIVE_TAB_INVENTORY', inventory: { windowId: 1, tabs: [], stale: false } }))
    return () => this.listeners.delete(listener)
  }
  send(message: LiveTabRequest) {
    this.sent.push(message)
    if (message.kind === 'DELETE_PROJECT_WITH_LIVE_TABS' && this.durableClient) {
      void this.durableClient.execute({ type: 'DELETE_PROJECT', projectId: message.projectId }).then(({ state }) => this.emit({ kind: 'PROJECT_DELETED', projectId: message.projectId, state }))
    }
  }
  emit(message: LiveTabMessage) { this.listeners.forEach((listener) => listener(message)) }
}

function renderApp(client: TestClient, liveTabsClient = new TestLiveTabsClient(client)) {
  return render(<App client={client} liveTabsClient={liveTabsClient} />)
}

describe('project workspace shell', () => {
  it('loads before showing the first-use state', async () => {
    let release!: (state: PersistedState) => void
    const client = new TestClient()
    client.read = () => new Promise((resolve) => { release = resolve })
    renderApp(client)
    expect(screen.getByRole('heading', { name: 'Loading Protab' })).toBeInTheDocument()
    expect(screen.queryByText('Create a new project, and get focused!')).not.toBeInTheDocument()
    await act(async () => release(emptyState()))
    expect(await screen.findByText('Create a new project, and get focused!')).toBeInTheDocument()
  })

  it('creates and selects projects with keyboard-accessible controls', async () => {
    const user = userEvent.setup()
    const client = new TestClient()
    renderApp(client)
    await user.click(await screen.findByRole('button', { name: 'Create first project' }))
    const input = screen.getByLabelText('Project name')
    await user.type(input, 'Design research')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Design research' })).toBeInTheDocument()
    const projectButton = screen.getAllByRole('button', { name: /Design research/ }).find((button) => button.getAttribute('aria-current') === 'page')
    expect(projectButton).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Current Tabs' })).toBeInTheDocument()
    expect(await screen.findByText(/No ordinary tabs in this window/)).toBeInTheDocument()
  })

  it('shows inline project validation without closing the form', async () => {
    const user = userEvent.setup()
    renderApp(new TestClient())
    await user.click(await screen.findByRole('button', { name: 'New project' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect((await screen.findAllByText('Enter a project name.')).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Project name')).toBeInTheDocument()
  })

  it('renames, reorders, and confirms project deletion via context menu', async () => {
    const user = userEvent.setup()
    const client = new TestClient({
      schemaVersion: 2,
      projects: [
        { id: 'p1', name: 'One', savedUrls: [] },
        { id: 'p2', name: 'Two', savedUrls: [{ id: 'u1', url: 'https://example.com/', title: 'Example', titleSource: 'automatic', tags: [], notes: '', archivedAt: null }] },
      ],
    })
    renderApp(client)
    await user.click(await screen.findByRole('button', { name: /Two/ }))
    // Move up/down removed in Phase 4B (drag-to-reorder)

    // Right-click on the Two project row to open context menu
    const twoButton = screen.getByRole('button', { name: /Two/ })
    fireEvent.contextMenu(twoButton)
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByLabelText('Project name')
    await user.clear(input)
    await user.type(input, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    expect(await screen.findByRole('heading', { name: 'Renamed' })).toBeInTheDocument()

    // Right-click on the Renamed project row for delete
    const renamedButton = screen.getByRole('button', { name: /Renamed/ })
    fireEvent.contextMenu(renamedButton)
    await user.click(await screen.findByRole('menuitem', { name: 'Delete project' }))
    expect(screen.getByText(/its 1 saved URL/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Renamed' })).toBeInTheDocument()

    fireEvent.contextMenu(renamedButton)
    await user.click(await screen.findByRole('menuitem', { name: 'Delete project' }))
    await user.click(screen.getByRole('button', { name: 'Delete project' }))
    expect(await screen.findByRole('heading', { name: 'One' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Renamed/ })).not.toBeInTheDocument()
  })

  it('creates, expands, autosaves, validates, and deletes saved URLs', async () => {
    const user = userEvent.setup()
    const client = new TestClient({ schemaVersion: 2, projects: [{ id: 'p1', name: 'Research', savedUrls: [] }] })
    renderApp(client)
    await screen.findByRole('heading', { name: 'Research' })
    await user.click(screen.getByRole('button', { name: 'Add URL' }))
    await user.type(screen.getByLabelText('URL'), 'https://Example.com/path?x=1#part')
    await user.type(screen.getByLabelText(/Title/), 'Reference')
    await user.type(screen.getByLabelText(/Tags/), 'Design, Research')
    await user.type(screen.getByLabelText(/Notes/), 'Initial note')
    await user.click(screen.getAllByRole('button', { name: 'Add URL' })[1])
    const toggle = (await screen.findAllByRole('button', { name: /Reference/ })).find((button) => button.hasAttribute('aria-controls'))!
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(client.state.projects[0].savedUrls[0]).toMatchObject({ url: 'https://example.com/path?x=1#part', tags: ['Design', 'Research'], notes: 'Initial note' })

    const titleInput = screen.getByLabelText('Title')
    await user.clear(titleInput)
    await user.tab()
    expect((await screen.findAllByText('Enter a title.')).length).toBeGreaterThan(0)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.type(titleInput, 'Updated')
    await user.tab()
    expect(client.state.projects[0].savedUrls[0].title).toBe('Updated')

    const accordion = document.querySelector('[data-record-id]')!
    fireEvent.contextMenu(accordion)
    await user.click(await screen.findByRole('menuitem', { name: 'Delete URL' }))
    await user.click(screen.getByRole('button', { name: 'Delete URL' }))
    expect(await screen.findByText('No saved URLs yet')).toBeInTheDocument()
    expect(client.state.projects[0].savedUrls).toHaveLength(0)
  })

  it('reorders URLs, suggests global tags, and copies metadata snapshots', async () => {
    const user = userEvent.setup()
    const client = new TestClient({
      schemaVersion: 2,
      projects: [
        { id: 'p1', name: 'One', savedUrls: [
          { id: 'u1', url: 'https://one.test/', title: 'One URL', titleSource: 'custom', tags: [], notes: 'Source', archivedAt: null },
          { id: 'u2', url: 'https://two.test/', title: 'Two URL', titleSource: 'automatic', tags: ['GlobalTag'], notes: '', archivedAt: null },
        ] },
        { id: 'p2', name: 'Two', savedUrls: [] },
      ],
    })
    renderApp(client)
    await screen.findByRole('heading', { name: 'One' })
    await user.click(screen.getAllByRole('button', { name: /One URL/ }).find((button) => button.hasAttribute('aria-controls'))!)
    const tagInput = screen.getByLabelText('Add tag')
    await user.type(tagInput, 'glob')
    expect(screen.getByRole('button', { name: 'GlobalTag' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'GlobalTag' }))
    expect(client.state.projects[0].savedUrls[0].tags).toEqual(['GlobalTag'])

    // Context menu available via right-click (tested below)

    const oneAccordion = document.querySelector('[data-record-id="u1"]')!
    fireEvent.contextMenu(oneAccordion)
    await user.click(await screen.findByRole('menuitem', { name: /Copy to project/ }))
    await user.click(screen.getByRole('button', { name: 'Copy URL' }))
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument()
    expect(client.state.projects[1].savedUrls[0]).toMatchObject({ url: 'https://one.test/', title: 'One URL', tags: ['GlobalTag'], notes: 'Source' })
    const copyId = client.state.projects[1].savedUrls[0].id
    expect(copyId).not.toBe('u1')

    await user.clear(screen.getByLabelText('Notes'))
    await user.type(screen.getByLabelText('Notes'), 'Independent')
    await user.tab()
    expect(client.state.projects[0].savedUrls.find((record) => record.id === 'u1')?.notes).toBe('Source')
    expect(client.state.projects[1].savedUrls[0].notes).toBe('Independent')
  })

  it('shows live current-window rows and sends keyboard row activation to the background', async () => {
    const user = userEvent.setup()
    const liveTabs = new TestLiveTabsClient()
    renderApp(new TestClient(), liveTabs)
    await screen.findByText('No ordinary tabs in this window')
    act(() => liveTabs.emit({ kind: 'LIVE_TAB_INVENTORY', inventory: { windowId: 3, stale: false, tabs: [
      { tabId: 12, windowId: 3, index: 0, active: true, title: 'A very useful reference', url: 'https://example.com/reference', urlSummary: 'example.com', hostname: 'example.com', supported: true, candidates: [], chromePinned: false, chromeAudible: false, protectionReasons: [], isProtected: false },
      { tabId: 13, windowId: 3, index: 1, active: false, title: 'Chrome Settings', url: 'chrome://settings/', urlSummary: 'chrome:', supported: false, candidates: [], chromePinned: false, chromeAudible: false, protectionReasons: [], isProtected: false },
    ] } }))
    const row = screen.getByRole('button', { name: /A very useful reference.*Current tab/ })
    expect(row).toHaveAttribute('aria-current', 'page')
    // Unsupported group is pre-collapsed, so check the heading exists
    expect(screen.getByRole('button', { name: /Unsupported/ })).toBeInTheDocument()
    expect(screen.queryByText('Chrome Settings')).not.toBeInTheDocument()
    row.focus()
    await user.keyboard('{Enter}')
    expect(liveTabs.sent).toContainEqual({ kind: 'FOCUS_LIVE_TAB', tabId: 12 })
  })

  it('opens saved URL records and displays owned instance counts', async () => {
    const user = userEvent.setup()
    const liveTabs = new TestLiveTabsClient()
    const client = new TestClient({ schemaVersion: 2, projects: [{ id: 'p1', name: 'One', savedUrls: [{ id: 'u1', url: 'https://one.test/', title: 'One URL', titleSource: 'automatic', tags: [], notes: '', archivedAt: null }] }] })
    renderApp(client, liveTabs)
    await screen.findByRole('heading', { name: 'One' })
    act(() => liveTabs.emit({ kind: 'LIVE_TAB_INVENTORY', inventory: { windowId: 3, stale: false, tabs: [
      { tabId: 15, windowId: 3, index: 0, active: false, title: 'One URL', url: 'https://one.test/', urlSummary: 'one.test', hostname: 'one.test', supported: true, candidates: [], ownership: { projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://one.test/', drifted: false }, chromePinned: false, chromeAudible: false, protectionReasons: [], isProtected: false },
    ] } }))
    expect(screen.getByLabelText('1 open instance')).toBeInTheDocument()
    const accordion = document.querySelector('[data-record-id="u1"]')!
    fireEvent.contextMenu(accordion)
    await user.click(await screen.findByRole('menuitem', { name: 'Open' }))
    expect(liveTabs.sent).toContainEqual({ kind: 'OPEN_SAVED_URL', projectId: 'p1', savedUrlId: 'u1' })
    fireEvent.contextMenu(accordion)
    await user.click(await screen.findByRole('menuitem', { name: 'Open another copy' }))
    expect(liveTabs.sent).toContainEqual({ kind: 'OPEN_SAVED_URL_COPY', projectId: 'p1', savedUrlId: 'u1' })
  })

  it('moves a navigated owned tab into Unassigned while retaining its drift label', async () => {
    const liveTabs = new TestLiveTabsClient()
    const client = new TestClient({ schemaVersion: 2, projects: [{ id: 'p1', name: 'One', savedUrls: [{ id: 'u1', url: 'https://saved.test/', title: 'Saved page', titleSource: 'automatic', tags: [], notes: '', archivedAt: null }] }] })
    renderApp(client, liveTabs)
    await screen.findByRole('heading', { name: 'One' })
    act(() => liveTabs.emit({ kind: 'LIVE_TAB_INVENTORY', inventory: { windowId: 3, stale: false, tabs: [
      { tabId: 15, windowId: 3, index: 0, active: false, title: 'Different page', url: 'https://different.test/', urlSummary: 'different.test', hostname: 'different.test', supported: true, candidates: [], ownership: { projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://saved.test/', drifted: true }, chromePinned: false, chromeAudible: false, protectionReasons: [], isProtected: false },
    ] } }))
    expect(screen.getByRole('button', { name: /Different page.*Navigated from saved URL.*Unassigned/ })).toBeInTheDocument()
    expect(document.getElementById('live-group-unassigned')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('button', { name: /^One1/ })).not.toBeInTheDocument()
  })

  it('assigns an ambiguous matching tab without changing saved metadata', async () => {
    const user = userEvent.setup()
    const liveTabs = new TestLiveTabsClient()
    const client = new TestClient({ schemaVersion: 2, projects: [
      { id: 'p1', name: 'One', savedUrls: [{ id: 'u1', url: 'https://same.test/', title: 'One copy', titleSource: 'custom', tags: ['Keep'], notes: 'Untouched', archivedAt: null }] },
      { id: 'p2', name: 'Two', savedUrls: [{ id: 'u2', url: 'https://same.test/', title: 'Two copy', titleSource: 'automatic', tags: [], notes: '', archivedAt: null }] },
    ] })
    renderApp(client, liveTabs)
    await screen.findByText('No ordinary tabs in this window')
    act(() => liveTabs.emit({ kind: 'LIVE_TAB_INVENTORY', inventory: { windowId: 3, stale: false, tabs: [
      { tabId: 15, windowId: 3, index: 0, active: false, title: 'Same live page', url: 'https://same.test/', urlSummary: 'same.test', hostname: 'same.test', supported: true, candidates: [{ projectId: 'p1', savedUrlId: 'u1' }, { projectId: 'p2', savedUrlId: 'u2' }], chromePinned: false, chromeAudible: false, protectionReasons: [], isProtected: false },
    ] } }))
    expect(screen.getByText('Matches 2 projects — assignment needed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Assign to…' }))
    await user.click(screen.getByRole('button', { name: /Two.*Two copy/ }))
    expect(liveTabs.sent).toContainEqual({ kind: 'ASSIGN_LIVE_TAB', tabId: 15, projectId: 'p2', savedUrlId: 'u2' })
    expect(client.state.projects[0].savedUrls[0]).toMatchObject({ tags: ['Keep'], notes: 'Untouched' })
  })

  it('keeps a stale snapshot visible and offers inventory retry', async () => {
    const user = userEvent.setup()
    const liveTabs = new TestLiveTabsClient()
    renderApp(new TestClient(), liveTabs)
    await screen.findByText('No ordinary tabs in this window')
    act(() => liveTabs.emit({ kind: 'LIVE_TAB_INVENTORY', inventory: { windowId: 3, stale: true, error: 'Tabs permission unavailable', tabs: [
      { tabId: 12, windowId: 3, index: 0, active: false, title: 'Last known tab', url: 'https://example.com/', urlSummary: 'example.com', hostname: 'example.com', supported: true, candidates: [], chromePinned: false, chromeAudible: false, protectionReasons: [], isProtected: false },
    ] } }))
    expect(screen.getByRole('alert')).toHaveTextContent('Tabs permission unavailable')
    expect(screen.getByText('Last known tab')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Retry/ }))
    expect(liveTabs.sent).toContainEqual({ kind: 'RETRY_TAB_INVENTORY' })
  })

  it('enters a blocking storage-error state', async () => {
    const client = new TestClient()
    client.readError = new Error('Unsupported schema version')
    renderApp(client)
    expect(await screen.findByRole('alert')).toHaveTextContent('left untouched')
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
  })
})
