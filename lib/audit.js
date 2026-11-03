/**
 * Append-only audit channel shared by both capability domains.
 *
 * Writes are post-commit only: callers append an audit entry after the durable
 * state transition has succeeded (or after a rejection that changed nothing).
 * A failed audit append never rolls back the committed operation; it is logged
 * to the host console instead, because losing the audit sink must not resurrect
 * a deleted session or a restored tombstone.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDirectory } from './paths.js'

export class AuditService {
  constructor({ file, enabled = true }) {
    this.file = file
    this.enabled = enabled
    this.queue = Promise.resolve()
  }

  async record(entry) {
    if (!this.enabled) return { written: false }
    const line = JSON.stringify({
      at: new Date().toISOString(),
      actor: 'user',
      ...entry,
    })
    this.queue = this.queue.then(async () => {
      await ensureDirectory(path.dirname(this.file))
      await fs.appendFile(this.file, `${line}\n`, 'utf8')
    }).catch((error) => {
      console.error(`[dsh-conversation-hygiene] audit append failed: ${error?.message ?? error}`)
    })
    await this.queue
    return { written: true }
  }

  /** Read the newest entries for the optional audit drawer. */
  async tail(limit = 50) {
    try {
      const text = await fs.readFile(this.file, 'utf8')
      const lines = text.split('\n').filter(Boolean)
      const rows = []
      for (const line of lines.slice(-Math.max(1, Math.min(500, limit)))) {
        try {
          rows.push(JSON.parse(line))
        } catch {
          // Ignore a torn line; an audit tail is diagnostic, not the state source.
        }
      }
      return rows.reverse()
    } catch (error) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
  }
}
