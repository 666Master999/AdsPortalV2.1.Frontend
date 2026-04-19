import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as signalR from '@microsoft/signalr'
import { useChatStore } from './chatStore'
import { getApiBaseUrl } from '../config/apiBase'
import { apiClient } from '../api/apiClient'
import { validateApiRequestBody } from '../api/requestContract'

const apiBase = getApiBaseUrl()
const MESSAGE_NOTIFICATION_CANDIDATE_TTL_MS = 30000

function normalizeMessageNotificationCandidate(payload = {}) {
  if (!payload || typeof payload !== 'object') return null

  const conversationId = Number(payload.conversationId)
  const messageId = Number(payload.messageId)
  const senderId = Number(payload.senderId)
  const createdAt = String(payload.createdAt ?? '').trim()

  if (!Number.isFinite(conversationId) || conversationId <= 0) return null
  if (!Number.isFinite(messageId) || messageId <= 0) return null
  if (!Number.isFinite(senderId) || senderId <= 0) return null
  if (!createdAt || typeof payload.isMuted !== 'boolean') return null

  return {
    conversationId: String(conversationId),
    messageId: String(messageId),
    senderId: String(senderId),
    createdAt,
    isMuted: payload.isMuted,
  }
}

function getTokenUserId() {
  try {
    const stored = JSON.parse(localStorage.getItem('user') || 'null')
    if (stored?.id != null) return String(stored.id)
  } catch {}

  try {
    const token = localStorage.getItem('token')
    if (!token) return ''
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return String(payload?.sub ?? '')
  } catch {
    return ''
  }
}

