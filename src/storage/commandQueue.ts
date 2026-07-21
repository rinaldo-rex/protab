import { applyCommand } from '../domain/applyCommand'
import type { Command, CommandResultMeta } from '../domain/commands'
import type { PersistedState } from '../domain/types'
import { loadState, type StorageAdapter } from './repository'

export interface CommittedCommand {
  state: PersistedState
  meta: CommandResultMeta
}

export class CommandQueue {
  private tail: Promise<void> = Promise.resolve()

  constructor(
    private readonly storage: StorageAdapter,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  execute(command: Command): Promise<CommittedCommand> {
    const operation = this.tail.then(async () => {
      const current = await loadState(this.storage)
      const result = applyCommand(current, command, this.createId)
      if (result.meta.didWrite) await this.storage.set(result.state)
      return result
    })
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  read(): Promise<PersistedState> {
    return this.tail.then(() => loadState(this.storage))
  }
}
