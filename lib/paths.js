/**
 * Filesystem layout for session payloads and the plugin's own durable state.
 *
 * DSH's JSONL persistence groups sessions by their creation cwd:
 *   <sessionRoot>/<projectKey(cwd)>/<encodeSegment(sessionId)>/session.v4.jsonl.zstd
 * The plugin does not own that layout; it mirrors only the two documented
 * encoders so a tombstone can move the exact directory the backend created.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

export function dshHome() {
  return process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
}

export function defaultSessionRoot() {
  return path.join(dshHome(), 'sessions')
}

export function defaultTrashRoot() {
  return path.join(dshHome(), 'trash')
}

export function defaultProjectionCacheRoot() {
  return path.join(dshHome(), 'storages', 'session_projcache', 'sessions')
}

export function defaultAuditPath() {
  return path.join(dshHome(), 'conversation-hygiene', 'audit.jsonl')
}

/** Encode one arbitrary code unit the same way the session backend does. */
export function encodeSegment(raw) {
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let index = 0; index < raw.length; index++) {
    const code = raw.charCodeAt(index)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

/** Human-navigable project directory key used by the JSONL backend. */
export function projectKey(cwd) {
  if (cwd.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let index = 0; index < cwd.length; index++) {
    const code = cwd.charCodeAt(index)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

export function projectDir(root, cwd) {
  return cwd === undefined ? path.join(root, '_no-cwd') : path.join(root, projectKey(cwd))
}

export function sessionDir(root, cwd, id) {
  return path.join(projectDir(root, cwd), encodeSegment(id))
}

export async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

export async function isDirectory(target) {
  try {
    return (await fs.stat(target)).isDirectory()
  } catch {
    return false
  }
}

export async function ensureDirectory(target) {
  await fs.mkdir(target, { recursive: true })
}

/**
 * Move one session directory into the trash, falling back to copy+remove when
 * a cross-device rename is refused. Returns the destination.
 */
export async function moveDirectory(source, destination) {
  await ensureDirectory(path.dirname(destination))
  if (await exists(destination)) {
    throw Object.assign(new Error(`目标目录已存在：${destination}`), {
      code: 'payload_conflict',
      path: destination,
    })
  }
  try {
    await fs.rename(source, destination)
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error
    await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false })
    await fs.rm(source, { recursive: true, force: true })
  }
  return destination
}

export async function removeFile(target) {
  await fs.rm(target, { force: true, maxRetries: 3, retryDelay: 40 })
}

export async function removeProjectionCache(cacheRoot, sessionId) {
  if (!cacheRoot) return
  await removeFile(path.join(cacheRoot, `${encodeSegment(sessionId)}.json`)).catch(() => {})
}

/** Atomically replace one JSON document via a same-directory temp file. */
export async function writeJsonAtomic(target, value) {
  await ensureDirectory(path.dirname(target))
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  const body = `${JSON.stringify(value, null, 2)}\n`
  await fs.writeFile(temporary, body, 'utf8')
  await fs.rename(temporary, target)
}

export async function readJson(target, fallback) {
  try {
    const text = await fs.readFile(target, 'utf8')
    return JSON.parse(text)
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}
