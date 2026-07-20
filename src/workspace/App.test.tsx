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
    expect(screen.getByRole('button', { name: /Design research/ })).toHaveAttribute('aria-current', 'page')
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

  it('enters a blocking storage-error state', async () => {
    const client = new TestClient()
    client.readError = new Error('Unsupported schema version')
    render(<App client={client} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('left untouched')
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
  })
})
