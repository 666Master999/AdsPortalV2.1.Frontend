const listeners = new Set()
let sequence = 0

function normalizeType(type) {
  const value = String(type || '').trim().toLowerCase()
  if (value === 'success' || value === 'warning' || value === 'info') return value
  return 'error'
}

function normalizeMessage(value) {
  return String(value || '').trim()
}

export function pushNotification(payload = {}) {
  const message = normalizeMessage(payload.message)
  if (!message) return null

  const item = {
    id: String(++sequence),
    type: normalizeType(payload.type),
    message,
    code: String(payload.code || '').trim().toLowerCase(),
    details: payload.details ?? null,
    durationMs: Number(payload.durationMs) > 0 ? Number(payload.durationMs) : null,
    createdAt: Date.now(),
  }

  listeners.forEach((listener) => {
    try {
      listener(item)
    } catch {
      // Ignore listener errors to keep notifications flow stable.
    }
  })

  return item
}

export function subscribeNotifications(listener) {
  if (typeof listener !== 'function') {
    return () => {}
  }

  listeners.add(listener)
  return () => listeners.delete(listener)
}
