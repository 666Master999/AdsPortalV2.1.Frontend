import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as signalR from '@microsoft/signalr'
import { useChatStore } from './chatStore'
import { getApiBaseUrl } from '../config/apiBase'
import { apiClient } from '../api/apiClient'
import { validateApiRequestBody } from '../api/requestContract'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'

const apiBase = getApiBaseUrl()

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref([])
  const unreadCount = computed(() => notifications.value.filter(n => !n.isRead).length)
  const notificationEntries = computed(() => {
    const items = Array.isArray(notifications.value) ? notifications.value : []
    const groups = new Map()

    for (const notification of items) {
      const adId = Number(notification?.adId ?? notification?.data?.adId)
      const key = Number.isFinite(adId) && adId > 0 ? `ad:${adId}` : `id:${notification.id}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(notification)
    }

    const entries = []

    for (const [key, list] of groups) {
      const first = list[0]
      const adId = Number(first?.adId ?? first?.data?.adId)

      if (Number.isFinite(adId) && adId > 0 && list.length > 1) {
        entries.push({
          key,
          type: 'NotificationGroup',
          adId,
          notificationIds: list.map(item => item.id),
          isRead: list.every(item => item.isRead),
          createdAt: first.createdAt,
          preview: first.preview,
          data: { count: list.length },
        })
        continue
      }

      entries.push({
        key: `id:${first.id}`,
        type: first.type,
        adId: Number.isFinite(adId) && adId > 0 ? adId : null,
        notificationIds: [first.id],
        isRead: first.isRead,
        createdAt: first.createdAt,
        preview: first.preview,
        data: first.data,
      })
    }

    return entries
  })

  let connection = null

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
    const data = item.data && typeof item.data === 'object' ? { ...item.data } : undefined

    const previewImagePath = preview?.mainImagePath ?? ''

    if (preview && previewImagePath) {
      try {
        preview.mainImagePath = resolveMediaUrl(previewImagePath)
      } catch {
        // keep original if resolution fails
      }
    }
    return {
      id,
      type,
      isRead: Boolean(item.isRead),
      createdAt,
      preview,
      data,
      adId: item.adId ?? item.data?.adId ?? null,
      reason: item.reason ?? item.data?.reason ?? null,
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

    // Some servers may use lowercase event name `chat:conversationupdated`.
    // Register duplicate handler to avoid missing the event and related warnings.
    connection.on('chat:conversationupdated', (data) => {
      useChatStore().applyConversationUpdated(data)
    })

    // Single notification event contract: use `notificationCreated`
    connection.on('notificationCreated', (data) => {
      upsertNotification(data)
    })

    await connection.start()
    await connection.invoke('RequestNotifications')
  }

  async function disconnect() {
    if (!connection) return
    await connection.stop()
    connection = null
  }

  // View-model mapping: map backend notification object to a UI-friendly shape
  function toText(value) {
    return typeof value === 'string'
      ? value.trim()
      : value != null
        ? String(value)
        : ''
  }

  function getEntryAdId(n) {
    const value = Number(n?.adId ?? n?.data?.adId)
    return Number.isFinite(value) && value > 0 ? value : null
  }

  function normalizeImage(image) {
    return typeof image === 'string' && image.trim() ? image.trim() : ''
  }

  function getFieldErrors(value) {
    if (!Array.isArray(value)) return []

    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return null

        const field = toText(item.field)
        const message = toText(item.message)
        if (!field && !message) return null

        return { field, message }
      })
      .filter(Boolean)
  }

  const renderers = {
    NotificationGroup(n) {
      const count = Number(n?.data?.count) || 0

      return {
        title: count > 1 ? `${count} уведомлений` : 'Уведомление',
        subtitle: toText(n?.preview?.title),
        image: normalizeImage(n?.preview?.mainImagePath),
        meta: count > 1 ? `${count} уведомлений по объявлению` : '',
        details: [],
        actionLabel: '',
        action: null,
        variant: 'default',
      }
    },

    AdApproved(n) {
      const actorName = toText(n?.data?.actorName)

      return {
        title: 'Объявление одобрено',
        subtitle: toText(n?.preview?.title),
        image: normalizeImage(n?.preview?.mainImagePath),
        meta: actorName ? `Модератор: ${actorName}` : '',
        details: [],
        actionLabel: '',
        action: null,
        variant: 'success',
      }
    },

    AdRejected(n) {
      const actorName = toText(n?.data?.actorName)
      const reason = toText(n?.data?.reason ?? n?.reason)
      const meta = [actorName ? `Модератор: ${actorName}` : '', reason ? `Причина: ${reason}` : '']
        .filter(Boolean)
        .join(' · ')

      const adId = getEntryAdId(n)

      return {
        title: 'Объявление отклонено',
        subtitle: toText(n?.preview?.title),
        image: normalizeImage(n?.preview?.mainImagePath),
        meta,
        details: getFieldErrors(n?.data?.fieldErrors),
        actionLabel: adId == null ? '' : 'Исправить',
        action: adId == null ? null : { type: 'edit', payload: { adId } },
        variant: 'danger',
      }
    },

    UserBanned() {
      return {
        title: 'Аккаунт заблокирован',
        subtitle: '',
        image: '',
        meta: '',
        details: [],
        actionLabel: '',
        action: null,
        variant: 'danger',
      }
    },

    __default(n) {
      return {
        title: 'Уведомление',
        subtitle: toText(n?.preview?.title),
        image: normalizeImage(n?.preview?.mainImagePath),
        meta: n?.type ? `Тип: ${n.type}` : '',
        details: [],
        actionLabel: '',
        action: null,
        variant: 'default',
      }
    },
  }

  function mapNotificationToView(n) {
    const renderer = renderers[n?.type] || renderers.__default
    const base = renderer(n || {})
    const rawDate = n?.createdAt ?? null

    return {
      id: n?.id ?? null,
      title: base.title,
      subtitle: base.subtitle,
      image: normalizeImage(base.image),
      meta: base.meta || '',
      details: base.details || [],
      actionLabel: base.actionLabel || '',
      action: base.action || null,
      isRead: Boolean(n?.isRead),
      date: rawDate,
      timestamp: rawDate,
      adId: getEntryAdId(n),
      notificationIds: Array.isArray(n?.notificationIds)
        ? n.notificationIds.map(id => Number(id)).filter(Number.isFinite)
        : (Number.isFinite(Number(n?.id)) ? [Number(n.id)] : []),
      variant: base.variant || 'default',
    }
  }

  return { notifications, unreadCount, notificationEntries, fetchNotifications, markRead, connect, disconnect, mapNotificationToView }
})
