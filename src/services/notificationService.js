import { useNotificationsStore } from '../stores/notificationsStore'

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

  // Add local notification to notifications store so push notifications
  // appear in the unified in-app notifications list (non-blocking).
  try {
    const notificationsStore = useNotificationsStore()
    notificationsStore.upsertNotification({
      id: item.id,
      type: item.type,
      createdAt: String(item.createdAt),
      data: { message: item.message, code: item.code, details: item.details },
      isRead: false,
    })
  } catch {
    // Keep flow stable if store isn't available yet.
  }

  return item
}

export function subscribeNotifications(listener) {
  if (typeof listener !== 'function') {
    return () => {}
  }

  listeners.add(listener)
  return () => listeners.delete(listener)
}
