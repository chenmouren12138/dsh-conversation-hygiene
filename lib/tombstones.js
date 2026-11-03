/**
 * Tombstone store: the single source of truth for the trash view.
 *
 * The JSON document is written atomically (temp + rename) and all mutations
 * are serialized through one promise lock, so two clicks can never produce two
 * different tombstone sets or a half-written file. The physical payload lives
 * under `<trashRoot>/sessions/<sessionId>/`; this document only records where
 * it came from and how to put it back.
 */
import { readJson, writeJsonAtomic } from './paths.js'

export const TOMBSTONE_SCHEMA_VERSION = 1

function emptyState() {
  return {
    schemaVersion: TOMBSTONE_SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
    tombstones: {},
  }
}

function clone(value) {
  return structuredClone(value)
}

export class TombstoneStore {
  constructor({ file, logger = console }) {
    this.file = file
    this.logger = logger
    this.state = null
    this.lock = Promise.resolve()
    this.ready = this.load()
  }

  async load() {
    let parsed
    try {
      parsed = await readJson(this.file, null)
    } catch (error) {
      this.logger.error(`[dsh-conversation-hygiene] tombstone file is unreadable: ${error?.message ?? error}`)
      const backup = `${this.file}.corrupt-${Date.now()}`
      await import('node:fs/promises').then((fs) => fs.rename(this.file, backup)).catch(() => {})
      parsed = null
    }
    if (parsed === null) {
      this.state = emptyState()
      await writeJsonAtomic(this.file, this.state).catch((error) => {
        this.logger.error(`[dsh-conversation-hygiene] tombstone init failed: ${error?.message ?? error}`)
      })
      return
    }
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.tombstones !== 'object' || parsed.tombstones === null) {
      throw new Error('tombstone store has an invalid shape')
    }
    if (parsed.schemaVersion !== TOMBSTONE_SCHEMA_VERSION) {
      throw new Error(`unsupported tombstone schemaVersion ${String(parsed.schemaVersion)}`)
    }
    this.state = parsed
  }

  async withLock(operation) {
    const run = this.lock.then(operation, operation)
    this.lock = run.then(() => undefined, () => undefined)
    return run
  }

  async mutate(mutator) {
    await this.ready
    return this.withLock(async () => {
      const draft = clone(this.state)
      const result = await mutator(draft)
      draft.schemaVersion = TOMBSTONE_SCHEMA_VERSION
      draft.updatedAt = new Date().toISOString()
      await writeJsonAtomic(this.file, draft)
      this.state = draft
      return result
    })
  }

  async list() {
    await this.ready
    return this.withLock(async () => Object.values(this.state.tombstones)
      .map((item) => clone(item))
      .sort((left, right) => right.deletedAt - left.deletedAt))
  }

  async get(sessionId) {
    await this.ready
    return this.withLock(async () => {
      const found = this.state.tombstones[sessionId]
      return found === undefined ? undefined : clone(found)
    })
  }

  async put(tombstone) {
    return this.mutate((draft) => {
      draft.tombstones[tombstone.sessionId] = clone(tombstone)
      return clone(tombstone)
    })
  }

  async patch(sessionId, patch) {
    return this.mutate((draft) => {
      const current = draft.tombstones[sessionId]
      if (current === undefined) return undefined
      draft.tombstones[sessionId] = { ...current, ...clone(patch) }
      return clone(draft.tombstones[sessionId])
    })
  }

  async remove(sessionId) {
    return this.mutate((draft) => {
      const existed = draft.tombstones[sessionId] !== undefined
      delete draft.tombstones[sessionId]
      return existed
    })
  }
}
