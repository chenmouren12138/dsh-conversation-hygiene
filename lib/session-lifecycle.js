/**
 * Capability domain A: session lifecycle.
 *
 * A session is soft-deleted in one transaction:
 *   1. archive it in the workspace registry (hides it from every grouping view),
 *   2. move the exact session payload directory into the trash,
 *   3. commit one tombstone that records the original workspace and cwd,
 *   4. drop the stale projection checkpoint.
 * Restore is the inverse; batch restore reuses the same per-session
 * transaction. The original workspace is never substituted: a missing
 * workspace or missing path is a classified failure, not a silent fallback.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  encodeSegment,
  exists,
  isDirectory,
  moveDirectory,
  removeProjectionCache,
  sessionDir,
} from './paths.js'
import { moveToOsRecycleBin } from './recycle-bin.js'
import { TOMBSTONE_SCHEMA_VERSION } from './tombstones.js'

export class HygieneError extends Error {
  constructor(code, message, details = {}, status = 409) {
    super(message)
    this.name = 'HygieneError'
    this.code = code
    this.details = details
    this.status = status
  }
}

function textFromContent(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (block.type === 'tool-call' && typeof block.name === 'string') parts.push(`[${block.name}]`)
    else if (block.type === 'tool-result' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join(' ').replace(/\s+/gu, ' ').trim()
}

function previewOfSurface(surface) {
  for (const event of surface?.events ?? []) {
    if (event.type !== 'user/message') continue
    const text = textFromContent(event.data?.content)
    if (text !== '') return text.slice(0, 160)
  }
  return ''
}

export class SessionLifecycle {
  constructor({ ctx, config, tombstoneStore, audit }) {
    this.ctx = ctx
    this.config = config
    this.store = tombstoneStore
    this.audit = audit
    this.trashSessions = path.join(config.trashRoot, 'sessions')
    this.batchLimit = config.batchLimit
  }

  get enabled() {
    return this.config.enabled
  }

  assertEnabled() {
    if (!this.enabled) {
      throw new HygieneError('domain_disabled', '会话生命周期能力已在配置中关闭。', {}, 403)
    }
  }

  workspaceFor(sessionId) {
    for (const workspace of this.ctx.workspaceRegistry.list()) {
      if (workspace.sessionIds.includes(sessionId)) return workspace
    }
    return undefined
  }

  /**
   * A running Turn is the only hard stop. A Session that is merely open or
   * attached is idle; DSH's workspace activity waterfall is still the final
   * authority, so archiving re-checks real work before anything moves.
   */
  assertNotRunning(sessionId) {
    const agent = this.ctx.get('agents')?.get(sessionId)
    if (agent?.status === 'running') {
      throw new HygieneError('session_live', '会话仍有进行中的回合，请先停止任务后再移入回收站。', { sessionId })
    }
  }

  async readMeta(sessionId) {
    const stat = await this.ctx.sessionPersistence.stat(sessionId)
    if (stat === undefined) return undefined
    let title = ''
    let preview = ''
    try {
      const snapshot = await this.ctx.sessionQuery.readTitle(sessionId)
      if (snapshot !== undefined && typeof snapshot.title === 'string') title = snapshot.title
    } catch {
      // A title is a display nicety, never a transaction precondition.
    }
    try {
      preview = previewOfSurface(await this.ctx.sessionQuery.readSurface(sessionId))
    } catch {
      // Same: the tombstone remains valid with an empty preview.
    }
    return {
      header: stat.header,
      title: title || preview.slice(0, 60) || sessionId,
      preview,
    }
  }

  payloadPathFor(header, sessionId, fallbackCwd) {
    return sessionDir(this.config.sessionRoot, header.cwd ?? fallbackCwd, sessionId)
  }

  trashPathFor(sessionId) {
    return path.join(this.trashSessions, encodeSegment(sessionId))
  }

  async softDelete(sessionId, deletedBy = 'user') {
    this.assertEnabled()
    if (typeof sessionId !== 'string' || sessionId === '') {
      throw new HygieneError('invalid_session_id', '缺少会话标识。', {}, 400)
    }

    const existing = await this.store.get(sessionId)
    if (existing !== undefined) return { ...existing, idempotent: true }

    this.assertNotRunning(sessionId)

    const meta = await this.readMeta(sessionId)
    if (meta === undefined) {
      throw new HygieneError('session_not_found', '找不到该会话的持久化记录。', { sessionId }, 404)
    }
    const workspace = this.workspaceFor(sessionId)
    if (workspace === undefined) {
      throw new HygieneError('workspace_unknown', '该会话不属于任何工作区，无法记录原工作区归位信息。', { sessionId })
    }

    const source = this.payloadPathFor(meta.header, sessionId, workspace.path)
    if (!await exists(source)) {
      throw new HygieneError('payload_missing', '找不到该会话的物理存储目录，未执行删除。', { sessionId, source }, 404)
    }

    const trashPath = this.trashPathFor(sessionId)
    if (await exists(trashPath)) {
      throw new HygieneError('payload_conflict', '回收站中已存在同 ID 的会话目录，请先处理残留。', { sessionId, trashPath })
    }

    const wasArchived = this.ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)
    try {
      await this.ctx.workspaceRegistry.archiveSession(sessionId)
    } catch (error) {
      if (error?.name === 'WorkspaceActiveSessionError') {
        throw new HygieneError('session_live', '会话仍有进行中的回合，已拒绝移入回收站。', { sessionId })
      }
      throw error
    }
    try {
      await moveDirectory(source, trashPath)
    } catch (error) {
      if (!wasArchived) await this.ctx.workspaceRegistry.unarchiveSession(sessionId).catch(() => {})
      throw new HygieneError('payload_move_failed', `移动会话目录失败：${error?.message ?? error}`, { sessionId })
    }

    const tombstone = {
      sessionId,
      originalWorkspaceId: workspace.id,
      originalWorkspaceTitle: workspace.title,
      originalWorkspacePath: workspace.path,
      originalCwd: meta.header.cwd ?? workspace.path,
      originalPayloadPath: source,
      title: meta.title,
      preview: meta.preview,
      deletedAt: Date.now(),
      deletedBy,
      payloadPath: trashPath,
      schemaVersion: TOMBSTONE_SCHEMA_VERSION,
      status: 'active',
      wasArchived,
    }

    try {
      await this.store.put(tombstone)
    } catch (error) {
      await moveDirectory(trashPath, source).catch(() => {})
      if (!wasArchived) await this.ctx.workspaceRegistry.unarchiveSession(sessionId).catch(() => {})
      throw new HygieneError('tombstone_write_failed', `写入墓碑记录失败：${error?.message ?? error}`, { sessionId })
    }

    await removeProjectionCache(this.config.projectionCacheRoot, sessionId)
    await this.audit.record({
      action: 'session.soft-delete',
      outcome: 'committed',
      sessionId,
      workspaceId: workspace.id,
      payloadPath: trashPath,
    })
    return { ...tombstone, idempotent: false }
  }

  async restore(sessionId) {
    this.assertEnabled()
    const tombstone = await this.store.get(sessionId)
    if (tombstone === undefined) {
      return { sessionId, status: 'not_found', idempotent: true }
    }

    const workspace = this.ctx.workspaceRegistry.get(tombstone.originalWorkspaceId)
    if (workspace === undefined) {
      await this.audit.record({
        action: 'session.restore',
        outcome: 'rejected',
        sessionId,
        code: 'workspace_missing',
        workspaceId: tombstone.originalWorkspaceId,
      })
      throw new HygieneError(
        'workspace_missing',
        '原工作区已被删除，无法恢复。插件不会自动降级到默认工作区。',
        { sessionId, workspaceId: tombstone.originalWorkspaceId },
      )
    }
    if (!await isDirectory(workspace.path)) {
      await this.audit.record({
        action: 'session.restore',
        outcome: 'rejected',
        sessionId,
        code: 'workspace_path_missing',
        workspaceId: workspace.id,
      })
      throw new HygieneError(
        'workspace_path_missing',
        '原工作区目录已不存在，无法恢复。插件不会自动降级到默认工作区。',
        { sessionId, workspacePath: workspace.path },
      )
    }
    try {
      await fs.access(workspace.path, fs.constants.W_OK)
    } catch {
      throw new HygieneError('workspace_not_writable', '原工作区当前不可写，无法恢复。', { sessionId, workspacePath: workspace.path })
    }

    const target = sessionDir(
      this.config.sessionRoot,
      tombstone.originalCwd ?? workspace.path,
      sessionId,
    )
    const payloadExists = await exists(tombstone.payloadPath)
    const targetExists = await exists(target)

    if (!payloadExists && targetExists) {
      // A prior restore was interrupted after the payload landed. Finish it
      // idempotently instead of asking the user to restore twice.
      await this.ctx.workspaceRegistry.unarchiveSession(sessionId).catch(() => {})
      await this.store.remove(sessionId)
      await removeProjectionCache(this.config.projectionCacheRoot, sessionId)
      await this.audit.record({ action: 'session.restore', outcome: 'healed', sessionId, workspaceId: workspace.id })
      return { sessionId, status: 'already_restored', idempotent: true }
    }
    if (targetExists) {
      throw new HygieneError('target_conflict', '原位置已存在同 ID 会话，恢复已拒绝以避免覆盖现存会话。', {
        sessionId,
        target,
      })
    }
    if (!payloadExists) {
      await this.store.patch(sessionId, { status: 'missing', lastError: 'payload_missing' })
      throw new HygieneError('payload_missing', '回收站中的会话目录已丢失，无法恢复。', { sessionId, payloadPath: tombstone.payloadPath }, 404)
    }

    await this.store.patch(sessionId, { status: 'restoring', lastError: null })
    let moved = false
    let unarchived = false
    try {
      await moveDirectory(tombstone.payloadPath, target)
      moved = true
      await this.ctx.workspaceRegistry.unarchiveSession(sessionId)
      unarchived = true
      await this.store.remove(sessionId)
      await removeProjectionCache(this.config.projectionCacheRoot, sessionId)
    } catch (error) {
      if (unarchived) {
        await this.ctx.workspaceRegistry.archiveSession(sessionId, { stopActivity: true }).catch(() => {})
      }
      if (moved) {
        await moveDirectory(target, tombstone.payloadPath).catch(() => {})
      }
      await this.store.patch(sessionId, {
        status: 'active',
        lastError: error?.message ?? String(error),
      }).catch(() => {})
      await this.audit.record({
        action: 'session.restore',
        outcome: 'rejected',
        sessionId,
        code: error?.code ?? 'restore_failed',
      })
      throw new HygieneError('restore_failed', `恢复失败：${error?.message ?? error}`, { sessionId })
    }

    await this.audit.record({
      action: 'session.restore',
      outcome: 'committed',
      sessionId,
      workspaceId: workspace.id,
      target,
    })
    return { sessionId, status: 'restored', target }
  }

  /**
   * Restore a selected set one tombstone at a time. Each item is its own
   * transaction; a missing workspace or a target conflict never blocks the
   * other selected sessions.
   */
  async restoreMany(sessionIds) {
    this.assertEnabled()
    const unique = this.normalizeSelection(sessionIds)
    const results = []
    for (const sessionId of unique) {
      try {
        const result = await this.restore(sessionId)
        results.push({ sessionId, ok: true, ...result })
      } catch (error) {
        results.push({
          sessionId,
          ok: false,
          code: error?.code ?? 'restore_failed',
          message: error?.message ?? String(error),
        })
      }
    }
    return {
      results,
      restored: results.filter((row) => row.ok && row.status !== 'not_found').length,
      failed: results.filter((row) => !row.ok).length,
    }
  }

  normalizeSelection(sessionIds) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      throw new HygieneError('empty_selection', '请至少选择一项。', {}, 400)
    }
    const unique = [...new Set(sessionIds.filter((id) => typeof id === 'string' && id !== ''))]
    if (unique.length !== sessionIds.length) {
      throw new HygieneError('duplicate_selection', '选择中包含重复项。', {}, 400)
    }
    if (unique.length > this.batchLimit) {
      throw new HygieneError(
        'batch_limit_exceeded',
        `一次最多处理 ${this.batchLimit} 项。`,
        { limit: this.batchLimit, requested: unique.length },
        400,
      )
    }
    return unique
  }

  async purgeSingle(sessionId, { confirm = false } = {}) {
    this.assertEnabled()
    if (confirm !== true) {
      throw new HygieneError('confirmation_required', '彻底删除需要二次确认。', { sessionId }, 400)
    }
    const tombstone = await this.store.get(sessionId)
    if (tombstone === undefined) {
      return { sessionId, status: 'not_found', idempotent: true }
    }
    try {
      await moveToOsRecycleBin(tombstone.payloadPath)
    } catch (error) {
      await this.audit.record({
        action: 'session.purge',
        outcome: 'rejected',
        sessionId,
        code: error?.code ?? 'purge_failed',
      })
      throw new HygieneError('purge_failed', `移入系统回收站失败：${error?.message ?? error}`, { sessionId })
    }
    await removeProjectionCache(this.config.projectionCacheRoot, sessionId)
    await this.store.remove(sessionId)
    // Deliberately do NOT unarchive a live Session: its in-memory object can
    // outlive the on-disk payload and would otherwise reappear in its original
    // workspace. A cold session has nothing left to reveal, so its stale
    // archive marker can be cleaned safely.
    if (this.ctx.get('sessions')?.get(sessionId) === undefined) {
      await this.ctx.workspaceRegistry.unarchiveSession(sessionId).catch(() => {})
    }
    await this.audit.record({
      action: 'session.purge',
      outcome: 'committed',
      sessionId,
      payloadPath: tombstone.payloadPath,
      recycleBin: true,
    })
    return { sessionId, status: 'purged', recycleBin: true }
  }

  async purgeMany(sessionIds, { confirm = false } = {}) {
    this.assertEnabled()
    if (confirm !== true) {
      throw new HygieneError('confirmation_required', '彻底删除需要二次确认。', {}, 400)
    }
    const unique = this.normalizeSelection(sessionIds)
    const purged = []
    const failed = []
    for (const sessionId of unique) {
      try {
        const result = await this.purgeSingle(sessionId, { confirm: true })
        purged.push(result.sessionId)
      } catch (error) {
        failed.push({
          sessionId,
          code: error?.code ?? 'purge_failed',
          message: error?.message ?? String(error),
        })
      }
    }
    await this.audit.record({
      action: 'session.purge-selection',
      outcome: failed.length === 0 ? 'committed' : 'partial',
      count: purged.length,
      failed,
    })
    return { purged, failed, count: purged.length }
  }

  async purgeAll({ expectedCount, confirm = false } = {}) {
    this.assertEnabled()
    if (confirm !== true) {
      throw new HygieneError('confirmation_required', '清空回收站需要二次确认。', {}, 400)
    }
    const tombstones = await this.store.list()
    if (Number.isInteger(expectedCount) && expectedCount !== tombstones.length) {
      throw new HygieneError('count_mismatch', '回收站数量在确认后发生变化，请刷新后重新确认。', {
        expectedCount,
        actualCount: tombstones.length,
      })
    }
    const purged = []
    const failed = []
    for (const tombstone of tombstones) {
      try {
        await moveToOsRecycleBin(tombstone.payloadPath)
        await removeProjectionCache(this.config.projectionCacheRoot, tombstone.sessionId)
        await this.store.remove(tombstone.sessionId)
        // Keep a live Session archived; clean the marker only once no live
        // object can make the deleted conversation visible again.
        if (this.ctx.get('sessions')?.get(tombstone.sessionId) === undefined) {
          await this.ctx.workspaceRegistry.unarchiveSession(tombstone.sessionId).catch(() => {})
        }
        purged.push(tombstone.sessionId)
      } catch (error) {
        failed.push({
          sessionId: tombstone.sessionId,
          code: error?.code ?? 'purge_failed',
          message: error?.message ?? String(error),
        })
      }
    }
    await this.audit.record({
      action: 'session.purge-all',
      outcome: failed.length === 0 ? 'committed' : 'partial',
      count: purged.length,
      failed,
    })
    return { purged, failed, count: purged.length }
  }

  /**
   * Heal half-completed restores and stale tombstones. Runs once at activation
   * and before every trash read; it is deliberately non-destructive.
   */
  async preflight() {
    const tombstones = await this.store.list()
    for (const tombstone of tombstones) {
      const payloadExists = await exists(tombstone.payloadPath)
      const target = sessionDir(
        this.config.sessionRoot,
        tombstone.originalCwd ?? tombstone.originalWorkspacePath,
        tombstone.sessionId,
      )
      const targetExists = target === undefined ? false : await exists(target)

      if (tombstone.status === 'restoring') {
        if (!payloadExists && targetExists) {
          await this.ctx.workspaceRegistry.unarchiveSession(tombstone.sessionId).catch(() => {})
          await this.store.remove(tombstone.sessionId)
          await removeProjectionCache(this.config.projectionCacheRoot, tombstone.sessionId)
          await this.audit.record({
            action: 'session.restore',
            outcome: 'healed',
            sessionId: tombstone.sessionId,
            reason: 'preflight-stale-restoring',
          })
          continue
        }
        if (payloadExists) {
          await this.store.patch(tombstone.sessionId, { status: 'active', lastError: null })
          continue
        }
      }

      if (!payloadExists && !targetExists && tombstone.status !== 'missing') {
        await this.store.patch(tombstone.sessionId, {
          status: 'missing',
          lastError: 'payload_missing',
        })
      }
    }
    return this.store.list()
  }

  async publicState() {
    await this.preflight()
    const tombstones = await this.store.list()
    return {
      count: tombstones.length,
      items: tombstones.map((tombstone) => ({
        sessionId: tombstone.sessionId,
        title: tombstone.title,
        preview: tombstone.preview,
        originalWorkspaceId: tombstone.originalWorkspaceId,
        originalWorkspaceTitle: tombstone.originalWorkspaceTitle,
        originalWorkspacePath: tombstone.originalWorkspacePath,
        deletedAt: tombstone.deletedAt,
        deletedBy: tombstone.deletedBy,
        status: tombstone.status,
        payloadPath: tombstone.payloadPath,
        schemaVersion: tombstone.schemaVersion,
      })),
      limits: { batchLimit: this.batchLimit },
    }
  }
}
