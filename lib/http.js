/**
 * Same-origin HTTP bridge for the plugin's Client half.
 *
 * Every route is loopback-only and only publishes JSON. The bridge is a thin
 * adapter over the session lifecycle service; it never reaches into session
 * internals that the service did not already validate.
 */
import { publicConfig } from './config.js'
import { HygieneError } from './session-lifecycle.js'

const BASE = '/dsh-conversation-hygiene'
const MAX_BODY = 256 * 1024

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function fail(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500
  sendJson(res, status, {
    ok: false,
    error: {
      code: typeof error?.code === 'string' ? error.code : 'internal_error',
      message: error?.message ?? String(error),
      details: error?.details ?? undefined,
    },
  })
}

function assertLocal(req) {
  const remote = req.socket?.remoteAddress ?? ''
  const loopback = remote === '127.0.0.1'
    || remote === '::1'
    || remote === '::ffff:127.0.0.1'
  if (!loopback) {
    throw new HygieneError('forbidden', '该接口只接受本机回环请求。', {}, 403)
  }
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '') {
    let parsed
    try {
      parsed = new URL(origin)
    } catch {
      throw new HygieneError('forbidden', '请求来源无法识别。', {}, 403)
    }
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '')
    const local = hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname === 'localhost'
      || parsed.protocol === 'app:'
      || parsed.protocol === 'file:'
    if (!local) throw new HygieneError('forbidden', '该接口只接受本机同源请求。', {}, 403)
  }
  return true
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) {
      throw new HygieneError('body_too_large', '请求体过大。', {}, 413)
    }
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  let parsed
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HygieneError('invalid_json', '请求体不是合法 JSON。', {}, 400)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HygieneError('invalid_body', '请求体必须是 JSON 对象。', {}, 400)
  }
  return parsed
}

function stringField(value, name) {
  if (typeof value !== 'string' || value === '') {
    throw new HygieneError('invalid_request', `缺少字段 ${name}。`, { field: name }, 400)
  }
  return value
}

function queryOf(req) {
  return new URL(req.url ?? '/', 'http://127.0.0.1')
}

export function registerHttp({ ctx, webServer, lifecycle, audit, config, logger = console }) {
  const route = (path, handler) => {
    ctx.effect(
      () => webServer.register({ kind: 'exact', path, handler: wrap(handler) }),
      `dsh-conversation-hygiene: ${path}`,
    )
  }

  const wrap = (handler) => async (req, res) => {
    try {
      assertLocal(req)
      await handler(req, res)
    } catch (error) {
      if (error instanceof HygieneError) {
        await audit.record({
          action: 'request.rejected',
          outcome: 'rejected',
          path: req.url,
          code: error.code,
        }).catch(() => {})
        fail(res, error)
      } else {
        logger.error(`[dsh-conversation-hygiene] ${req.method} ${req.url}: ${error?.stack ?? error}`)
        fail(res, new HygieneError('internal_error', '会话卫生操作失败。', {
          message: error?.message ?? String(error),
        }, 500))
      }
    }
  }

  const requireMethod = (req, method) => {
    if (req.method !== method) {
      throw new HygieneError('method_not_allowed', `只支持 ${method}。`, { allow: method }, 405)
    }
  }

  const stateData = async () => {
    const capabilities = publicConfig(config)
    const trash = capabilities.sessionLifecycle
      ? await lifecycle.publicState()
      : { count: 0, items: [], limits: { batchLimit: config.sessionLifecycle.batchLimit } }
    return { capabilities, trash }
  }

  route(`${BASE}/state`, async (req, res) => {
    requireMethod(req, 'GET')
    sendJson(res, 200, { ok: true, data: await stateData() })
  })

  route(`${BASE}/trash/delete`, async (req, res) => {
    requireMethod(req, 'POST')
    const body = await readBody(req)
    const sessionId = stringField(body.sessionId, 'sessionId')
    const tombstone = await lifecycle.softDelete(sessionId, body.deletedBy ?? 'user')
    sendJson(res, 200, { ok: true, data: { items: [tombstone], state: await stateData() } })
  })

  route(`${BASE}/trash/restore`, async (req, res) => {
    requireMethod(req, 'POST')
    const body = await readBody(req)
    if (Array.isArray(body.sessionIds)) {
      const result = await lifecycle.restoreMany(body.sessionIds)
      sendJson(res, 200, { ok: true, data: { ...result, state: await stateData() } })
      return
    }
    const sessionId = stringField(body.sessionId, 'sessionId')
    const result = await lifecycle.restore(sessionId)
    sendJson(res, 200, { ok: true, data: { ...result, state: await stateData() } })
  })

  route(`${BASE}/trash/purge`, async (req, res) => {
    requireMethod(req, 'POST')
    const body = await readBody(req)
    if (Array.isArray(body.sessionIds)) {
      const result = await lifecycle.purgeMany(body.sessionIds, { confirm: body.confirm === true })
      sendJson(res, 200, { ok: true, data: { ...result, state: await stateData() } })
      return
    }
    const sessionId = stringField(body.sessionId, 'sessionId')
    const result = await lifecycle.purgeSingle(sessionId, { confirm: body.confirm === true })
    sendJson(res, 200, { ok: true, data: { ...result, state: await stateData() } })
  })

  route(`${BASE}/trash/purge-all`, async (req, res) => {
    requireMethod(req, 'POST')
    const body = await readBody(req)
    const result = await lifecycle.purgeAll({
      expectedCount: Number.isInteger(body.expectedCount) ? body.expectedCount : undefined,
      confirm: body.confirm === true,
    })
    sendJson(res, 200, { ok: true, data: { ...result, state: await stateData() } })
  })

  route(`${BASE}/audit`, async (req, res) => {
    requireMethod(req, 'GET')
    const url = queryOf(req)
    const raw = Number(url.searchParams.get('limit') ?? 50)
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(500, Math.round(raw))) : 50
    sendJson(res, 200, { ok: true, data: { items: await audit.tail(limit) } })
  })
}