function getActiveConversationIdFromLocation() {
  if (typeof window === 'undefined') return ''
  const match = String(window.location.hash || '').match(/^#\/chat\/([^/?#]+)/)
  return match?.[1] ? String(match[1]) : ''
}

function showBrowserMessageNotification(title, body, conversationId, messageId) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false
  if (Notification.permission !== 'granted') return false

  const notification = new Notification(title, {
    body,
    tag: `chat:${conversationId}:${messageId}`,
  })

  notification.onclick = () => {
    try { window.focus() } catch {}
    window.location.hash = `#/chat/${conversationId}`
    notification.close()
  }

  window.setTimeout(() => notification.close(), 5000)
  return true
}

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref([])
  const unreadCount = computed(() => notifications.value.filter(n => !n.isRead).length)
  // store holds only flat notifications; grouping and UI logic belongs to components

  let connection = null
  const seenMessageNotificationCandidates = new Map()

  function extractNotificationItems(data) {
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.items)) return data.items
    if (Array.isArray(data?.data)) return data.data
    return []
  }

  function toNotification(item = {}) {
    if (!item || typeof item !== 'object') return null

    const id = Number(item.id)
    const type = String(item.type ?? '').trim()
    const createdAt = String(item.createdAt ?? '').trim()

    if (!Number.isFinite(id) || !type || !createdAt) return null

    const preview = item.preview && typeof item.preview === 'object' ? { ...item.preview } : undefined
    const rawData = item.data && typeof item.data === 'object' ? { ...item.data } : undefined
    // Sanitize known private/admin-only fields so public channels don't leak sensitive audit notes.
    let data = rawData
    if (data && typeof data === 'object') {
      const sanitized = { ...data }
      delete sanitized.adminNotes
      delete sanitized.adminNote
      delete sanitized.audit
      delete sanitized.privateNotes
      delete sanitized.internal
      delete sanitized.sensitive
      data = sanitized
    }

    // Keep preview paths raw; UI layer is responsible for resolving media URLs.
    // Normalize adId to a safe numeric value or null to avoid NaN later
    const rawAdId = item.adId ?? item.data?.adId ?? null
    let adId = null
    if (rawAdId != null) {
      const num = Number(rawAdId)
      adId = Number.isFinite(num) && num > 0 ? num : null
    }

    return {
      id,
      type,
      isRead: Boolean(item.isRead),
      createdAt,
      preview,
      data,
      adId,
      reason: item.reason ?? item.data?.reason ?? null,
      adTitle: item.adTitle ?? preview?.title ?? item.data?.adTitle ?? null,
      mainImagePath: item.mainImagePath ?? preview?.mainImagePath ?? null,
      actorName: item.actorName ?? item.data?.actorName ?? null,
    }
  }

  function setNotifications(items = []) {
    notifications.value = (Array.isArray(items) ? items : [])
      .map(item => toNotification(item))
      .filter(Boolean)
  }

  function upsertNotification(item) {
    const notification = toNotification(item)
    if (!notification) return

    const key = String(notification.id)
    notifications.value = [
      notification,
      ...notifications.value.filter(existing => String(existing.id) !== key),
    ]
  }

  function setReadState(ids = []) {
    if (ids.length === 0) {
      notifications.value = notifications.value.map(notification => ({ ...notification, isRead: true }))
      return
    }

    const keySet = new Set(ids.map(id => String(id)))
    notifications.value = notifications.value.map(notification => (
      keySet.has(String(notification.id))
        ? { ...notification, isRead: true }
        : notification
    ))
  }

  async function fetchNotifications() {
    try {
      const data = await apiClient.get('/notifications', {
        errorHandlerOptions: { notify: false },
      })
      setNotifications(extractNotificationItems(data))
    } catch {
      // Keep notification panel silent when request fails.
    }
  }

  async function markRead(ids = []) {
    const normalizedIds = Array.isArray(ids)
      ? ids.map(id => Number(id)).filter(Number.isFinite)
      : []
    validateApiRequestBody('post', '/notifications/read', normalizedIds)
    setReadState(normalizedIds)
    try {
      await apiClient.post('/notifications/read', normalizedIds, {
        errorHandlerOptions: { notify: false },
      })
    } catch {
      // Keep optimistic state and avoid noisy UX on transient failures.
    }
  }

  function isDuplicateMessageNotificationCandidate(candidate) {
    const key = `${candidate.conversationId}:${candidate.messageId}`
    const now = Date.now()

    for (const [existingKey, seenAt] of seenMessageNotificationCandidates.entries()) {
      if (now - seenAt > MESSAGE_NOTIFICATION_CANDIDATE_TTL_MS) {
        seenMessageNotificationCandidates.delete(existingKey)
      }
    }

    if (seenMessageNotificationCandidates.has(key)) return true

    seenMessageNotificationCandidates.set(key, now)
    return false
  }

  async function pushMessageNotificationCandidateToast(candidate) {
    const chatStore = useChatStore()
    const conversation = chatStore.getConversationById(candidate.conversationId)
    const conversationLabel = conversation?.ad?.title || conversation?.companion?.name || `Диалог #${candidate.conversationId}`
    const title = 'Новое сообщение'

    if (typeof document !== 'undefined' && document.hidden) {
      const shown = showBrowserMessageNotification(title, conversationLabel, candidate.conversationId, candidate.messageId)
      if (shown) return
    }

    const { pushNotification } = await import('../services/notificationService')
    pushNotification({
      type: 'info',
      message: `${title}: ${conversationLabel}`,
      code: 'chat-message-notification-candidate',
      details: {
        conversationId: candidate.conversationId,
        messageId: candidate.messageId,
      },
      durationMs: 5000,
    })
  }

  async function handleMessageNotificationCandidate(rawCandidate) {
    const candidate = normalizeMessageNotificationCandidate(rawCandidate)
    if (!candidate) {
      console.warn('[signalr] invalid payload for chat:messageNotificationCandidate', rawCandidate)
      return
    }

    if (candidate.isMuted) return
    if (candidate.senderId === getTokenUserId()) return
    if (candidate.conversationId === getActiveConversationIdFromLocation() && typeof document !== 'undefined' && !document.hidden) return
    if (isDuplicateMessageNotificationCandidate(candidate)) return

    try {
      await pushMessageNotificationCandidateToast(candidate)
    } catch (error) {
      console.error('[signalr] failed to handle chat:messageNotificationCandidate', error, candidate)
    }
  }

  async function connect() {
    if (connection) return
    connection = new signalR.HubConnectionBuilder()
      .withUrl(`${apiBase}/hubs/notifications`, {
        accessTokenFactory: () => localStorage.getItem('token'),
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    // Initial notification list from server (initNotifications event)
    connection.on('initNotifications', (data) => {
      setNotifications(extractNotificationItems(data))
    })

    // Chat events (single contract: chat:...)
    connection.on('chat:message', (data) => {
      useChatStore().applyIncomingMessage(data)
    })

    connection.on('chat:conversationCreated', (data) => {
      useChatStore().applyConversationCreated(data)
    })

    connection.on('chat:conversationUpdated', (data) => {
      useChatStore().applyConversationUpdated(data)
    })

    connection.on('chat:messageNotificationCandidate', (data) => {
      handleMessageNotificationCandidate(data)
    })

    // Some servers may use lowercase event name `chat:conversationupdated`.
    // Register duplicate handler to avoid missing the event and related warnings.
    connection.on('chat:conversationupdated', (data) => {
      useChatStore().applyConversationUpdated(data)
    })

    // Single notification event contract: use `notificationCreated`
    connection.on('notificationCreated', (data) => {
      upsertNotification(data)
    })

    // Domain-specific event: AdRejected (server may emit minimal payload)
    connection.on('AdRejected', (payload) => {
      try {
        // If server pushed a full notification object, upsert it; otherwise refresh list.
        if (payload && typeof payload === 'object' && (payload.id != null || payload.notificationId != null || payload.notification)) {
          upsertNotification(payload.notification ?? payload)
        }
      } catch (e) {
        // ignore
      }

      // Best-effort: refetch server notifications to obtain persisted record (idempotent)
      try {
        fetchNotifications().catch(() => {})
      } catch {}

      // Show a lightweight toast to the user
      try {
        import('../services/notificationService').then(({ pushNotification }) => {
          const reason = payload?.reason || (payload?.data && payload.data.reason) || ''
          pushNotification({
            type: 'info',
            message: `Объявление отклонено${reason ? `: ${reason}` : ''}`,
            code: 'ad-rejected',
            details: { adId: payload?.adId ?? payload?.data?.adId, notificationId: payload?.notificationId ?? payload?.id },
            durationMs: 8000,
          })
        }).catch(() => {})
      } catch {}
    })

    // When reconnecting, refresh server-side unread/summary list to cover missed events.
    if (typeof connection.onreconnected === 'function') {
      connection.onreconnected(() => {
        try {
          fetchNotifications().catch(() => {})
        } catch {
          // swallow
        }
      })
    }

    await connection.start()
    // After connection established, proactively fetch notifications via REST
    // to ensure unread list is up-to-date even if server push was missed.
    try {
      await fetchNotifications()
    } catch {
      // best-effort
    }

    await connection.invoke('RequestNotifications')
  }

  async function disconnect() {
    if (!connection) return
    await connection.stop()
    connection = null
  }
  // Store is intentionally data-only: UI rendering logic lives in components.

  return { notifications, unreadCount, fetchNotifications, markRead, connect, disconnect, handleMessageNotificationCandidate }
})
