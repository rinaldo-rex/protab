import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { applyCommand } from '../domain/applyCommand'
import { emptyState, type PersistedStateV1 } from '../domain/types'
import type { Command } from '../domain/commands'
import type { WorkspaceClient } from './client'
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

describe('project workspace shell', () => {
  it('loads before showing the first-use state', async () => {
    let release!: (state: PersistedStateV1) => void
    const client = new TestClient()
    client.read = () => new Promise((resolve) => { release = resolve })
    render(<App client={client} />)
    expect(screen.getByRole('heading', { name: 'Loading Protab' })).toBeInTheDocument()
    expect(screen.queryByText('Turn temporary tabs into durable project context.')).not.toBeInTheDocument()
    await act(async () => release(emptyState()))
    expect(await screen.findByText('Turn temporary tabs into durable project context.')).toBeInTheDocument()
  })

  it('creates and selects projects with keyboard-accessible controls', async () => {
    const user = userEvent.setup()
    const client = new TestClient()
    render(<App client={client} />)
    await user.click(await screen.findByRole('button', { name: 'Create first project' }))
    const input = screen.getByLabelText('Project name')
    await user.type(input, 'Design research')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Design research' })).toBeInTheDocument()
    const projectButton = screen.getAllByRole('button', { name: /Design research/ }).find((button) => button.getAttribute('aria-current') === 'page')
    expect(projectButton).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Current Tabs' })).toBeInTheDocument()
    expect(screen.getByText(/Live tabs aren’t connected yet/)).toBeInTheDocument()
  })

  it('shows inline project validation without closing the form', async () => {
    const user = userEvent.setup()
    render(<App client={new TestClient()} />)
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
    render(<App client={client} />)
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
    render(<App client={client} />)
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

  it('enters a blocking storage-error state', async () => {
    const client = new TestClient()
    client.readError = new Error('Unsupported schema version')
    render(<App client={client} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('left untouched')
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
  })
})
