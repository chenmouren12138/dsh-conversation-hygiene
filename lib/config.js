/**
 * Runtime configuration for @local/dsh-conversation-hygiene.
 *
 * `Config` is a Standard Schema v1 object: Cordis resolves the plugin row's
 * config with `Config['~standard'].validate(...)`. The `schema` member is the
 * documentation surface for Settings / Plugin Manager; `~standard.validate`
 * is the authority and always yields a complete, clamped policy.
 *
 * The Client half receives only the resolved public capability shape through
 * the same-origin state route. Paths and limits stay on the Host.
 */

export const DEFAULTS = Object.freeze({
  sessionLifecycle: Object.freeze({
    enabled: true,
    batchLimit: 20,
    trashRoot: '',
    sessionRoot: '',
    projectionCacheRoot: '',
  }),
  audit: Object.freeze({
    enabled: true,
    path: '',
  }),
})

const BOUNDS = {
  batchLimit: { min: 1, max: 100 },
}

function issue(message, path) {
  return { message, path }
}

function readBoolean(input, key, fallback, issues, path) {
  const value = input[key]
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') {
    issues.push(issue('expected a boolean', path))
    return fallback
  }
  return value
}

function readString(input, key, fallback, issues, path) {
  const value = input[key]
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') {
    issues.push(issue('expected a string', path))
    return fallback
  }
  return value.trim()
}

function readInteger(input, key, fallback, bound, issues, path) {
  const value = input[key]
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(issue('expected a finite number', path))
    return fallback
  }
  const rounded = Math.round(value)
  if (rounded < bound.min || rounded > bound.max) {
    issues.push(issue(`expected a number between ${bound.min} and ${bound.max}`, path))
    return Math.min(bound.max, Math.max(bound.min, rounded))
  }
  return rounded
}

function readSection(input, key, fallback, issues) {
  const value = input[key]
  if (value === undefined || value === null) return { ...fallback }
  if (typeof value !== 'object' || Array.isArray(value)) {
    issues.push(issue('expected an object', [key]))
    return { ...fallback }
  }
  return value
}

/**
 * Normalize one raw row config into the complete policy used by the Host.
 * Unknown keys are ignored and bounded numbers are clamped.
 */
export function resolveConfig(raw) {
  const issues = []
  const input = raw === undefined || raw === null ? {} : raw
  if (typeof input !== 'object' || Array.isArray(input)) {
    return {
      value: {
        sessionLifecycle: { ...DEFAULTS.sessionLifecycle },
        audit: { ...DEFAULTS.audit },
      },
      issues: [issue('expected an object', [])],
    }
  }

  const lifecycle = readSection(input, 'sessionLifecycle', DEFAULTS.sessionLifecycle, issues)
  const audit = readSection(input, 'audit', DEFAULTS.audit, issues)

  return {
    value: {
      sessionLifecycle: {
        enabled: readBoolean(lifecycle, 'enabled', DEFAULTS.sessionLifecycle.enabled, issues, ['sessionLifecycle', 'enabled']),
        batchLimit: readInteger(lifecycle, 'batchLimit', DEFAULTS.sessionLifecycle.batchLimit, BOUNDS.batchLimit, issues, ['sessionLifecycle', 'batchLimit']),
        trashRoot: readString(lifecycle, 'trashRoot', DEFAULTS.sessionLifecycle.trashRoot, issues, ['sessionLifecycle', 'trashRoot']),
        sessionRoot: readString(lifecycle, 'sessionRoot', DEFAULTS.sessionLifecycle.sessionRoot, issues, ['sessionLifecycle', 'sessionRoot']),
        projectionCacheRoot: readString(lifecycle, 'projectionCacheRoot', DEFAULTS.sessionLifecycle.projectionCacheRoot, issues, ['sessionLifecycle', 'projectionCacheRoot']),
      },
      audit: {
        enabled: readBoolean(audit, 'enabled', DEFAULTS.audit.enabled, issues, ['audit', 'enabled']),
        path: readString(audit, 'path', DEFAULTS.audit.path, issues, ['audit', 'path']),
      },
    },
    issues,
  }
}

/** Public capability snapshot the Client half needs; deliberately no paths. */
export function publicConfig(value) {
  return {
    sessionLifecycle: value.sessionLifecycle.enabled,
    batchLimit: value.sessionLifecycle.batchLimit,
  }
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-conversation-hygiene',
    validate(raw) {
      const { value } = resolveConfig(raw)
      return { value }
    },
  },
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sessionLifecycle: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Enable session soft delete, the tombstone trash view, restore, and purge.',
          },
          batchLimit: {
            type: 'integer',
            minimum: BOUNDS.batchLimit.min,
            maximum: BOUNDS.batchLimit.max,
            description: 'Maximum number of sessions accepted by one batch soft delete.',
          },
          trashRoot: {
            type: 'string',
            description: 'Trash root directory. Empty uses <DSH_HOME>/trash.',
          },
          sessionRoot: {
            type: 'string',
            description: 'Session storage root. Empty uses <DSH_HOME>/sessions.',
          },
          projectionCacheRoot: {
            type: 'string',
            description: 'Projection checkpoint directory. Empty uses <DSH_HOME>/storages/session_projcache/sessions.',
          },
        },
      },
      audit: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Append committed and rejected operations to the plugin audit log.',
          },
          path: {
            type: 'string',
            description: 'Audit JSONL path. Empty uses <DSH_HOME>/conversation-hygiene/audit.jsonl.',
          },
        },
      },
    },
  },
}
