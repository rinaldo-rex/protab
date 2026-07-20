import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { applyCommand } from '../domain/applyCommand'
import { emptyState, type PersistedStateV1 } from '../domain/types'
import type { Command } from '../domain/commands'
import type { WorkspaceClient } from './client'
import type { LiveTabsClient } from './useLiveTabs'
import type { LiveTabMessage, LiveTabRequest } from '../background/messages'
import { App } from './App'

class TestClient implements WorkspaceClient {
  state: PersistedStateV1
  listeners = new Set<(state: PersistedStateV1) => void>()
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
  subscribe(listener: (state: PersistedStateV1) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
}

class TestLiveTabsClient implements LiveTabsClient {
  listeners = new Set<(message: LiveTabMessage) => void>()
  sent: LiveTabRequest[] = []
  subscribe(listener: (message: LiveTabMessage) => void) {
    this.listeners.add(listener)
    queueMicrotask(() => listener({ kind: 'LIVE_TAB_INVENTORY', inventory: { windowId: 1, tabs: [], stale: false } }))
    return () => this.listeners.delete(listener)
  }
  send(message: LiveTabRequest) { this.sent.push(message) }
  emit(message: LiveTabMessage) { this.listeners.forEach((listener) => listener(message)) }
}

function renderApp(client: TestClient, liveTabsClient = new TestLiveTabsClient()) {
  return render(<App client={client} liveTabsClient={liveTabsClient} />)
}

describe('project workspace shell', () => {
  it('loads before showing the first-use state', async () => {
    let release!: (state: PersistedStateV1) => void
    const client = new TestClient()
    client.read = () => new Promise((resolve) => { release = resolve })
    renderApp(client)
    expect(screen.getByRole('heading', { name: 'Loading Protab' })).toBeInTheDocument()
    expect(screen.queryByText('Turn temporary tabs into durable project context.')).not.toBeInTheDocument()
    await act(async () => release(emptyState()))
    expect(await screen.findByText('Turn temporary tabs into durable project context.')).toBeInTheDocument()
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

  it('renames, reorders, and confirms project deletion', async () => {
    const user = userEvent.setup()
    const client = new TestClient({
      schemaVersion: 1,
      projects: [
        { id: 'p1', name: 'One', savedUrls: [] },
        { id: 'p2', name: 'Two', savedUrls: [{ id: 'u1', url: 'https://example.com/', title: 'Example', titleSource: 'automatic', tags: [], notes: '' }] },
      ],
    })
    renderApp(client)
    await user.click(await screen.findByRole('button', { name: /Two/ }))
    await user.click(screen.getByRole('button', { name: 'Project actions for Two' }))
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect(client.state.projects.map((project) => project.id)).toEqual(['p2', 'p1'])

    await user.click(screen.getByRole('button', { name: 'Project actions for Two' }))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByLabelText('Project name')
    await user.clear(input)
    await user.type(input, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    expect(await screen.findByRole('heading', { name: 'Renamed' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Project actions for Renamed' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete project' }))
    expect(screen.getByText(/its 1 saved URL/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Project actions for Renamed' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Project actions for Renamed' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete project' }))
    await user.click(screen.getByRole('button', { name: 'Delete project' }))
    expect(await screen.findByRole('heading', { name: 'One' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Renamed/ })).not.toBeInTheDocument()
  })

  it('creates, expands, autosaves, validates, and deletes saved URLs', async () => {
    const user = userEvent.setup()
    const client = new TestClient({ schemaVersion: 1, projects: [{ id: 'p1', name: 'Research', savedUrls: [] }] })
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

    await user.click(screen.getByRole('button', { name: 'Saved URL actions for Updated' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete URL' }))
    await user.click(screen.getByRole('button', { name: 'Delete URL' }))
    expect(await screen.findByText('No saved URLs yet')).toBeInTheDocument()
    expect(client.state.projects[0].savedUrls).toHaveLength(0)
  })

  it('reorders URLs, suggests global tags, and copies metadata snapshots', async () => {
    const user = userEvent.setup()
    const client = new TestClient({
      schemaVersion: 1,
      projects: [
        { id: 'p1', name: 'One', savedUrls: [
          { id: 'u1', url: 'https://one.test/', title: 'One URL', titleSource: 'custom', tags: [], notes: 'Source' },
          { id: 'u2', url: 'https://two.test/', title: 'Two URL', titleSource: 'automatic', tags: ['GlobalTag'], notes: '' },
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

    await user.click(screen.getByRole('button', { name: 'Saved URL actions for Two URL' }))
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect(client.state.projects[0].savedUrls.map((record) => record.id)).toEqual(['u2', 'u1'])

    await user.click(screen.getByRole('button', { name: 'Saved URL actions for One URL' }))
    await user.click(screen.getByRole('menuitem', { name: /Copy to project/ }))
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
      { tabId: 12, windowId: 3, index: 0, active: true, title: 'A very useful reference', url: 'https://example.com/reference', urlSummary: 'example.com', hostname: 'example.com', supported: true },
      { tabId: 13, windowId: 3, index: 1, active: false, title: 'Chrome Settings', url: 'chrome://settings/', urlSummary: 'chrome:', supported: false },
    ] } }))
    const row = screen.getByRole('button', { name: /A very useful reference.*Current tab/ })
    expect(row).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Unsupported page — view only')).toBeInTheDocument()
    row.focus()
    await user.keyboard('{Enter}')
    expect(liveTabs.sent).toContainEqual({ kind: 'FOCUS_LIVE_TAB', tabId: 12 })
  })

  it('keeps a stale snapshot visible and offers inventory retry', async () => {
    const user = userEvent.setup()
    const liveTabs = new TestLiveTabsClient()
    renderApp(new TestClient(), liveTabs)
    await screen.findByText('No ordinary tabs in this window')
    act(() => liveTabs.emit({ kind: 'LIVE_TAB_INVENTORY', inventory: { windowId: 3, stale: true, error: 'Tabs permission unavailable', tabs: [
      { tabId: 12, windowId: 3, index: 0, active: false, title: 'Last known tab', url: 'https://example.com/', urlSummary: 'example.com', hostname: 'example.com', supported: true },
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
