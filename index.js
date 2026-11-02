/**
 * Host half of @local/dsh-conversation-hygiene.
 *
 * One Cordis package: the Host owns the tombstone store, the audit channel,
 * and a same-origin HTTP bridge for the Client half. Nothing model-facing is
 * registered: this plugin changes the user's own workspace and session trash,
 * never the agent's tool surface.
 */
import path from 'node:path'
import { Config, resolveConfig } from './lib/config.js'
import { AuditService } from './lib/audit.js'
import {
  defaultAuditPath,
  defaultProjectionCacheRoot,
  defaultSessionRoot,
  defaultTrashRoot,
} from './lib/paths.js'
import { TombstoneStore } from './lib/tombstones.js'
import { SessionLifecycle } from './lib/session-lifecycle.js'
import { registerHttp } from './lib/http.js'

export const name = 'dsh-conversation-hygiene'
export const inject = [
  'sessionPersistence',
  'sessionQuery',
  'workspaceRegistry',
]
export { Config }

function absolute(value, fallback) {
  return value === '' ? fallback : path.resolve(value)
}

export function apply(ctx, rawConfig) {
  const { value, issues } = resolveConfig(rawConfig ?? {})
  for (const problem of issues) {
    console.warn(
      `[dsh-conversation-hygiene] config ${(problem.path ?? []).join('.') || '(root)'}: ${problem.message}`,
    )
  }

  const config = {
    sessionLifecycle: {
      ...value.sessionLifecycle,
      trashRoot: absolute(value.sessionLifecycle.trashRoot, defaultTrashRoot()),
      sessionRoot: absolute(value.sessionLifecycle.sessionRoot, defaultSessionRoot()),
      projectionCacheRoot: absolute(
        value.sessionLifecycle.projectionCacheRoot,
        defaultProjectionCacheRoot(),
      ),
    },
    audit: {
      ...value.audit,
      path: absolute(value.audit.path, defaultAuditPath()),
    },
  }

  const audit = new AuditService({ file: config.audit.path, enabled: config.audit.enabled })
  const tombstones = new TombstoneStore({ file: path.join(config.sessionLifecycle.trashRoot, 'tombstones.json') })
  const lifecycle = new SessionLifecycle({
    ctx,
    config: config.sessionLifecycle,
    tombstoneStore: tombstones,
    audit,
  })

  tombstones.ready
    .then(() => lifecycle.preflight())
    .catch((error) => {
      console.error(`[dsh-conversation-hygiene] preflight failed: ${error?.message ?? error}`)
    })

  // A stale `restoring` marker must not survive a crash forever. The interval
  // is owned by the plugin effect, so unload removes it with everything else.
  ctx.effect(() => {
    const timer = setInterval(() => {
      void lifecycle.preflight().catch((error) => {
        console.warn(`[dsh-conversation-hygiene] periodic preflight failed: ${error?.message ?? error}`)
      })
    }, 5 * 60 * 1000)
    timer.unref?.()
    return () => clearInterval(timer)
  }, 'dsh-conversation-hygiene: trash preflight')

  const webServer = ctx.get('webServer')
  if (webServer) {
    registerHttp({ ctx, webServer, lifecycle, audit, config })
  } else {
    console.warn('[dsh-conversation-hygiene] webServer 不可用，Client 无法访问会话卫生接口')
  }

  console.log(
    `[dsh-conversation-hygiene] 已加载：lifecycle=${config.sessionLifecycle.enabled}, `
      + `trash=${config.sessionLifecycle.trashRoot}`,
  )
}
